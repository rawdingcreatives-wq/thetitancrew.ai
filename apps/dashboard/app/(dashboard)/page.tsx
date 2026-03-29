// @ts-nocheck
/**
 * TitanCrew · Main Dashboard Home Page
 * Shows: AI revenue widget, daily summary banner, live job feed,
 * agent status strip, and quick action buttons.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DailySummaryBanner } from "@/components/shared/DailySummaryBanner";
import { AIRevenueWidget } from "@/components/analytics/AIRevenueWidget";
import { LiveJobFeed } from "@/components/jobs/LiveJobFeed";
import { AgentStatusStrip } from "@/components/crew/AgentStatusStrip";
import { HILConfirmBanner } from "@/components/shared/HILConfirmBanner";
import { QuickActions } from "@/components/shared/QuickActions";
import { MetricsRow } from "@/components/analytics/MetricsRow";
import type { Database } from "@/lib/supabase/types";

// ─── Data fetching ────────────────────────────────────────

async function getDashboardData(accountId: string) {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();

  const [accountRes, jobsRes, agentsRes, hilRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("business_name, owner_name, plan, jobs_booked_30d, jobs_ai_booked_30d, revenue_ai_30d, churn_risk_score, onboard_step, crew_deployed_at")
      .eq("id", accountId)
      .single(),

    supabase
      .from("jobs")
      .select("id, title, status, priority, scheduled_start, estimate_amount, invoice_amount, booked_by_ai, source, trade_customers(name, phone), technicians(name)")
      .eq("account_id", accountId)
      .not("status", "in", '("paid","canceled")')
      .order("scheduled_start", { ascending: true })
      .limit(20),

    supabase
      .from("agent_instances")
      .select("id, agent_type, status, actions_24h, errors_24h, last_run_at, token_cost_30d")
      .eq("account_id", accountId)
      .eq("is_enabled", true),

    supabase
      .from("hil_confirmations")
      .select("id, description, amount, action_type, risk_level, expires_at, response_token")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Today's revenue
  const { data: todayJobs } = await supabase
    .from("jobs")
    .select("invoice_amount, booked_by_ai")
    .eq("account_id", accountId)
    .gte("scheduled_start", todayStart)
    .in("status", ["scheduled", "in_progress", "completed", "invoiced", "paid"]);

  const todayRevenue = (todayJobs ?? []).reduce((s, j) => s + (j.invoice_amount ?? j.invoice_amount ?? 0), 0);

  return {
    account: accountRes.data,
    jobs: jobsRes.data ?? [],
    agents: agentsRes.data ?? [],
    pendingHIL: hilRes.data ?? [],
    todayRevenue,
  };
}

// ─── Server Component ────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get account ID for this user
  const { data: account } = await supabase
    .from("accounts")
    .select("id, onboard_step, crew_deployed_at")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/login");

  // Redirect to onboarding if not complete
  if (!account.crew_deployed_at && (account.onboard_step ?? 0) < 7) {
    redirect("/onboarding");
  }

  const data = await getDashboardData(account.id);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Pending HIL confirmation banners (top priority) */}
      {data.pendingHIL.map((hil) => (
        <HILConfirmBanner key={hil.id} confirmation={hil} />
      ))}

      {/* Daily AI summary banner */}
      <DailySummaryBanner
        businessName={data.account?.business_name ?? "your business"}
        ownerName={data.account?.owner_name ?? "there"}
      />

      {/* Key metrics row */}
      <MetricsRow
        jobsBooked30d={data.account?.jobs_booked_30d ?? 0}
        jobsAIBooked30d={data.account?.jobs_ai_booked_30d ?? 0}
        revenueAI30d={data.account?.revenue_ai_30d ?? 0}
        todayRevenue={data.todayRevenue}
        churnRisk={data.account?.churn_risk_score ?? 0}
      />

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Live Job Feed (2/3 width) */}
        <div className="xl:col-span-2 space-y-5">
          <LiveJobFeed jobs={data.jobs} />
        </div>

        {/* Right: AI Revenue + Agent Status (1/3 width) */}
        <div className="space-y-5">
          <AIRevenueWidget
            revenueAI30d={data.account?.revenue_ai_30d ?? 0}
            jobsAI30d={data.account?.jobs_ai_booked_30d ?? 0}
            jobsTotal30d={data.account?.jobs_booked_30d ?? 0}
          />
          <AgentStatusStrip agents={data.agents} />
          <QuickActions accountId={account.id} />
        </div>
      </div>
    </div>
  );
}
