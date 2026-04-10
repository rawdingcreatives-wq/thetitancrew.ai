/**
 * TitanCrew · MetaSwarm — PerformanceOptimizerAgent
 *
 * Autonomous A/B testing and prompt optimization engine.
 * Runs weekly to ensure TitanCrew's AI agents continuously improve.
 *
 * Responsibilities:
 *   1. Analyze agent run performance from the past 7 days (LangSmith + Supabase)
 *   2. Identify underperforming agents and specific failure modes
 *   3. Generate A/B test variants for underperforming prompts
 *   4. Deploy new prompt variants into the prompt_variants table
 *   5. Analyze A/B test results and promote winning variants
 *   6. Cost analysis: flag agents exceeding budget limits
 *   7. Generate weekly performance report → SMS/email to Stephen (founder)
 *   8. Auto-rollback if a new variant performs worse than baseline
 *
 * Also:
 *   - Detects when an agent type has >15% failure rate → escalates to founder
 *   - Tracks token costs vs. value delivered (ROI per agent)
 *   - Recommends model downgrades for low-complexity tasks (cost optimization)
 *
 * Runs: Every Sunday 3:00 AM UTC via n8n cron
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

interface AgentMetrics {
  agentType: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  avgTokensUsed: number;
  avgCostUsd: number;
  failureReasons: string[];
  hilTriggerRate: number;
  accountsAffected: number;
  weekOverWeekChange: number;
}

interface PromptVariant {
  id?: string;
  agentType: string;
  variantName: string;
  systemPrompt: string;
  hypothesis: string;
  expectedImprovement: string;
  isControl: boolean;
}

interface ABTestResult {
  variantId: string;
  agentType: string;
  runs: number;
  successRate: number;
  avgCostUsd: number;
  winnerVsControl: "winner" | "loser" | "neutral";
  confidenceLevel: number;
}

// ─── Tool Definitions ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "fetch_agent_metrics",
    description:
      "Fetch performance metrics for all agents over the past N days from Supabase agent_runs table.",
    input_schema: {
      type: "object" as const,
      properties: {
        daysBack: { type: "number", description: "How many days to look back (default: 7)" },
        agentTypes: {
          type: "array",
          items: { type: "string" },
          description: "Specific agents to analyze (leave empty for all)",
        },
        minRuns: {
          type: "number",
          description: "Minimum runs required to include in analysis (default: 5)",
        },
      },
    },
  },
  {
    name: "fetch_langsmith_traces",
    description:
      "Fetch LangSmith traces for failed/slow runs to understand failure patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        traceFilter: {
          type: "string",
          enum: ["failures_only", "slow_runs", "high_cost", "all"],
        },
        daysBack: { type: "number" },
        limit: { type: "number" },
      },
      required: ["agentType"],
    },
  },
  {
    name: "analyze_failure_patterns",
    description:
      "Analyze failure reasons for an agent. Returns structured breakdown of failure categories, frequencies, and root causes.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        failureReasons: {
          type: "array",
          items: { type: "string" },
        },
        sampleRuns: {
          type: "array",
          items: { type: "object" },
          description: "Sample run records to analyze",
        },
      },
      required: ["agentType"],
    },
  },
  {
    name: "generate_prompt_variant",
    description:
      "Generate an improved prompt variant for an underperforming agent. Uses failure pattern analysis to craft targeted improvements.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        currentPrompt: { type: "string" },
        failurePatterns: {
          type: "array",
          items: { type: "string" },
          description: "Identified failure patterns to address",
        },
        optimizationGoal: {
          type: "string",
          enum: ["reduce_failures", "reduce_cost", "reduce_hil_triggers", "improve_speed"],
        },
        hypothesis: {
          type: "string",
          description: "What change you're making and why it should help",
        },
      },
      required: ["agentType", "currentPrompt", "optimizationGoal", "hypothesis"],
    },
  },
  {
    name: "deploy_prompt_variant",
    description:
      "Save a new prompt variant to the prompt_variants table and assign it to a percentage of runs (A/B split).",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        variantName: { type: "string" },
        systemPrompt: { type: "string" },
        hypothesis: { type: "string" },
        expectedImprovement: { type: "string" },
        trafficPercent: {
          type: "number",
          description: "Percentage of runs to use this variant (0–50%). Control gets the rest.",
        },
      },
      required: ["agentType", "variantName", "systemPrompt", "hypothesis"],
    },
  },
  {
    name: "evaluate_ab_test_results",
    description:
      "Evaluate an ongoing or completed A/B test. Returns statistical analysis and recommendation to promote, continue, or rollback.",
    input_schema: {
      type: "object" as const,
      properties: {
        variantId: { type: "string" },
        agentType: { type: "string" },
        minSampleSize: {
          type: "number",
          description: "Minimum runs needed before evaluating (default: 20)",
        },
      },
      required: ["agentType"],
    },
  },
  {
    name: "promote_variant",
    description:
      "Promote a winning A/B test variant to become the new default prompt for all runs.",
    input_schema: {
      type: "object" as const,
      properties: {
        variantId: { type: "string" },
        agentType: { type: "string" },
        reason: { type: "string", description: "Why this variant won" },
      },
      required: ["variantId", "agentType"],
    },
  },
  {
    name: "rollback_variant",
    description:
      "Rollback a losing variant. Disable it and revert to the previous control prompt.",
    input_schema: {
      type: "object" as const,
      properties: {
        variantId: { type: "string" },
        agentType: { type: "string" },
        reason: { type: "string" },
      },
      required: ["variantId", "agentType"],
    },
  },
  {
    name: "analyze_cost_efficiency",
    description:
      "Analyze API cost efficiency across all agents and accounts. Identify accounts over budget and agents with poor cost/value ratio.",
    input_schema: {
      type: "object" as const,
      properties: {
        daysBack: { type: "number" },
        flagThresholdPercent: {
          type: "number",
          description: "Flag accounts using >X% of their monthly budget already",
        },
      },
    },
  },
  {
    name: "recommend_model_downgrades",
    description:
      "Identify agent tasks that could use a cheaper model (haiku instead of sonnet) without quality loss.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        taskComplexityThreshold: {
          type: "number",
          description: "Tasks with complexity score below this can use haiku",
        },
      },
    },
  },
  {
    name: "generate_weekly_report",
    description:
      "Generate a comprehensive weekly performance report for the founder (Stephen). Includes all metrics, A/B test results, cost analysis, and recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        weekMetrics: {
          type: "array",
          items: { type: "object" },
          description: "AgentMetrics array for the week",
        },
        abTestResults: {
          type: "array",
          items: { type: "object" },
        },
        costAnalysis: { type: "object" },
        recommendations: {
          type: "array",
          items: { type: "string" },
        },
        weekEndingDate: { type: "string" },
      },
      required: ["weekEndingDate"],
    },
  },
  {
    name: "send_founder_report",
    description:
      "Send the weekly performance report to the founder via SMS summary + email with full report.",
    input_schema: {
      type: "object" as const,
      properties: {
        reportSummary: { type: "string", description: "3–5 bullet SMS-friendly summary" },
        fullReportHtml: { type: "string" },
        weekEndingDate: { type: "string" },
        alertsCount: { type: "number" },
        improvementsDeployed: { type: "number" },
      },
      required: ["reportSummary", "weekEndingDate"],
    },
  },
  {
    name: "escalate_critical_issue",
    description:
      "Escalate a critical performance issue (>15% failure rate, budget exceeded, agent down) to the founder immediately via SMS.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentType: { type: "string" },
        issueType: {
          type: "string",
          enum: ["high_failure_rate", "budget_exceeded", "agent_down", "data_quality", "security"],
        },
        details: { type: "string" },
        affectedAccounts: { type: "number" },
        severity: { type: "string", enum: ["critical", "high", "medium"] },
      },
      required: ["issueType", "details", "severity"],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "fetch_agent_metrics": {
      const { daysBack = 7, agentTypes, minRuns = 5 } = toolInput as {
        daysBack?: number;
        agentTypes?: string[];
        minRuns?: number;
      };

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      const previousPeriodSince = new Date(Date.now() - daysBack * 2 * 24 * 60 * 60 * 1000).toISOString();

      let query = (supabase.from("agent_runs") as any)
        .select("agent_type, status, duration_ms, tokens_used, cost_usd, error_message, created_at, account_id")
        .gte("created_at", since);

      if (agentTypes?.length) query = query.in("agent_type", agentTypes);

      const { data: runs } = await query;
      if (!runs) return { metrics: [] };

      // Aggregate by agent type
      const grouped = ((runs as any).reduce((acc: any, run: any) => {
        if (!acc[(run as any).agent_type]) acc[(run as any).agent_type] = [];
        acc[(run as any).agent_type].push(run);
        return acc;
      }, {}) as any) as Record<string, any>;

      const metrics: AgentMetrics[] = [];
      for (const [agentType, agentRuns] of Object.entries(grouped)) {
        if ((agentRuns as any).length < minRuns) continue;

        const successful = (agentRuns as any).filter((r: any) => (r as any).status === "completed");
        const failed = (agentRuns as any).filter((r: any) => (r as any).status === "failed");

        metrics.push({
          agentType,
          totalRuns: (agentRuns as any).length,
          successRate: Math.round((successful.length / (agentRuns as any).length) * 100),
          avgDurationMs: Math.round((agentRuns as any).reduce((s: number, r: any) => s + ((r as any).duration_ms ?? 0), 0) / (agentRuns as any).length),
          avgTokensUsed: Math.round((agentRuns as any).reduce((s: number, r: any) => s + ((r as any).tokens_used ?? 0), 0) / (agentRuns as any).length),
          avgCostUsd: parseFloat(
            ((agentRuns as any).reduce((s: number, r: any) => s + ((r as any).cost_usd ?? 0), 0) / (agentRuns as any).length).toFixed(4)
          ),
          failureReasons: [...new Set((failed as any).map((r: any) => (r as any).error_message).filter(Boolean))] as string[],
          hilTriggerRate: 0, // Would join with hil_confirmations
          accountsAffected: new Set((agentRuns as any).map((r: any) => (r as any).account_id)).size,
          weekOverWeekChange: 0, // Would compare with previous period
        });
      }

      return { metrics, periodDays: daysBack, since };
    }

    case "fetch_langsmith_traces": {
      const { agentType, traceFilter = "failures_only", daysBack = 7, limit = 20 } = toolInput as {
        agentType: string;
        traceFilter?: string;
        daysBack?: number;
        limit?: number;
      };

      const langsmithKey = process.env.LANGSMITH_API_KEY;
      const langsmithProject = process.env.LANGSMITH_PROJECT ?? "titancrew-prod";

      if (!langsmithKey) {
        return { traces: [], reason: "LANGSMITH_API_KEY not configured" };
      }

      const filterMap: Record<string, string> = {
        failures_only: `and(eq(status, "error"), eq(tags, "${agentType}"))`,
        slow_runs: `and(gt(latency, 30000), eq(tags, "${agentType}"))`,
        high_cost: `and(gt(total_tokens, 5000), eq(tags, "${agentType}"))`,
        all: `eq(tags, "${agentType}")`,
      };

      const resp = await fetch(
        `https://api.smith.langchain.com/runs?filter=${encodeURIComponent(filterMap[traceFilter])}&limit=${limit}&project_name=${langsmithProject}`,
        { headers: { "x-api-key": langsmithKey } }
      );

      if (!resp.ok) return { traces: [], error: `LangSmith API error: ${resp.status}` };
      const data = (await resp.json()) as any;
      return { traces: (data as any).runs ?? [], count: (data as any).runs?.length ?? 0 };
    }

    case "analyze_failure_patterns": {
      const { agentType, failureReasons, sampleRuns } = toolInput as {
        agentType: string;
        failureReasons?: string[];
        sampleRuns?: Record<string, unknown>[];
      };

      // Categorize failures
      const categories: Record<string, { count: number; examples: string[] }> = {};
      for (const reason of failureReasons ?? []) {
        let category = "other";
        if (reason.includes("timeout") || reason.includes("AbortError")) category = "timeout";
        else if (reason.includes("rate limit") || reason.includes("429")) category = "rate_limit";
        else if (reason.includes("tool") || reason.includes("undefined")) category = "tool_execution";
        else if (reason.includes("API") || reason.includes("503") || reason.includes("502")) category = "external_api";
        else if (reason.includes("budget") || reason.includes("cost")) category = "budget_exceeded";
        else if (reason.includes("hil") || reason.includes("timeout")) category = "hil_timeout";

        if (!categories[category]) categories[category] = { count: 0, examples: [] };
        categories[category].count++;
        if (categories[category].examples.length < 3) categories[category].examples.push(reason);
      }

      const topCategory = Object.entries(categories)
        .sort(([, a], [, b]) => b.count - a.count)[0];

      return {
        agentType,
        categories,
        primaryFailureMode: topCategory?.[0] ?? "unknown",
        recommendation: getFailureRecommendation(topCategory?.[0] ?? "unknown"),
      };
    }

    case "generate_prompt_variant": {
      const { agentType, currentPrompt, failurePatterns, optimizationGoal, hypothesis } = toolInput as {
        agentType: string;
        currentPrompt: string;
        failurePatterns: string[];
        optimizationGoal: string;
        hypothesis: string;
      };

      // Use Claude to generate an improved prompt variant
      const variantResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are a prompt engineer optimizing AI agent prompts for TitanCrew.

AGENT TYPE: ${agentType}
OPTIMIZATION GOAL: ${optimizationGoal}
FAILURE PATTERNS TO FIX: ${failurePatterns.join(", ")}
HYPOTHESIS: ${hypothesis}

CURRENT PROMPT:
${currentPrompt}

Generate an improved version of this system prompt that addresses the failure patterns while maintaining all existing functionality. Return ONLY the new system prompt, nothing else.`,
          },
        ],
      });

      const newPrompt = variantResponse.content[0].type === "text" ? variantResponse.content[0].text : currentPrompt;

      return {
        variantPrompt: newPrompt,
        changes: failurePatterns,
        optimizationGoal,
        hypothesis,
        estimatedImprovement: "10–25% reduction in failure rate",
      };
    }

    case "deploy_prompt_variant": {
      const { agentType, variantName, systemPrompt, hypothesis, expectedImprovement, trafficPercent = 20 } =
        toolInput as {
          agentType: string;
          variantName: string;
          systemPrompt: string;
          hypothesis: string;
          expectedImprovement: string;
          trafficPercent?: number;
        };

      const { data, error } = await (supabase.from("prompt_variants") as any)
        .insert({
          agent_type: agentType,
          variant_name: variantName,
          system_prompt: systemPrompt,
          hypothesis,
          expected_improvement: expectedImprovement,
          traffic_percent: trafficPercent,
          is_control: false,
          is_active: true,
          deployed_at: new Date().toISOString(),
          runs_count: 0,
          success_count: 0,
        })
        .select("id")
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, variantId: data?.id, trafficPercent };
    }

    case "evaluate_ab_test_results": {
      const { variantId, agentType, minSampleSize = 20 } = toolInput as {
        variantId?: string;
        agentType: string;
        minSampleSize?: number;
      };

      // Get variant performance
      const { data: variant } = variantId
        ? await supabase.from("prompt_variants").select("*").eq("id", variantId).single()
        : await supabase.from("prompt_variants").select("*").eq("agent_type", agentType).eq("is_active", true).neq("is_control", true).order("deployed_at", { ascending: false }).limit(1).single();

      if (!variant) return { hasResult: false, reason: "No active variant found" };

      if (variant.runs_count < minSampleSize) {
        return {
          hasResult: false,
          reason: `Insufficient data: ${variant.runs_count} / ${minSampleSize} runs needed`,
          currentRuns: variant.runs_count,
        };
      }

      const variantSuccessRate = variant.runs_count > 0 ? (variant.success_count / variant.runs_count) * 100 : 0;

      // Get control performance
      const { data: control } = await (supabase.from("prompt_variants") as any)
        .select("runs_count, success_count")
        .eq("agent_type", agentType)
        .eq("is_control", true)
        .single();

      const controlSuccessRate = control && control.runs_count > 0
        ? (control.success_count / control.runs_count) * 100
        : 85; // Baseline assumption

      const improvement = variantSuccessRate - controlSuccessRate;
      const winner = improvement > 3 ? "winner" : improvement < -3 ? "loser" : "neutral";

      return {
        hasResult: true,
        variantId: variant.id,
        agentType,
        variantSuccessRate: Math.round(variantSuccessRate),
        controlSuccessRate: Math.round(controlSuccessRate),
        improvement: Math.round(improvement),
        winner,
        recommendation: winner === "winner" ? "promote" : winner === "loser" ? "rollback" : "continue",
        runs: variant.runs_count,
      };
    }

    case "promote_variant": {
      const { variantId, agentType, reason } = toolInput as {
        variantId: string;
        agentType: string;
        reason: string;
      };

      // Demote existing control
      await supabase.from("prompt_variants").update({ is_control: false }).eq("agent_type", agentType).eq("is_control", true);

      // Promote variant to control
      await supabase.from("prompt_variants").update({
        is_control: true,
        traffic_percent: 100,
        promoted_at: new Date().toISOString(),
        promotion_reason: reason,
      }).eq("id", variantId);

      // Log to audit
      await supabase.from("audit_log").insert({
        event_type: "prompt_variant_promoted",
        actor: "performance_optimizer",
        details: { variantId, agentType, reason },
        created_at: new Date().toISOString(),
      });

      return { success: true, promoted: variantId };
    }

    case "rollback_variant": {
      const { variantId, agentType, reason } = toolInput as {
        variantId: string;
        agentType: string;
        reason: string;
      };

      await supabase.from("prompt_variants").update({
        is_active: false,
        traffic_percent: 0,
        rolled_back_at: new Date().toISOString(),
        rollback_reason: reason,
      }).eq("id", variantId);

      return { success: true, rolledBack: variantId };
    }

    case "analyze_cost_efficiency": {
      const { daysBack = 7, flagThresholdPercent = 60 } = toolInput as {
        daysBack?: number;
        flagThresholdPercent?: number;
      };

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

      const { data: costData } = await (supabase.from("agent_runs") as any)
        .select("account_id, agent_type, cost_usd, created_at")
        .gte("created_at", since);

      if (!costData) return { accounts: [], total: 0 };

      // Aggregate by account
      const byAccount: Record<string, { total: number; byAgent: Record<string, number> }> = {};
      for (const run of costData) {
        if (!byAccount[run.account_id]) byAccount[run.account_id] = { total: 0, byAgent: {} };
        byAccount[run.account_id].total += run.cost_usd ?? 0;
        byAccount[run.account_id].byAgent[run.agent_type] =
          (byAccount[run.account_id].byAgent[run.agent_type] ?? 0) + (run.cost_usd ?? 0);
      }

      // Get account plans for budget comparison
      const accountIds = Object.keys(byAccount);
      const { data: accounts } = await (supabase.from("accounts") as any)
        .select("id, plan, business_name")
        .in("id", accountIds);

      const MONTHLY_BUDGETS: Record<string, number> = { lite: 8, growth: 15, scale: 25 };
      const dailyBudgetFraction = daysBack / 30;

      const flagged = ((accounts as any) ?? [])
        .map((acct: any) => {
          const spend = (byAccount as any)[(acct as any).id]?.total ?? 0;
          const budget = MONTHLY_BUDGETS[(acct as any).plan ?? "lite"] ?? 8;
          const periodBudget = budget * dailyBudgetFraction;
          const pctUsed = Math.round((spend / periodBudget) * 100);
          return { accountId: (acct as any).id, businessName: (acct as any).business_name, plan: (acct as any).plan, spend, pctUsed };
        })
        .filter((a: any) => a.pctUsed > flagThresholdPercent)
        .sort((a: any, b: any) => b.pctUsed - a.pctUsed);

      const totalSpend = ((costData as any) ?? []).reduce((s: number, r: any) => s + ((r as any).cost_usd ?? 0), 0);
      return { flagged, totalSpend: parseFloat(totalSpend.toFixed(2)), daysAnalyzed: daysBack };
    }

    case "recommend_model_downgrades": {
      const { agentType } = toolInput as { agentType: string };

      const { data: runs } = await (supabase.from("agent_runs") as any)
        .select("agent_type, tokens_used, cost_usd, status, output_summary")
        .eq("agent_type", agentType)
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(50);

      if (!(runs as any) || (runs as any).length < 10) {
        return { recommendation: "insufficient_data", agentType };
      }

      const avgTokens = ((runs as any) ?? []).reduce((s: number, r: any) => s + ((r as any).tokens_used ?? 0), 0) / ((runs as any) ?? []).length;
      const LOW_COMPLEXITY_THRESHOLD = 1500;

      return {
        agentType,
        avgTokensUsed: Math.round(avgTokens),
        currentModel: "claude-sonnet-4-6",
        recommendation:
          avgTokens < LOW_COMPLEXITY_THRESHOLD
            ? {
                downgrade: true,
                suggestedModel: "claude-haiku-4-5-20251001",
                estimatedCostSaving: "~80% per run",
                caveat: "Run 20-run A/B test first to verify quality",
              }
            : {
                downgrade: false,
                reason: `Avg ${Math.round(avgTokens)} tokens — task complexity justifies sonnet`,
              },
      };
    }

    case "generate_weekly_report": {
      const { weekMetrics, abTestResults, costAnalysis, recommendations, weekEndingDate } = toolInput as {
        weekMetrics?: AgentMetrics[];
        abTestResults?: ABTestResult[];
        costAnalysis?: Record<string, unknown>;
        recommendations?: string[];
        weekEndingDate: string;
      };

      const overallSuccessRate = weekMetrics && weekMetrics.length > 0
        ? Math.round(weekMetrics.reduce((s, m) => s + m.successRate, 0) / weekMetrics.length)
        : 0;

      const totalRuns = weekMetrics?.reduce((s, m) => s + m.totalRuns, 0) ?? 0;
      const totalCost = weekMetrics?.reduce((s, m) => s + m.avgCostUsd * m.totalRuns, 0) ?? 0;

      const alerts = weekMetrics?.filter((m) => m.successRate < 85) ?? [];

      const reportHtml = `
<div style="font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto;">
  <div style="background: #1A2744; padding: 24px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center;">
    <h1 style="color: #FF6B00; margin: 0; font-size: 22px;">TitanCrew · Weekly Performance Report</h1>
    <span style="color: #9FADC9; font-size: 13px;">Week ending ${weekEndingDate}</span>
  </div>
  <div style="background: white; padding: 24px; border: 1px solid #E2E8F0;">
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px;">
      <div style="background: #F8FAFF; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #1A2744;">${totalRuns}</div>
        <div style="font-size: 12px; color: #64748b;">Total Runs</div>
      </div>
      <div style="background: ${overallSuccessRate >= 90 ? '#F0FDF4' : '#FFF7ED'}; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: ${overallSuccessRate >= 90 ? '#16a34a' : '#ea580c'};">${overallSuccessRate}%</div>
        <div style="font-size: 12px; color: #64748b;">Success Rate</div>
      </div>
      <div style="background: #F8FAFF; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #1A2744;">$${totalCost.toFixed(2)}</div>
        <div style="font-size: 12px; color: #64748b;">API Cost</div>
      </div>
      <div style="background: ${alerts.length === 0 ? '#F0FDF4' : '#FFF7ED'}; padding: 16px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: ${alerts.length === 0 ? '#16a34a' : '#ea580c'};">${alerts.length}</div>
        <div style="font-size: 12px; color: #64748b;">Alerts</div>
      </div>
    </div>

    ${alerts.length > 0 ? `
    <div style="background: #FFF7ED; border-left: 4px solid #FF6B00; padding: 16px; margin-bottom: 16px; border-radius: 4px;">
      <strong style="color: #ea580c;">⚠️ Agents Needing Attention:</strong>
      <ul style="margin: 8px 0 0;">
        ${alerts.map((a) => `<li>${a.agentType}: ${a.successRate}% success rate (${a.totalRuns} runs)</li>`).join("")}
      </ul>
    </div>` : ""}

    <h3 style="color: #1A2744;">Agent Performance</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #F8FAFF;">
        <th style="padding: 8px 12px; text-align: left; color: #1A2744;">Agent</th>
        <th style="padding: 8px 12px; text-align: right; color: #1A2744;">Runs</th>
        <th style="padding: 8px 12px; text-align: right; color: #1A2744;">Success</th>
        <th style="padding: 8px 12px; text-align: right; color: #1A2744;">Avg Cost</th>
      </tr>
      ${(weekMetrics ?? []).map((m) => `
      <tr style="border-bottom: 1px solid #F1F5F9;">
        <td style="padding: 8px 12px;">${m.agentType}</td>
        <td style="padding: 8px 12px; text-align: right;">${m.totalRuns}</td>
        <td style="padding: 8px 12px; text-align: right; color: ${m.successRate >= 90 ? '#16a34a' : '#ea580c'};">${m.successRate}%</td>
        <td style="padding: 8px 12px; text-align: right;">$${m.avgCostUsd.toFixed(4)}</td>
      </tr>`).join("")}
    </table>

    ${recommendations && recommendations.length > 0 ? `
    <h3 style="color: #1A2744; margin-top: 24px;">Recommendations for Next Week</h3>
    <ul style="color: #374151;">
      ${recommendations.map((r) => `<li style="margin-bottom: 8px;">${r}</li>`).join("")}
    </ul>` : ""}
  </div>
</div>`;

      return {
        reportHtml,
        summary: `TitanCrew Week ending ${weekEndingDate}: ${totalRuns} runs, ${overallSuccessRate}% success, $${totalCost.toFixed(2)} cost, ${alerts.length} alerts`,
        overallSuccessRate,
        totalRuns,
        totalCost,
        alertsCount: alerts.length,
      };
    }

    case "send_founder_report": {
      const { reportSummary, fullReportHtml, weekEndingDate, alertsCount = 0, improvementsDeployed = 0 } =
        toolInput as {
          reportSummary: string;
          fullReportHtml?: string;
          weekEndingDate: string;
          alertsCount?: number;
          improvementsDeployed?: number;
        };

      const founderPhone = process.env.FOUNDER_PHONE ?? process.env.SUPPORT_PHONE;
      const founderEmail = process.env.FOUNDER_EMAIL ?? "rawdingcreatives@gmail.com";
      const results: Record<string, unknown> = {};

      // SMS summary
      if (founderPhone) {
        const smsText = `📊 TitanCrew Weekly Report (${weekEndingDate})\n${reportSummary}\n${alertsCount > 0 ? `⚠️ ${alertsCount} alerts need attention` : "✅ All systems healthy"}\n+${improvementsDeployed} improvements deployed`;
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_FROM_NUMBER;
        if (twilioAccountSid && twilioAuthToken && twilioFrom) {
          const formData = new URLSearchParams({ To: founderPhone, From: twilioFrom, Body: smsText });
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
              },
              body: formData.toString(),
            }
          );
          results.sms = { sent: resp.ok };
        }
      }

      // Email full report
      const sendgridKey = process.env.SENDGRID_API_KEY;
      if (sendgridKey && fullReportHtml) {
        const emailResp = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sendgridKey}`,
          },
          body: JSON.stringify({
            to: [{ email: founderEmail, name: "Stephen" }],
            from: { email: "ops@titancrew.ai", name: "TitanCrew Operations" },
            subject: `📊 Weekly Performance Report — ${weekEndingDate}`,
            html: fullReportHtml,
          }),
        });
        results.email = { sent: emailResp.ok };
      }

      return { sent: true, results };
    }

    case "escalate_critical_issue": {
      const { agentType, issueType, details, affectedAccounts, severity } = toolInput as {
        agentType?: string;
        issueType: string;
        details: string;
        affectedAccounts?: number;
        severity: string;
      };

      const founderPhone = process.env.FOUNDER_PHONE;
      if (founderPhone) {
        const emoji = severity === "critical" ? "🚨" : "⚠️";
        const message = `${emoji} TitanCrew ${severity.toUpperCase()}: ${issueType}${agentType ? ` (${agentType})` : ""}. ${details}${affectedAccounts ? ` Affects ${affectedAccounts} accounts.` : ""} Check dashboard.`;

        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_FROM_NUMBER;
        if (twilioAccountSid && twilioAuthToken && twilioFrom) {
          const formData = new URLSearchParams({ To: founderPhone, From: twilioFrom, Body: message });
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
              },
              body: formData.toString(),
            }
          );
        }
      }

      // Log to audit
      await supabase.from("audit_log").insert({
        event_type: "critical_issue_escalated",
        actor: "performance_optimizer",
        details: { issueType, agentType, details, affectedAccounts, severity },
        created_at: new Date().toISOString(),
      });

      return { escalated: true, severity, issueType };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function getFailureRecommendation(failureMode: string): string {
  const recommendations: Record<string, string> = {
    timeout: "Increase AbortSignal timeout from 10s to 20s. Add retry logic with exponential backoff.",
    rate_limit: "Add request queuing with delay between calls. Implement per-account rate limiting.",
    tool_execution: "Add try/catch per tool call. Ensure null checks on API responses.",
    external_api: "Implement circuit breaker pattern. Cache responses where appropriate.",
    budget_exceeded: "Reduce max_tokens per run. Consider model downgrade for simple tasks.",
    hil_timeout: "Increase HIL timeout from 1h to 4h. Add reminder SMS at 30min.",
  };
  return recommendations[failureMode] ?? "Review logs and implement targeted fixes.";
}

// ─── Main Agent Loop ──────────────────────────────────────

export async function runPerformanceOptimizerAgent(): Promise<{
  agentsAnalyzed: number;
  variantsDeployed: number;
  variantsPromoted: number;
  variantsRolledBack: number;
  alertsEscalated: number;
}> {
  const weekEndingDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `You are PerformanceOptimizerAgent — TitanCrew's autonomous continuous improvement engine.

YOUR MISSION: Every week, analyze all agent performance, identify what's broken, fix it with A/B tested prompt improvements, escalate critical issues, and send a weekly report to the founder.

WEEK ENDING: ${weekEndingDate}

PERFORMANCE THRESHOLDS:
- Success rate <85% → generate improved prompt variant
- Success rate <75% → escalate as high priority + generate variant
- Success rate <65% → escalate as critical + generate variant immediately
- Cost >120% of budget for any account → flag and notify
- Any agent with 0 runs in past 7 days → investigate and alert

A/B TEST RULES:
- Only 1 active variant per agent type at a time
- Minimum 20 runs before evaluating
- Need >3% improvement to declare winner
- Auto-rollback if variant performs >5% worse than control

EXECUTION PLAN:
1. fetch_agent_metrics for all agents (past 7 days)
2. For any agent with success rate <85%:
   a. fetch_langsmith_traces for failure analysis
   b. analyze_failure_patterns
   c. generate_prompt_variant
   d. deploy_prompt_variant (20% traffic split)
3. evaluate_ab_test_results for any active variants
4. promote_variant or rollback_variant based on results
5. analyze_cost_efficiency → flag any over-budget accounts
6. recommend_model_downgrades for low-complexity agents
7. generate_weekly_report with all findings
8. send_founder_report
9. escalate_critical_issue for anything severity ≥ high

Be thorough. This runs only once a week — make it count.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Run the weekly performance optimization cycle. Today is ${weekEndingDate}. Analyze all agents, fix what's broken, evaluate active A/B tests, and send the founder report.`,
    },
  ];

  let agentsAnalyzed = 0;
  let variantsDeployed = 0;
  let variantsPromoted = 0;
  let variantsRolledBack = 0;
  let alertsEscalated = 0;

  for (let turn = 0; turn < 40; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        const r = result as Record<string, unknown>;
        if (block.name === "fetch_agent_metrics" && Array.isArray(r.metrics)) {
          agentsAnalyzed = (r.metrics as AgentMetrics[]).length;
        }
        if (block.name === "deploy_prompt_variant" && r.success) variantsDeployed++;
        if (block.name === "promote_variant" && r.success) variantsPromoted++;
        if (block.name === "rollback_variant" && r.success) variantsRolledBack++;
        if (block.name === "escalate_critical_issue" && r.escalated) alertsEscalated++;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return { agentsAnalyzed, variantsDeployed, variantsPromoted, variantsRolledBack, alertsEscalated };
}
