// @ts-nocheck
/**
 * TitanCrew · Admin Dashboard Home
 *
 * Real-time KPI cards: total accounts, MRR, active agents,
 * churn risk, open tickets, recent signups, and system health.
 */
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Users, DollarSign, Bot, AlertTriangle, HeadphonesIcon,
  TrendingUp, Activity, Zap, ArrowUpRight, ArrowDownRight,
  Clock, UserPlus, UserMinus, BarChart3,
} from "lucide-react";

interface KPI {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: any;
  color: string;
}

interface RecentAccount {
  id: string;
  business_name: string;
  owner_name: string;
  trade_type: string;
  plan: string;
  created_at: string;
  subscription_status: string;
}

interface RecentAgentError {
  id: string;
  agent_type: string;
  last_error: string;
  account_id: string;
  business_name?: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [agentErrors, setAgentErrors] = useState<RecentAgentError[]>([]);
  const [openTickets, setOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      // Fetch all stats in parallel
      const [
        accountsRes,
        activeRes,
        trialRes,
        canceledRes,
        mrrRes,
        agentsRunningRes,
        agentsErrorRes,
        recentRes,
        ticketsRes,
        churnRiskRes,
        agentErrorListRes,
      ] = await Promise.all([
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "trialing"),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
        (supabase.from("accounts") as any).select("mrr"),
        (supabase.from("agent_instances") as any).select("id", { count: "exact", head: true }).eq("status", "running"),
        (supabase.from("agent_instances") as any).select("id", { count: "exact", head: true }).eq("status", "error"),
        (supabase.from("accounts") as any).select("id, business_name, owner_name, trade_type, plan, created_at, subscription_status").order("created_at", { ascending: false }).limit(8),
        (supabase.from("support_tickets") as any).select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).gte("churn_risk_score", 0.7),
        (supabase.from("agent_instances") as any).select("id, agent_type, last_error, account_id").eq("status", "error").limit(5),
      ]);

      const totalMRR = (mrrRes.data ?? []).reduce((sum: number, a: any) => sum + (parseFloat(a.mrr) || 0), 0);

      setStats({
        totalAccounts: accountsRes.count ?? 0,
        activeAccounts: activeRes.count ?? 0,
        trialAccounts: trialRes.count ?? 0,
        canceledAccounts: canceledRes.count ?? 0,
        mrr: totalMRR,
        arr: totalMRR * 12,
        agentsRunning: agentsRunningRes.count ?? 0,
        agentsError: agentsErrorRes.count ?? 0,
        churnRisk: churnRiskRes.count ?? 0,
      });

      setRecentAccounts(recentRes.data ?? []);
      setOpenTickets(ticketsRes.count ?? 0);
      setAgentErrors(agentErrorListRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading admin dashboard…</span>
        </div>
      </div>
    );
  }

  const kpis: KPI[] = [
    { label: "Total Accounts",  value: (stats?.totalAccounts ?? 0).toLocaleString(),    icon: Users,           color: "from-blue-500 to-blue-700" },
    { label: "Active Accounts", value: (stats?.activeAccounts ?? 0).toLocaleString(),   icon: UserPlus,        color: "from-emerald-500 to-emerald-700" },
    { label: "Trials",          value: (stats?.trialAccounts ?? 0).toLocaleString(),    icon: Clock,           color: "from-amber-500 to-amber-700" },
    { label: "MRR",             value: "$" + (stats?.mrr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), icon: DollarSign, color: "from-[#FF6B00] to-orange-700" },
    { label: "ARR",             value: "$" + (stats?.arr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), icon: TrendingUp, color: "from-purple-500 to-purple-700" },
    { label: "Agents Running",  value: (stats?.agentsRunning ?? 0).toLocaleString(),    icon: Bot,             color: "from-cyan-500 to-cyan-700" },
    { label: "Agent Errors",    value: (stats?.agentsError ?? 0).toLocaleString(),      icon: AlertTriangle,   color: stats?.agentsError > 0 ? "from-red-500 to-red-700" : "from-slate-500 to-slate-700" },
    { label: "Open Tickets",    value: openTickets.toLocaleString(),                     icon: HeadphonesIcon,  color: openTickets > 0 ? "from-yellow-500 to-yellow-700" : "from-slate-500 to-slate-700" },
    { label: "Churn Risk",      value: (stats?.churnRisk ?? 0).toLocaleString(),        icon: UserMinus,       color: stats?.churnRisk > 0 ? "from-red-500 to-red-700" : "from-slate-500 to-slate-700" },
    { label: "Canceled",        value: (stats?.canceledAccounts ?? 0).toLocaleString(), icon: ArrowDownRight,  color: "from-rose-500 to-rose-700" },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Mission Control</h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time platform overview — {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Two-column: Recent Signups + Agent Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Signups */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#FF6B00]" />
              Recent Signups
            </h2>
            <a href="/admin/accounts" className="text-xs text-[#FF6B00] hover:underline">
              View all →
            </a>
          </div>
          <div className="divide-y divide-white/5">
            {recentAccounts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No accounts yet.</p>
            ) : (
              recentAccounts.map((acc) => (
                <div key={acc.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{acc.business_name}</p>
                    <p className="text-xs text-slate-400 truncate">{acc.owner_name} · {acc.trade_type}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      acc.subscription_status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                      acc.subscription_status === "trialing" ? "bg-amber-500/20 text-amber-400" :
                      "bg-slate-500/20 text-slate-400"
                    }`}>
                      {acc.subscription_status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(acc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Errors */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Agent Errors
            </h2>
            <a href="/admin/agents" className="text-xs text-[#FF6B00] hover:underline">
              View all →
            </a>
          </div>
          <div className="divide-y divide-white/5">
            {agentErrors.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Activity className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-400 font-medium">All systems nominal</p>
                <p className="text-xs text-slate-500 mt-0.5">No agent errors detected</p>
              </div>
            ) : (
              agentErrors.map((err) => (
                <div key={err.id} className="px-4 py-3 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white capitalize">
                      {err.agent_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">error</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 truncate">{err.last_error}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
