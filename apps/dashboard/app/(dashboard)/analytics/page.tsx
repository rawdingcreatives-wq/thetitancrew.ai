/**
 * TitanCrew · Analytics Page
 * AI attribution, revenue trends, job metrics, agent performance.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RevenueChart } from "@/components/analytics/RevenueChart";
import { AIAttributionPanel } from "@/components/analytics/AIAttributionPanel";
import { AgentPerformanceTable } from "@/components/analytics/AgentPerformanceTable";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, jobs_booked_30d, jobs_ai_booked_30d, revenue_ai_30d, plan")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) redirect("/login");

  // Last 90 days of completed jobs for charting
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, actual_end, invoice_amount, booked_by_ai, status, job_type")
    .eq("account_id", account.id)
    .gte("actual_end", ninetyDaysAgo)
    .in("status", ["completed", "invoiced", "paid"])
    .order("actual_end", { ascending: true });

  // Agent performance data
  const { data: agents } = await supabase
    .from("agent_instances")
    .select("id, agent_type, actions_24h, errors_24h, token_cost_30d, last_run_at")
    .eq("account_id", account.id);

  const { data: agentRunStats } = await supabase
    .from("agent_runs")
    .select("agent_id, status, cost_usd, duration_ms, created_at")
    .eq("account_id", account.id)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Build weekly revenue data for chart
  const weeklyData = buildWeeklyData(jobs ?? []);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A2744]">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">Revenue, AI attribution, and crew performance</p>
      </div>

      {/* AI Attribution hero panel */}
      <AIAttributionPanel
        revenueAI30d={account.revenue_ai_30d}
        jobsAI30d={account.jobs_ai_booked_30d}
        jobsTotal30d={account.jobs_booked_30d}
        plan={account.plan}
      />

      {/* Revenue trend chart */}
      <div className="bg-white rounded-2xl border border-slate-100 agent-card p-5">
        <h3 className="text-base font-bold text-[#1A2744] mb-4">Revenue Trend (12 weeks)</h3>
        <RevenueChart data={weeklyData} />
      </div>

      {/* Agent performance table */}
      <div className="bg-white rounded-2xl border border-slate-100 agent-card p-5">
        <h3 className="text-base font-bold text-[#1A2744] mb-4">Agent Performance (30 days)</h3>
        <AgentPerformanceTable
          agents={agents ?? []}
          runs={agentRunStats ?? []}
        />
      </div>
    </div>
  );
}

// ─── Helper: build weekly revenue series ─────────────────

function buildWeeklyData(jobs: Array<{ actual_end: string | null; invoice_amount: number | null; booked_by_ai: boolean }>) {
  const weeks: Record<string, { week: string; total: number; ai: number }> = {};

  for (const job of jobs) {
    if (!job.actual_end) continue;
    const d = new Date(job.actual_end);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
    const key = weekStart.toISOString().split("T")[0];
    const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (!weeks[key]) weeks[key] = { week: label, total: 0, ai: 0 };
    weeks[key].total += job.invoice_amount ?? 0;
    if (job.booked_by_ai) weeks[key].ai += job.invoice_amount ?? 0;
  }

  return Object.values(weeks).slice(-12);
}
