/**
 * TradeBrain · ForemanPredictorAgent
 * The supervisor agent — orchestrates the entire customer crew,
 * generates daily owner summaries, and predicts/books future revenue.
 * Runs at 6am daily and on significant business events.
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class ForemanPredictorAgent extends BaseAgent {
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
  }

  protected getSystemPrompt(): string {
    return `You are the Foreman AI — the master supervisor agent for a trade contractor business.

YOUR ROLE: Think like an experienced business operations manager who has run 100s of plumbing/electrical/HVAC/snow plow/junk removal companies. You have full visibility into the business and coordinate all other agents.

DAILY RESPONSIBILITIES (6am):
1. Review the full job pipeline (leads → completed).
2. Identify scheduling gaps in the next 7 days and flag them.
3. Spot the top 3 upsell/cross-sell opportunities from customer history.
4. Predict which leads are most likely to convert this week.
5. Generate a plain-English "morning briefing" for the owner — concise, actionable.
6. Trigger other agents as needed (scheduler for gaps, comm agent for follow-ups).

PREDICTIVE LOGIC:
- Customers who last had service 6+ months ago on seasonal equipment = upsell opportunity
- Customers who had emergency repairs = follow-up for preventative maintenance
- Leads sitting in pipeline > 3 days without contact = re-engage now
- Seasonal patterns: HVAC surge (spring/fall), plumbing (winter), electrical (summer), snow plow peak (Nov–Mar), junk removal surge (spring cleaning + summer moves)
- If tech utilization < 70% for the week → fill gaps aggressively
- If tech utilization > 95% → flag overflow risk to owner

DAILY SUMMARY FORMAT (send via SMS to owner at 6:15am):
"☀️ Good morning [Name]! TradeBrain daily:
📅 Today: X jobs scheduled ($Y est. revenue)
💰 This week: $Z pipeline
🤖 AI booked: X jobs (+$A vs last week)
⚠️ Needs attention: [1-2 specific items]
📈 Top opportunity: [1 upsell suggestion]
Reply ? for details."

BUSINESS HEALTH MONITORING:
- Track churn risk score for the account (update weekly)
- Alert owner if: jobs booked < 5 in last 7 days, unpaid invoices > $5,000, or tech available but no jobs scheduled
- Celebrate wins: "Just hit $10k week!" or "100th job this year!"

CREW COORDINATION:
- If Scheduler Agent hasn't run in 24h, flag to meta-swarm.
- If CommAgent has >10 pending follow-ups, trigger immediately.
- If FinanceAgent has >$2,000 outstanding >14 days, trigger collection sequence.

MEMORY & LEARNING:
- After each daily run, store key business patterns in vector memory.
- Over time, predictions should improve based on this business's specific patterns.`;
  }

  protected registerTools(): void {
    this.addTool({
      name: "get_pipeline_overview",
      description: "Get a full overview of the job pipeline across all statuses.",
      inputSchema: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "Days ahead to look for scheduled jobs (default 7)" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const daysAhead = (input.days_ahead as number) ?? 7;
        const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

        const { data: jobs } = await (this.supabase.from("jobs") as any)
          .select("id, title, status, priority, scheduled_start, estimate_amount, invoice_amount, booked_by_ai, technician_id, job_type")
          .eq("account_id", this.config.accountId)
          .not("status", "in", '("paid","canceled")')
          .or(`scheduled_start.lte.${cutoff},status.eq.lead`);

        const grouped = {
          leads: (jobs ?? []).filter((j: any) => j.status === "lead"),
          scheduled: (jobs ?? []).filter((j: any) => j.status === "scheduled"),
          inProgress: (jobs ?? []).filter((j: any) => j.status === "in_progress"),
          completed: (jobs ?? []).filter((j: any) => j.status === "completed"),
          invoiced: (jobs ?? []).filter((j: any) => j.status === "invoiced"),
        };

        const totalPipelineValue = (jobs ?? []).reduce((s: any, j: any) => s + (j.estimate_amount ?? 0), 0);
        const aiBookedCount = (jobs ?? []).filter((j: any) => j.booked_by_ai).length;

        return {
          summary: {
            totalJobs: (jobs ?? []).length,
            totalPipelineValue,
            aiBookedCount,
            aiBookedPct: (jobs ?? []).length > 0 ? (aiBookedCount / (jobs ?? []).length * 100).toFixed(1) : 0,
          },
          byStatus: grouped,
        };
      },
    });

    this.addTool({
      name: "get_tech_utilization",
      description: "Get technician utilization rates for the current week.",
      inputSchema: { type: "object", properties: {} },
      riskLevel: "low",
      handler: async () => {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const { data: techs } = await (this.supabase.from("technicians") as any)
          .select("id, name, efficiency_score")
          .eq("account_id", this.config.accountId)
          .eq("is_active", true);

        const { data: jobs } = await (this.supabase.from("jobs") as any)
          .select("technician_id, scheduled_start, scheduled_end, status")
          .eq("account_id", this.config.accountId)
          .in("status", ["scheduled", "dispatched", "in_progress", "completed"])
          .gte("scheduled_start", weekStart.toISOString())
          .lte("scheduled_start", weekEnd.toISOString());

        const utilization = (techs ?? []).map((tech: any) => {
          const techJobs = (jobs ?? []).filter((j: any) => j.technician_id === tech.id);
          // Assume 9-hour workday × 5 days = 45 available hours/week
          const bookedHours = techJobs.reduce((s: any, j: any) => {
            if (!j.scheduled_start || !j.scheduled_end) return s + 2; // Default 2h job
            return s + (new Date(j.scheduled_end).getTime() - new Date(j.scheduled_start).getTime()) / (1000 * 60 * 60);
          }, 0);
          const utilizationPct = Math.min(100, (bookedHours / 45) * 100);

          return {
            techId: tech.id,
            name: tech.name,
            jobCount: techJobs.length,
            bookedHours: Math.round(bookedHours),
            utilizationPct: Math.round(utilizationPct),
            isUnderUtilized: utilizationPct < 70,
            isOverloaded: utilizationPct > 90,
          };
        });

        return { technicians: utilization, avgUtilization: utilization.length > 0 ? utilization.reduce((s: any, t: any) => s + t.utilizationPct, 0) / utilization.length : 0 };
      },
    });

    this.addTool({
      name: "find_upsell_opportunities",
      description: "Identify customers with high upsell probability based on service history.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 5)" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const limit = (input.limit as number) ?? 5;
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // Customers due for recurring service
        const { data: dueForService } = await (this.supabase.from("trade_customers") as any)
          .select("id, name, phone, last_service_at, total_spent, total_jobs, tags, next_service_at")
          .eq("account_id", this.config.accountId)
          .eq("comms_opt_out", false)
          .lte("last_service_at", sixMonthsAgo.toISOString())
          .gt("total_jobs", 1)
          .order("total_spent", { ascending: false })
          .limit(limit);

        // Recent emergency jobs → sell preventative maintenance
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: emergencyJobs } = await (this.supabase.from("jobs") as any)
          .select(`
            id, title, actual_end,
            trade_customers!inner(id, name, phone, comms_opt_out)
          `)
          .eq("account_id", this.config.accountId)
          .eq("job_type", "emergency")
          .gte("actual_end", twoWeeksAgo)
          .eq("status", "paid");

        return {
          dueForService: dueForService ?? [],
          emergencyFollowUp: emergencyJobs ?? [],
          totalOpportunities: (dueForService?.length ?? 0) + (emergencyJobs?.length ?? 0),
        };
      },
    });

    this.addTool({
      name: "get_business_metrics",
      description: "Get key business health metrics for the daily summary.",
      inputSchema: { type: "object", properties: {} },
      riskLevel: "low",
      handler: async () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        const [thisMonthJobs, lastMonthJobs, overdueCount] = await Promise.all([
          (this.supabase.from("jobs") as any).select("invoice_amount, booked_by_ai, status")
            .eq("account_id", this.config.accountId)
            .gte("actual_end", monthStart.toISOString())
            .in("status", ["completed", "invoiced", "paid"]),

          (this.supabase.from("jobs") as any).select("invoice_amount")
            .eq("account_id", this.config.accountId)
            .gte("actual_end", lastMonthStart.toISOString())
            .lte("actual_end", lastMonthEnd.toISOString())
            .in("status", ["completed", "invoiced", "paid"]),

          (this.supabase.from("jobs") as any).select("id", { count: "exact" })
            .eq("account_id", this.config.accountId)
            .eq("status", "invoiced")
            .lt("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        const thisMonthRevenue = (thisMonthJobs.data ?? []).reduce((s: any, j: any) => s + (j.invoice_amount ?? 0), 0);
        const lastMonthRevenue = (lastMonthJobs.data ?? []).reduce((s: any, j: any) => s + (j.invoice_amount ?? 0), 0);
        const aiBookedRevenue = (thisMonthJobs.data ?? []).filter((j: any) => j.booked_by_ai).reduce((s: any, j: any) => s + (j.invoice_amount ?? 0), 0);
        const revChange = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : "N/A";

        return {
          thisMonthRevenue,
          lastMonthRevenue,
          revChangePercent: revChange,
          aiBookedRevenue,
          aiBookedPct: thisMonthRevenue > 0 ? ((aiBookedRevenue / thisMonthRevenue) * 100).toFixed(1) : 0,
          overdueInvoiceCount: overdueCount.count ?? 0,
        };
      },
    });

    this.addTool({
      name: "send_daily_summary",
      description: "Send the owner their daily morning briefing via SMS.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The complete daily summary message" },
        },
        required: ["message"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const { data: account } = await (this.supabase.from("accounts") as any)
          .select("phone, notification_prefs, owner_name")
          .eq("id", this.config.accountId)
          .single();

        if (!account?.phone) return { sent: false, reason: "No owner phone" };
        const prefs = (account?.notification_prefs ?? {}) as Record<string, unknown>;
        if (prefs.daily_summary === false) return { sent: false, reason: "Daily summary disabled" };

        return this.twilioTool.sendSMS({
          to: account.phone,
          body: input.message as string,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "update_account_metrics",
      description: "Update the account's health metrics (churn risk, AI performance) in the database.",
      inputSchema: {
        type: "object",
        properties: {
          jobs_booked_30d: { type: "number" },
          jobs_ai_booked_30d: { type: "number" },
          revenue_ai_30d: { type: "number" },
          churn_risk_score: { type: "number", description: "0.0–1.0 risk score" },
          nps_score: { type: "number" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const updates: Record<string, unknown> = {};
        if (input.jobs_booked_30d !== undefined) updates.jobs_booked_30d = input.jobs_booked_30d;
        if (input.jobs_ai_booked_30d !== undefined) updates.jobs_ai_booked_30d = input.jobs_ai_booked_30d;
        if (input.revenue_ai_30d !== undefined) updates.revenue_ai_30d = input.revenue_ai_30d;
        if (input.churn_risk_score !== undefined) updates.churn_risk_score = input.churn_risk_score;
        if (input.nps_score !== undefined) updates.nps_score = input.nps_score;
        updates.last_active_at = new Date().toISOString();

        await (this.supabase.from("accounts") as any).update(updates).eq("id", this.config.accountId);
        return { updated: true, fields: Object.keys(updates) };
      },
    });

    this.addTool({
      name: "store_business_pattern",
      description: "Store a discovered business pattern in vector memory for future predictions.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Description of the pattern" },
          pattern_type: { type: "string", enum: ["scheduling_pattern", "job_pattern", "win_pattern", "customer_pref"] },
        },
        required: ["pattern"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const id = await this.memory.store(
          input.pattern as string,
          (input.pattern_type as "job_pattern") ?? "job_pattern",
          { source: "foreman_daily_analysis" },
          "foreman_predictor"
        );
        return { stored: true, memoryId: id };
      },
    });
  }

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    const memContext = await this.memory.getContextBlock(
      "business performance patterns and seasonal trends",
      { memoryType: "job_pattern", limit: 8 }
    );

    const ownerName = await this.getOwnerName();

    return [
      {
        role: "user",
        content: `You are the Foreman AI for ${account.business_name} (${account.trade_type}).
Owner: ${ownerName}
Current time: ${new Date().toISOString()}
Timezone: ${account.timezone}

${memContext}

Run the daily morning briefing workflow:
1. Fetch pipeline overview and tech utilization
2. Get business metrics vs. last month
3. Identify top 3 upsell opportunities
4. Compose the morning summary SMS
5. Send it to the owner
6. Update account health metrics
7. Store any new patterns you discover

Be analytical, specific, and action-oriented. The owner is on a job site — keep the summary under 300 characters. Report all actions taken.`,
      },
    ];
  }

  private async getOwnerName(): Promise<string> {
    const { data } = await (this.supabase.from("accounts") as any)
      .select("owner_name")
      .eq("id", this.config.accountId)
      .single();
    return data?.owner_name ?? "there";
  }
}
