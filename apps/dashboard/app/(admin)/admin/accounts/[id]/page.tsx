// @ts-nocheck
"use client";

/**
 * TitanCrew Â· Admin Account Detail Page
 *
 * /admin/accounts/[id]
 *
 * Deep-dive view for a single tenant account.
 * Shows: account info, subscription/billing, agent status,
 * job history, support tickets, and audit log.
 */

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin,
  CreditCard, Bot, Wrench, Calendar, DollarSign,
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Activity, Shield, ExternalLink, Loader2, XCircle,
} from "lucide-react";

// âââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââ

interface Account {
  id: string;
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  trade_type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  plan: string;
  subscription_status: string;
  stripe_customer_id: string;
  stripe_sub_id: string;
  mrr: number;
  created_at: string;
  onboarding_completed: boolean;
  google_connected_at: string | null;
  tech_count: number;
}

interface AgentStatus {
  agent_type: string;
  is_enabled: boolean;
  last_run_at: string | null;
  last_error: string | null;
  actions_24h: number;
}

interface RecentJob {
  id: string;
  customer_name: string;
  service_type: string;
  status: string;
  scheduled_at: string;
  amount: number;
}

interface BillingEvent {
  id: string;
  event_type: string;
  amount: number;
  created_at: string;
}

// âââ Status badge helpers âââââââââââââââââââââââââââââââââââââ

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-500/20 text-green-400",
  trialing:  "bg-blue-500/20 text-blue-400",
  past_due:  "bg-amber-500/20 text-amber-400",
  canceled:  "bg-red-500/20 text-red-400",
  paused:    "bg-slate-500/20 text-slate-400",
};

const PLAN_COLORS: Record<string, string> = {
  basic: "bg-slate-500/20 text-slate-300",
  pro:   "bg-[#FF6B00]/20 text-[#FF6B00]",
  enterprise: "bg-purple-500/20 text-purple-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-500/20 text-slate-300"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// âââ Component âââââââââââââââââââââââââââââââââââââââââââââââ

export default function AdminAccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [account, setAccount] = useState<Account | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccount() {
      const supabase = createClient();

      // Fetch account
      const { data: acc, error: accErr } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .single();

      if (accErr || !acc) {
        setError("Account not found");
        setLoading(false);
        return;
      }

      setAccount(acc as Account);

      // Fetch agents, jobs, billing in parallel
      const [agentsRes, jobsRes, billingRes] = await Promise.all([
        supabase
          .from("agent_instances")
          .select("agent_type, is_enabled, last_run_at, last_error, actions_24h")
          .eq("account_id", accountId),
        supabase
          .from("jobs")
          .select("id, customer_name, service_type, status, scheduled_at, amount")
          .eq("account_id", accountId)
          .order("scheduled_at", { ascending: false })
          .limit(10),
        supabase
          .from("billing_events")
          .select("id, event_type, amount, created_at")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setAgents((agentsRes.data ?? []) as AgentStatus[]);
      setRecentJobs((jobsRes.data ?? []) as RecentJob[]);
      setBillingEvents((billingRes.data ?? []) as BillingEvent[]);
      setLoading(false);
    }

    loadAccount();
  }, [accountId]);

  // ââ Loading state âââââââââââââââââââââââââââââââââââââââââ
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Loading account details...
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-lg font-semibold text-white mb-2">{error ?? "Account not found"}</p>
        <Link href="/admin/accounts" className="text-[#FF6B00] hover:underline text-sm">
          Back to all accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ââ Header âââââââââââââââââââââââââââââââââââââââââââ */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/admin/accounts")}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{account.business_name}</h1>
          <p className="text-sm text-slate-400">{account.trade_type} &middot; {account.city}, {account.state}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${PLAN_COLORS[account.plan] ?? PLAN_COLORS.basic}`}>
            {account.plan}
          </span>
          <StatusBadge status={account.subscription_status} />
        </div>
      </div>

      {/* ââ Info Cards Grid ââââââââââââââââââââââââââââââââââ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard icon={User} label="Owner" value={account.owner_name} />
        <InfoCard icon={Mail} label="Email" value={account.email} />
        <InfoCard icon={Phone} label="Phone" value={account.phone || "Not set"} />
        <InfoCard icon={DollarSign} label="MRR" value={`$${(account.mrr ?? 0).toFixed(0)}`} highlight />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard icon={Calendar} label="Joined" value={new Date(account.created_at).toLocaleDateString()} />
        <InfoCard icon={Wrench} label="Tech Count" value={String(account.tech_count ?? 0)} />
        <InfoCard
          icon={CheckCircle2}
          label="Onboarded"
          value={account.onboarding_completed ? "Yes" : "No"}
          valueColor={account.onboarding_completed ? "text-green-400" : "text-amber-400"}
        />
        <InfoCard
          icon={Activity}
          label="Google Calendar"
          value={account.google_connected_at ? "Connected" : "Not connected"}
          valueColor={account.google_connected_at ? "text-green-400" : "text-slate-500"}
        />
      </div>

      {/* ââ AI Agents ââââââââââââââââââââââââââââââââââââââââ */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#FF6B00]" />
          AI Agents
        </h2>
        {agents.length === 0 ? (
          <p className="text-sm text-slate-500">No agents deployed yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <div
                key={agent.agent_type}
                className={`rounded-lg border p-4 ${
                  agent.is_enabled
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white capitalize">
                    {agent.agent_type.replace(/_/g, " ")}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${agent.is_enabled ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-500"}`}>
                    {agent.is_enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <p>Actions (24h): {agent.actions_24h ?? 0}</p>
                  {agent.last_run_at && (
                    <p>Last run: {new Date(agent.last_run_at).toLocaleString()}</p>
                  )}
                  {agent.last_error && (
                    <p className="text-red-400 truncate" title={agent.last_error}>
                      Error: {agent.last_error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ââ Recent Jobs âââââââââââââââââââââââââââââââââââââ */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-[#FF6B00]" />
          Recent Jobs
        </h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-slate-500">No jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Service</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Scheduled</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {recentJobs.map((job) => (
                  <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 pr-4">{job.customer_name}</td>
                    <td className="py-2 pr-4 text-slate-400">{job.service_type}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {new Date(job.scheduled_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right font-medium">
                      ${(job.amount ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ââ Billing Events ââââââââââââââââââââââââââââââââââ */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#FF6B00]" />
          Billing Events
        </h2>
        {billingEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No billing events.</p>
        ) : (
          <div className="space-y-2">
            {billingEvents.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-slate-300">{evt.event_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-500">{new Date(evt.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-sm font-semibold ${evt.event_type.includes("paid") ? "text-green-400" : "text-slate-300"}`}>
                  ${(evt.amount ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ââ Stripe Link âââââââââââââââââââââââââââââââââââââ */}
      {account.stripe_customer_id && (
        <div className="text-center">
          <a
            href={`https://dashboard.stripe.com/customers/${account.stripe_customer_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#FF6B00] hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            View in Stripe Dashboard
          </a>
        </div>
      )}
    </div>
  );
}

// âââ Reusable info card ââââââââââââââââââââââââââââââââââââââ

function InfoCard({
  icon: Icon,
  label,
  value,
  highlight = false,
  valueColor,
}: {
  icon: any;
  label: string;
  value: string;
  highlight?: boolean;
  valueColor?: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-[#FF6B00]/30 bg-[#FF6B00]/5" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${highlight ? "text-[#FF6B00]" : "text-slate-500"}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${valueColor ?? (highlight ? "text-[#FF6B00]" : "text-white")}`}>
        {value}
      </p>
    </div>
  );
}
