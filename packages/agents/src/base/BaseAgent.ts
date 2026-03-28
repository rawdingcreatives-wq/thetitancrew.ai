/**
 * TradeBrain · BaseAgent
 * Abstract foundation for all TradeBrain agents.
 * Every agent extends this — guardrails, memory, HIL, and telemetry are baked in.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentMemory } from "./AgentMemory";
import { HILGate, HILRequest } from "./HILGate";
import { AuditLogger } from "../guardrails/AuditLogger";
import { CostGovernor } from "../guardrails/CostGovernor";
import { LiabilityFilter } from "../guardrails/LiabilityFilter";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AgentType =
  | "scheduler"
  | "parts_inventory"
  | "customer_comm"
  | "finance_invoice"
  | "foreman_predictor"
  | "tech_dispatch"
  | "lead_hunter"
  | "demo_creator"
  | "onboarder"
  | "performance_optimizer"
  | "billing_churn_preventer";

export interface AgentConfig {
  accountId: string;
  agentType: AgentType;
  agentInstanceId: string;
  model?: string;
  maxTokensPerRun?: number;
  maxCostPerRunUsd?: number;
  systemPromptOverride?: string;
  enableHIL?: boolean;
  dryRun?: boolean; // If true, log actions but don't execute
}

export interface AgentRunContext {
  runId: string;
  triggerEvent?: string;
  runType: "scheduled" | "triggered" | "manual";
  payload?: Record<string, unknown>;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, ctx: AgentRunContext) => Promise<unknown>;
  riskLevel?: "low" | "medium" | "high" | "critical";
  requiresHIL?: boolean;
  hilThresholdUsd?: number; // Auto-require HIL if action value > this
}

export interface AgentRunResult {
  runId: string;
  success: boolean;
  actionsTaken: ActionRecord[];
  outputSummary: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

export interface ActionRecord {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  riskLevel: string;
  hilApproved?: boolean;
  timestamp: string;
}

// ─────────────────────────────────────────────
// BaseAgent
// ─────────────────────────────────────────────

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected client: Anthropic;
  protected supabase: ReturnType<typeof createClient<Database>>;
  protected memory: AgentMemory;
  protected hilGate: HILGate;
  protected auditLogger: AuditLogger;
  protected costGovernor: CostGovernor;
  protected liabilityFilter: LiabilityFilter;
  protected tools: Map<string, AgentTool> = new Map();

  // Telemetry for current run
  private runInputTokens = 0;
  private runOutputTokens = 0;
  private runActions: ActionRecord[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      model: "claude-sonnet-4-6",
      maxTokensPerRun: 8000,
      maxCostPerRunUsd: 0.5,
      enableHIL: true,
      dryRun: false,
      ...config,
    };

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.memory = new AgentMemory(this.supabase, config.accountId);
    this.hilGate = new HILGate(this.supabase, config.accountId);
    this.auditLogger = new AuditLogger(this.supabase);
    this.costGovernor = new CostGovernor(this.supabase, config.accountId, config.agentType);
    this.liabilityFilter = new LiabilityFilter();

    // Register this agent's tools
    this.registerTools();
  }

  // ─── Abstract methods every agent must implement ───

  /** Return the agent's system prompt */
  protected abstract getSystemPrompt(): string;

  /** Register all tools this agent can use */
  protected abstract registerTools(): void;

  /** Main agent logic — called after setup */
  protected abstract buildMessages(
    ctx: AgentRunContext,
    accountData: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]>;

  // ─── Tool registration helper ───

  protected addTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  // ─── Core run loop ───

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    this.runInputTokens = 0;
    this.runOutputTokens = 0;
    this.runActions = [];

    // 1. Check cost budget
    const budgetOk = await this.costGovernor.checkBudget();
    if (!budgetOk) {
      await this.updateAgentStatus("error", "Monthly token budget exceeded");
      return this.buildErrorResult(ctx.runId, "Monthly token budget exceeded", startTime);
    }

    // 2. Update agent status
    await this.updateAgentStatus("running");

    // 3. Fetch account snapshot
    const accountData = await this.fetchAccountSnapshot();
    if (!accountData) {
      return this.buildErrorResult(ctx.runId, "Account not found or inactive", startTime);
    }

    try {
      // 4. Build initial messages
      const messages = await this.buildMessages(ctx, accountData);

      // 5. Agentic loop with tool use
      const result = await this.agenticLoop(messages, ctx);

      // 6. Persist run record
      const durationMs = Date.now() - startTime;
      await this.persistRunRecord(ctx, result.outputSummary, durationMs, null);

      // 7. Update agent status
      await this.updateAgentStatus("idle");

      return {
        runId: ctx.runId,
        success: true,
        actionsTaken: this.runActions,
        outputSummary: result.outputSummary,
        inputTokens: this.runInputTokens,
        outputTokens: this.runOutputTokens,
        costUsd: this.estimateCost(),
        durationMs,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      await this.persistRunRecord(ctx, "", durationMs, errMsg);
      await this.updateAgentStatus("error", errMsg);
      return this.buildErrorResult(ctx.runId, errMsg, startTime);
    }
  }

  // ─── Agentic loop (handles multi-turn tool use) ───

  private async agenticLoop(
    messages: Anthropic.MessageParam[],
    ctx: AgentRunContext
  ): Promise<{ outputSummary: string }> {
    const anthropicTools = this.buildAnthropicToolDefs();
    let currentMessages = [...messages];
    let finalText = "";
    let iterations = 0;
    const maxIterations = 10; // Safety cap

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.config.model!,
        max_tokens: this.config.maxTokensPerRun!,
        system: this.getSystemPromptWithInjections(),
        messages: currentMessages,
        tools: anthropicTools,
      });

      // Track token usage
      this.runInputTokens += response.usage.input_tokens;
      this.runOutputTokens += response.usage.output_tokens;

      // Check cost ceiling mid-run
      if (this.estimateCost() > this.config.maxCostPerRunUsd!) {
        throw new Error(`Cost ceiling hit mid-run: $${this.estimateCost().toFixed(4)}`);
      }

      // Collect text output
      const textBlocks = response.content.filter((b) => b.type === "text");
      if (textBlocks.length > 0) {
        finalText = textBlocks.map((b) => (b as Anthropic.TextBlock).text).join("\n");
      }

      // If model is done (no tool use), exit loop
      if (response.stop_reason === "end_turn") {
        break;
      }

      // Process tool calls
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b) => b.type === "tool_use"
        ) as Anthropic.ToolUseBlock[];

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolUseBlocks) {
          const result = await this.executeTool(
            toolCall.name,
            toolCall.input as Record<string, unknown>,
            ctx
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        // Append assistant response + tool results to message history
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
      } else {
        break;
      }
    }

    return { outputSummary: finalText || "Agent completed run with no text output." };
  }

  // ─── Tool execution with guardrails ───

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    ctx: AgentRunContext
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Tool "${name}" not found` };
    }

    const riskLevel = tool.riskLevel ?? "low";

    // Liability pre-flight check
    const liabilityCheck = this.liabilityFilter.check(name, input);
    if (!liabilityCheck.allowed) {
      await this.auditLogger.log({
        accountId: this.config.accountId,
        action: `BLOCKED:${name}`,
        entityType: "agent_action",
        metadata: { reason: liabilityCheck.reason, input },
      });
      return { error: `Action blocked: ${liabilityCheck.reason}` };
    }

    // Human-in-loop gate
    const needsHIL =
      this.config.enableHIL &&
      (tool.requiresHIL ||
        (tool.hilThresholdUsd !== undefined &&
          typeof input.amount === "number" &&
          input.amount > tool.hilThresholdUsd));

    if (needsHIL && !this.config.dryRun) {
      const hilRequest: HILRequest = {
        accountId: this.config.accountId,
        actionType: name,
        riskLevel: riskLevel as "low" | "medium" | "high" | "critical",
        description: `Agent "${this.config.agentType}" wants to execute: ${tool.description}`,
        amount: typeof input.amount === "number" ? input.amount : undefined,
        payload: input,
      };

      const approved = await this.hilGate.requestConfirmation(hilRequest);
      if (!approved) {
        return { error: "Action rejected by owner via SMS confirmation" };
      }
    }

    // Dry-run mode — log but don't execute
    if (this.config.dryRun) {
      console.log(`[DRY RUN] Would execute tool: ${name}`, input);
      return { dryRun: true, wouldExecute: name, input };
    }

    // Execute the tool
    let output: unknown;
    let error: string | undefined;

    try {
      output = await tool.handler(input, ctx);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      output = { error };
    }

    // Record action
    const action: ActionRecord = {
      tool: name,
      input,
      output,
      riskLevel,
      hilApproved: needsHIL,
      timestamp: new Date().toISOString(),
    };
    this.runActions.push(action);

    // Audit log
    await this.auditLogger.log({
      accountId: this.config.accountId,
      action: name,
      entityType: "agent_action",
      afterState: { output, error },
      metadata: { input, agentType: this.config.agentType },
    });

    return output;
  }

  // ─── Helpers ───

  private getSystemPromptWithInjections(): string {
    const base = this.config.systemPromptOverride ?? this.getSystemPrompt();
    const guardrailInjection = `

[SYSTEM GUARDRAILS — NON-NEGOTIABLE]
- You are an AI agent for a trade contractor business. You assist with business operations.
- You do NOT provide legal, medical, or financial advice.
- For any financial action > $50, you MUST call the "request_hil_confirmation" tool before proceeding.
- For any SMS/voice outreach, verify TCPA compliance before calling Twilio tools.
- Never store or log personally identifiable information beyond what the tools require.
- If uncertain about an action's safety or legality, take no action and explain in your output.
- Your actions are audited. Act as if every action will be reviewed by a compliance officer.
`;
    return base + guardrailInjection;
  }

  private buildAnthropicToolDefs(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
    }));
  }

  protected async fetchAccountSnapshot(): Promise<AccountSnapshot | null> {
    const { data } = await this.supabase
      .from("accounts")
      .select(
        "id, business_name, trade_type, timezone, plan, integrations, notification_prefs, tech_count, avg_job_value"
      )
      .eq("id", this.config.accountId)
      .eq("subscription_status", "active")
      .single();

    if (!data) return null;
    return data as AccountSnapshot;
  }

  private async updateAgentStatus(
    status: "idle" | "running" | "waiting_human" | "error",
    lastError?: string
  ): Promise<void> {
    await this.supabase
      .from("agent_instances")
      .update({
        status,
        last_run_at: new Date().toISOString(),
        last_error: lastError ?? null,
      })
      .eq("id", this.config.agentInstanceId);
  }

  private async persistRunRecord(
    ctx: AgentRunContext,
    outputSummary: string,
    durationMs: number,
    errorMessage: string | null
  ): Promise<void> {
    await this.supabase.from("agent_runs").insert({
      id: ctx.runId,
      agent_id: this.config.agentInstanceId,
      account_id: this.config.accountId,
      run_type: ctx.runType,
      trigger_event: ctx.triggerEvent,
      status: errorMessage ? "failed" : "success",
      started_at: new Date(Date.now() - 1).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      input_tokens: this.runInputTokens,
      output_tokens: this.runOutputTokens,
      cost_usd: this.estimateCost(),
      model_used: this.config.model,
      actions_taken: this.runActions as unknown as never,
      output_summary: outputSummary,
      error_message: errorMessage,
    });

    // Update cost governor
    await this.costGovernor.recordUsage(this.estimateCost());
  }

  private estimateCost(): number {
    // Claude Sonnet pricing: ~$3/M input, $15/M output
    const inputCost = (this.runInputTokens / 1_000_000) * 3.0;
    const outputCost = (this.runOutputTokens / 1_000_000) * 15.0;
    return inputCost + outputCost;
  }

  private buildErrorResult(
    runId: string,
    error: string,
    startTime: number
  ): AgentRunResult {
    return {
      runId,
      success: false,
      actionsTaken: [],
      outputSummary: "",
      inputTokens: this.runInputTokens,
      outputTokens: this.runOutputTokens,
      costUsd: this.estimateCost(),
      durationMs: Date.now() - startTime,
      error,
    };
  }
}

// ─────────────────────────────────────────────
// Supporting types
// ─────────────────────────────────────────────

export interface AccountSnapshot {
  id: string;
  business_name: string;
  trade_type: string;
  timezone: string;
  plan: string;
  integrations: Record<string, unknown>;
  notification_prefs: Record<string, unknown>;
  tech_count: number;
  avg_job_value: number;
}
