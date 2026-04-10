/**
 * TradeBrain · CostGovernor
 * Per-account monthly token budget enforcement.
 * Prevents runaway API costs if an agent loops or is misconfigured.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";
import type { AgentType } from "../base/BaseAgent";
import { createLogger } from "./logger";

const logger = createLogger("CostGovernor");

// Monthly budget by plan tier (USD)
const PLAN_BUDGETS: Record<string, number> = {
  lite: 2.0,      // Free tier – tight budget
  growth: 15.0,   // $399/mo plan
  scale: 40.0,    // $799/mo plan
  trialing: 2.0,  // Tight budget on trials
};

// Per-agent-type daily budget cap (USD)
const AGENT_DAILY_BUDGETS: Partial<Record<AgentType, number>> = {
  scheduler: 0.30,
  customer_comm: 0.50,
  finance_invoice: 0.25,
  parts_inventory: 0.20,
  foreman_predictor: 0.40,
  tech_dispatch: 0.20,
  lead_hunter: 1.00,         // Meta-swarm agents can spend more
  demo_creator: 0.50,
  onboarder: 0.30,
  performance_optimizer: 0.60,
  billing_churn_preventer: 0.30,
};

export class CostGovernor {
  private supabase: ReturnType<typeof createClient<Database>>;
  private accountId: string;
  private agentType: AgentType;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string,
    agentType: AgentType
  ) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.agentType = agentType;
  }

  /**
   * Check if this account still has budget for another run.
   * Returns false if budget is exceeded.
   */
  async checkBudget(): Promise<boolean> {
    const [account, agentCostToday] = await Promise.all([
      this.fetchAccountPlan(),
      this.fetchAgentCostToday(),
    ]);

    if (!account) return false;

    const monthlyBudget = PLAN_BUDGETS[account.plan] ?? PLAN_BUDGETS.lite;
    const dailyBudget = AGENT_DAILY_BUDGETS[this.agentType] ?? 0.25;

    // Check daily agent budget
    if (agentCostToday >= dailyBudget) {
      logger.warn({
        agentType: this.agentType,
        accountId: this.accountId,
        spent: agentCostToday.toFixed(4),
        dailyBudget: dailyBudget.toString(),
      }, "Daily budget exceeded");
      return false;
    }

    // Check monthly account budget
    const monthCost = await this.fetchAccountCostThisMonth();
    if (monthCost >= monthlyBudget) {
      logger.warn({
        accountId: this.accountId,
        spent: monthCost.toFixed(4),
        monthlyBudget: monthlyBudget.toString(),
      }, "Monthly budget exceeded");
      return false;
    }

    return true;
  }

  /**
   * Record actual cost after a run completes.
   * Updates the agent_instances token_cost_30d counter.
   */
  async recordUsage(costUsd: number): Promise<void> {
    try {
      // Update rolling 30-day cost on agent instance
      const { data: instance } = await (this.supabase as any)
        .from("agent_instances")
        .select("token_cost_30d")
        .eq("account_id", this.accountId)
        .eq("agent_type", this.agentType)
        .single();

      if (instance) {
        await (this.supabase as any)
          .from("agent_instances")
          .update({
            token_cost_30d: (instance.token_cost_30d ?? 0) + costUsd,
          })
          .eq("account_id", this.accountId)
          .eq("agent_type", this.agentType);
      }
    } catch (err) {
      logger.error({ error: err }, "Failed to record usage");
    }
  }

  private async fetchAccountPlan(): Promise<{ plan: string } | null> {
    const { data } = await (this.supabase as any)
      .from("accounts")
      .select("plan")
      .eq("id", this.accountId)
      .single();
    return data;
  }

  private async fetchAgentCostToday(): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await (this.supabase as any)
      .from("agent_runs")
      .select("cost_usd")
      .eq("account_id", this.accountId)
      .gte("created_at", todayStart.toISOString());

    // Filter by agent type via join isn't straightforward here
    // In production: add agent_type directly to agent_runs or join with agent_instances
    if (!data) return 0;
    return data.reduce((sum: number, r: any) => sum + (r.cost_usd ?? 0), 0);
  }

  private async fetchAccountCostThisMonth(): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data } = await (this.supabase as any)
      .from("agent_runs")
      .select("cost_usd")
      .eq("account_id", this.accountId)
      .gte("created_at", monthStart.toISOString());

    if (!data) return 0;
    return data.reduce((sum: number, r: any) => sum + (r.cost_usd ?? 0), 0);
  }
}
