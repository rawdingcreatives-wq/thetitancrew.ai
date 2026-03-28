/**
 * TradeBrain · CustomerCrewOrchestrator
 * Master orchestrator for the customer-facing agent crew.
 * Uses a LangGraph-style state machine to coordinate all 5-6 agents.
 *
 * State graph:
 *   START → Foreman (assess) → route to: Scheduler | CommAgent | Finance | Parts | Dispatch
 *   Each node runs its agent, emits events, returns to Foreman for next decision
 *   END when Foreman reports "all tasks complete"
 */

import { SchedulerAgent } from "./SchedulerAgent";
import { PartsInventoryAgent } from "./PartsInventoryAgent";
import { CustomerCommAgent } from "./CustomerCommAgent";
import { FinanceInvoiceAgent } from "./FinanceInvoiceAgent";
import { ForemanPredictorAgent } from "./ForemanPredictorAgent";
import { TechDispatchAgent } from "./TechDispatchAgent";
import type { AgentConfig, AgentRunResult } from "../base/BaseAgent";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";

// ─────────────────────────────────────────────
// Graph State
// ─────────────────────────────────────────────

export type CrewNode =
  | "foreman"
  | "scheduler"
  | "parts"
  | "comm"
  | "finance"
  | "dispatch"
  | "end";

export interface CrewState {
  accountId: string;
  runId: string;
  triggerEvent: string;
  payload: Record<string, unknown>;
  currentNode: CrewNode;
  completedNodes: CrewNode[];
  nodeResults: Partial<Record<CrewNode, AgentRunResult>>;
  totalCostUsd: number;
  startTime: number;
  errors: string[];
  shouldEnd: boolean;
}

export type TriggerEvent =
  | "daily_morning_sweep"    // 6am daily: foreman → all agents
  | "job_completed"          // Job status → completed → trigger finance + comm
  | "new_job_lead"           // New lead → scheduler
  | "low_stock_alert"        // Inventory threshold crossed → parts agent
  | "invoice_overdue"        // X days past due → finance agent
  | "morning_dispatch"       // 6:30am dispatch → dispatch agent (Pro)
  | "reengagement_sweep"     // Weekly: comm agent runs re-engagement
  | "manual_trigger";        // Owner dashboard: manual run

// ─────────────────────────────────────────────
// Route map: trigger → which agents to run
// ─────────────────────────────────────────────

const TRIGGER_ROUTES: Record<TriggerEvent, CrewNode[]> = {
  daily_morning_sweep: ["foreman", "scheduler", "parts", "finance", "comm"],
  job_completed: ["finance", "comm"],
  new_job_lead: ["scheduler"],
  low_stock_alert: ["parts"],
  invoice_overdue: ["finance"],
  morning_dispatch: ["dispatch"],
  reengagement_sweep: ["comm"],
  manual_trigger: ["foreman"],
};

// ─────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────

export class CustomerCrewOrchestrator {
  private accountId: string;
  private supabase: ReturnType<typeof createClient<Database>>;
  private planTier: "basic" | "pro";

  constructor(accountId: string, planTier: "basic" | "pro" = "basic") {
    this.accountId = accountId;
    this.planTier = planTier;
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Main entry point. Runs the crew graph for a given trigger event.
   */
  async run(
    triggerEvent: TriggerEvent,
    payload: Record<string, unknown> = {}
  ): Promise<CrewOrchestrationResult> {
    const runId = crypto.randomUUID();
    const startTime = Date.now();

    const state: CrewState = {
      accountId: this.accountId,
      runId,
      triggerEvent,
      payload,
      currentNode: "foreman",
      completedNodes: [],
      nodeResults: {},
      totalCostUsd: 0,
      startTime,
      errors: [],
      shouldEnd: false,
    };

    console.log(`[Crew:${this.accountId}] Starting run ${runId} for trigger: ${triggerEvent}`);

    try {
      const result = await this.executeGraph(state);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Crew:${this.accountId}] Graph execution failed:`, errMsg);
      return {
        runId,
        success: false,
        nodesExecuted: state.completedNodes,
        totalCostUsd: state.totalCostUsd,
        durationMs: Date.now() - startTime,
        errors: [errMsg],
        nodeResults: state.nodeResults,
      };
    }
  }

  // ─── Graph execution engine ───────────────────────────────

  private async executeGraph(state: CrewState): Promise<CrewOrchestrationResult> {
    const plannedNodes = TRIGGER_ROUTES[state.triggerEvent as TriggerEvent] ??
      TRIGGER_ROUTES.manual_trigger;

    // Filter out dispatch agent for Basic tier
    const eligibleNodes = plannedNodes.filter(
      (node) => !(node === "dispatch" && this.planTier === "basic")
    );

    // Execute nodes in planned sequence, with error isolation
    for (const node of eligibleNodes) {
      if (state.shouldEnd) break;

      state.currentNode = node;
      console.log(`[Crew:${this.accountId}] Executing node: ${node}`);

      try {
        const result = await this.executeNode(node, state);
        state.nodeResults[node] = result;
        state.completedNodes.push(node);
        state.totalCostUsd += result.costUsd ?? 0;

        if (!result.success) {
          state.errors.push(`${node}: ${result.error}`);
          // Continue to next node even on failure (isolated errors)
        }
      } catch (err) {
        const errMsg = `${node}: ${err instanceof Error ? err.message : String(err)}`;
        state.errors.push(errMsg);
        console.error(`[Crew:${this.accountId}] Node ${node} threw:`, errMsg);
      }

      // Brief pause between agents to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    state.currentNode = "end";

    return {
      runId: state.runId,
      success: state.errors.length === 0,
      nodesExecuted: state.completedNodes,
      totalCostUsd: state.totalCostUsd,
      durationMs: Date.now() - state.startTime,
      errors: state.errors,
      nodeResults: state.nodeResults,
    };
  }

  private async executeNode(node: CrewNode, state: CrewState): Promise<AgentRunResult> {
    const agentConfig = await this.buildAgentConfig(node);
    const runCtx = {
      runId: `${state.runId}-${node}`,
      triggerEvent: state.triggerEvent,
      runType: "triggered" as const,
      payload: state.payload,
    };

    switch (node) {
      case "foreman": {
        const agent = new ForemanPredictorAgent(agentConfig);
        return agent.run(runCtx);
      }
      case "scheduler": {
        const agent = new SchedulerAgent(agentConfig);
        return agent.run(runCtx);
      }
      case "parts": {
        const agent = new PartsInventoryAgent(agentConfig);
        return agent.run(runCtx);
      }
      case "comm": {
        const agent = new CustomerCommAgent(agentConfig);
        return agent.run(runCtx);
      }
      case "finance": {
        const agent = new FinanceInvoiceAgent(agentConfig);
        return agent.run(runCtx);
      }
      case "dispatch": {
        const agent = new TechDispatchAgent(agentConfig);
        return agent.run(runCtx);
      }
      default:
        throw new Error(`Unknown node: ${node}`);
    }
  }

  // ─── Checkpoint management (for LangGraph-style resumability) ───

  async saveCheckpoint(state: CrewState): Promise<void> {
    await this.supabase
      .from("agent_instances")
      .update({
        graph_state: state as never,
        checkpoint_id: state.runId,
      })
      .eq("account_id", this.accountId)
      .eq("agent_type", "foreman_predictor");
  }

  async loadCheckpoint(runId: string): Promise<CrewState | null> {
    const { data } = await this.supabase
      .from("agent_instances")
      .select("graph_state")
      .eq("account_id", this.accountId)
      .eq("checkpoint_id", runId)
      .single();

    return (data?.graph_state as CrewState) ?? null;
  }

  // ─── Agent config builder ────────────────────────────────────

  private async buildAgentConfig(node: CrewNode): Promise<AgentConfig> {
    // Fetch agent instance ID from DB
    const agentType = this.nodeToAgentType(node);
    const { data: instance } = await this.supabase
      .from("agent_instances")
      .select("id, system_prompt_override, config")
      .eq("account_id", this.accountId)
      .eq("agent_type", agentType)
      .single();

    return {
      accountId: this.accountId,
      agentType,
      agentInstanceId: instance?.id ?? crypto.randomUUID(),
      model: "claude-sonnet-4-6",
      maxTokensPerRun: 8000,
      maxCostPerRunUsd: 0.5,
      enableHIL: true,
      dryRun: false,
      systemPromptOverride: instance?.system_prompt_override ?? undefined,
    };
  }

  private nodeToAgentType(node: CrewNode): AgentConfig["agentType"] {
    const map: Record<CrewNode, AgentConfig["agentType"]> = {
      foreman: "foreman_predictor",
      scheduler: "scheduler",
      parts: "parts_inventory",
      comm: "customer_comm",
      finance: "finance_invoice",
      dispatch: "tech_dispatch",
      end: "foreman_predictor",
    };
    return map[node];
  }
}

// ─────────────────────────────────────────────
// n8n-friendly trigger factory
// ─────────────────────────────────────────────

/**
 * Called by n8n workflow webhooks. Parses event and runs the crew.
 * Usage: POST /api/agents/trigger { accountId, event, payload }
 */
export async function triggerCrewFromWebhook(body: {
  accountId: string;
  event: string;
  payload?: Record<string, unknown>;
  planTier?: "basic" | "pro";
}): Promise<CrewOrchestrationResult> {
  const orchestrator = new CustomerCrewOrchestrator(
    body.accountId,
    body.planTier ?? "basic"
  );

  return orchestrator.run(
    body.event as TriggerEvent,
    body.payload ?? {}
  );
}

// ─────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────

export interface CrewOrchestrationResult {
  runId: string;
  success: boolean;
  nodesExecuted: CrewNode[];
  totalCostUsd: number;
  durationMs: number;
  errors: string[];
  nodeResults: Partial<Record<CrewNode, AgentRunResult>>;
}
