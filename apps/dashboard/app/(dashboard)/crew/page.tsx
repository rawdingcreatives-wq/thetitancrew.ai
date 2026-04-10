/**
 * TitanCrew · AI Crew Management Page
 * Full view of all agents: status, metrics, enable/disable toggles,
 * recent run history, and one-click retrain/trigger.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AgentCard } from "@/components/crew/AgentCard";
import { CrewSummaryBar } from "@/components/crew/CrewSummaryBar";
import type { AgentType } from "@/lib/supabase/types";
import { hasFeature } from "@/lib/plan-gates";

interface Account {
  id: string;
  plan: string;
  crew_deployed_at: string | null;
}

interface AgentInstanceData {
  id: string;
  agent_type: AgentType;
  status: string;
  actions_24h: number;
  errors_24h: number;
  last_run_at: string;
  token_cost_30d: number;
  account_id: string;
  is_enabled: boolean;
}

interface AgentRun {
  id: string;
  agent_id: string;
  trigger_event: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  output_summary: string;
  cost_usd: number;
  actions_taken: number;
}

interface DisplayAgent {
  instance: AgentInstanceData | null; // AgentInstanceData is structurally compatible with AgentCard's AgentInstance at runtime
  type: AgentType;
  meta: { tagline: string; features: string[] };
  isProOnly: boolean;
  locked: boolean;
}

// ─── Agent display metadata ─────────────────────────────

const AGENT_DESCRIPTIONS: Record<AgentType, { tagline: string; features: string[] }> = {
  foreman_predictor: {
    tagline: "Supervises the crew and sends your 6am daily briefing.",
    features: ["Daily owner summary SMS", "Pipeline gap detection", "Upsell opportunity finder", "Business health scoring"],
  },
  scheduler: {
    tagline: "Keeps your calendar full. Books jobs 24/7 — even while you're on a job site.",
    features: ["New lead → auto-booked", "Calendar gap-fill sweep", "Customer SMS confirmations", "Emergency priority routing"],
  },
  customer_comm: {
    tagline: "Handles all customer touchpoints so you never miss a follow-up.",
    features: ["Appointment confirmations + reminders", "Review requests post-job", "Estimate follow-ups", "6-month re-engagement"],
  },
  finance_invoice: {
    tagline: "Invoices go out the moment a job is done. Follows up on overdue automatically.",
    features: ["Auto-invoice on job complete", "QuickBooks sync", "7/14/30 day follow-ups", "Monthly revenue reports"],
  },
  parts_inventory: {
    tagline: "Monitors your stock and reorders before you run out — mid-job.",
    features: ["Daily stock scan", "Ferguson + Grainger price compare", "Auto-PO under $200", "Job-ahead parts check"],
  },
  tech_dispatch: {
    tagline: "Optimizes technician routes and sends everyone their daily briefing. (Pro)",
    features: ["Morning tech briefing SMS", "Geo-optimized job sequence", "'On the way' customer SMS", "Same-day emergency slotting"],
  },
  lead_hunter:             { tagline: "Finds leads on social media.", features: [] },
  demo_creator:            { tagline: "Creates personalized demo videos.", features: [] },
  onboarder:               { tagline: "Onboards new customers automatically.", features: [] },
  performance_optimizer:   { tagline: "A/B tests and improves prompts weekly.", features: [] },
  billing_churn_preventer: { tagline: "Prevents cancellations and recovers failed payments.", features: [] },
};

// ─── Server Component ──────────────────────────────────

export default async function CrewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase.from("accounts")
    .select("id, plan, crew_deployed_at")
    .eq("owner_user_id", user.id)
    .single() as { data: Account | null };

  if (!account) redirect("/login");

  const { data: agents } = await supabase.from("agent_instances")
    .select("*")
    .eq("account_id", account.id)
    .order("agent_type") as unknown as { data: AgentInstanceData[] | null };

  // Recent runs for activity feed
  const { data: recentRuns } = await supabase.from("agent_runs")
    .select("id, agent_id, trigger_event, status, started_at, completed_at, duration_ms, output_summary, cost_usd, actions_taken")
    .eq("account_id", account.id)
    .order("started_at", { ascending: false })
    .limit(20) as { data: AgentRun[] | null };

  const customerAgents: AgentType[] = [
    "foreman_predictor", "scheduler", "customer_comm",
    "finance_invoice", "parts_inventory", "tech_dispatch",
  ];

  // tech_dispatch requires the "techDispatch" feature flag (Pro or Elite)
  const canUseTechDispatch = hasFeature(account.plan, "techDispatch");

  const displayAgents: DisplayAgent[] = customerAgents.map((type) => ({
    instance: agents?.find((a: AgentInstanceData) => a.agent_type === type) ?? null,
    type,
    meta: AGENT_DESCRIPTIONS[type],
    isProOnly: type === "tech_dispatch",
    locked: type === "tech_dispatch" && !canUseTechDispatch,
  }));

  const runningCount = agents?.filter((a: AgentInstanceData) => a.status === "running").length ?? 0;
  const errorCount = agents?.filter((a: AgentInstanceData) => a.status === "error").length ?? 0;
  const totalActions24h = agents?.reduce((s: number, a: AgentInstanceData) => s + (a.actions_24h ?? 0), 0) ?? 0;
  const totalCost30d = agents?.reduce((s: number, a: AgentInstanceData) => s + (a.token_cost_30d ?? 0), 0) ?? 0;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A2744]">AI Crew</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your autonomous back-office team — running 24/7.
        </p>
      </div>

      {/* Crew summary bar */}
      <CrewSummaryBar
        runningCount={runningCount}
        errorCount={errorCount}
        totalActions24h={totalActions24h}
        totalCost30d={totalCost30d}
        accountId={account.id}
      />

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayAgents.map(({ instance, type, meta, isProOnly, locked }: DisplayAgent) => (
          <AgentCard
            key={type}
            agentType={type}
            instance={instance as unknown as Parameters<typeof AgentCard>[0]["instance"]}
            tagline={meta.tagline}
            features={meta.features}
            isProOnly={isProOnly}
            locked={locked}
            recentRuns={recentRuns?.filter((r: AgentRun) => r.agent_id === instance?.id).slice(0, 5) ?? []}
            accountId={account.id}
          />
        ))}
      </div>
    </div>
  );
}
