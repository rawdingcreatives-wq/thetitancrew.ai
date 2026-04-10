/**
 * TitanCrew · Dashboard Home Page (/home)
 *
 * Shows: AI revenue widget, daily summary banner, live job feed,
 * agent status strip, and quick action buttons.
 *
 * The root "/" shows the landing page for visitors;
 * authenticated users are redirected here to /home.
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

interface DashboardAccount {
  id: string;
  business_name: string;
  owner_name: string;
  plan: string;
  jobs_booked_30d: number;
  jobs_ai_booked_30d: number;
  revenue_ai_30d: number;
  churn_risk_score: number;
  onboard_step: number;
  crew_deployed_at: string | null;
}

interface Customer {
  name: string;
  phone: string;
}

interface Technician {
  name: string;
}

interface JobData {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string;
  estimate_amount: number;
  invoice_amount: number;
  booked_by_ai: boolean;
  source: string;
  trade_customers: Customer;
  technicians: Technician;
}

interface AgentInstanceData {
  id: string;
  agent_type: string;
  status: string;
  actions_24h: number;
  errors_24h: number;
  last_run_at: string;
  token_cost_30d: number;
}

interface HILConfirmation {
  id: string;
  description: string;
  amount: number;
  action_type: string;
  risk_level: string;
  expires_at: string;
  response_token: string;
}

interface TodayJob {
  invoice_amount: number;
  booked_by_ai: boolean;
}

interface AccountData {
  id: string;
  onboard_step: number;
  crew_deployed_at: string | null;
}

// ─── Data fetching ────────────────────────────────────────

async function getDashboardData(accountId: string) {
  const supabase = await createClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

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
      .limit(20) as unknown as { data: JobData[] | null },

    supabase
      .from("agent_instances")
      .select("id, agent_type, status, actions_24h, errors_24h, last_run_at, token_cost_30d")
      .eq("account_id", accountId)
      .eq("is_enabled", true) as unknown as { data: AgentInstanceData[] | null },

    supabase
      .from("hil_confirmations")
      .select("id, description, amount, action_type, risk_level, expires_at, response_token")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Today's revenue
  const todayJobsRes = await supabase.from("jobs")
    .select("invoice_amount, booked_by_ai")
    .eq("account_id", accountId)
    .gte("scheduled_start", todayStart)
    .in("status", ["scheduled", "in_progress", "completed", "invoiced", "paid"]);
  const todayJobs = todayJobsRes.data;

  const todayRevenue = (todayJobs ?? []).reduce((s: number, j: TodayJob) => s + (j.invoice_amount ?? 0), 0);

  return {
    account: accountRes.data as DashboardAccount | null,
    jobs: (jobsRes.data ?? []) as JobData[],
    agents: (agentsRes.data ?? []) as AgentInstanceData[],
    pendingHIL: (hilRes.data ?? []) as HILConfirmation[],
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
    .single() as { data: AccountData | null };

  if (!account) redirect("/onboarding");

  // Redirect to onboarding if crew was never successfully deployed.
  // crew_deployed_at is the canonical signal — it is only set after the agent
  // trigger succeeds (via /api/account/complete-onboarding or OnboarderAgent).
  if (!account.crew_deployed_at) {
    redirect("/onboarding");
  }

  const data = await getDashboardData(account.id);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Pending HIL confirmation banners (top priority) */}
      {data.pendingHIL.map((hil: HILConfirmation) => (
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
          {/* JobData structurally matches LiveJobFeed's Job interface at runtime */}
          <LiveJobFeed jobs={data.jobs as unknown as Parameters<typeof LiveJobFeed>[0]["jobs"]} />
        </div>

        {/* Right: AI Revenue + Agent Status (1/3 width) */}
        <div className="space-y-5">
          <AIRevenueWidget
            revenueAI30d={data.account?.revenue_ai_30d ?? 0}
            jobsAI30d={data.account?.jobs_ai_booked_30d ?? 0}
            jobsTotal30d={data.account?.jobs_booked_30d ?? 0}
          />
          <AgentStatusStrip agents={data.agents as unknown as Parameters<typeof AgentStatusStrip>[0]["agents"]} />
          <QuickActions accountId={account.id} />
        </div>
      </div>
    </div>
  );
}
