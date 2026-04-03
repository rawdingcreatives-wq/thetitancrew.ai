// @ts-nocheck
/**
 * TitanCrew · Admin AI Agent Health Monitor
 *
 * Platform-wide agent status grid, error rates, token costs,
 * recent runs, and ability to restart/disable agents.
 */
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Bot, Activity, AlertTriangle, Clock, Zap, DollarSign,
  RefreshCw, Power, PowerOff, CheckCircle, XCircle,
  Cpu, BarChart3,
} from "lucide-react";

interface AgentInstance {
  id: string;
  account_id: string;
  agent_type: string;
  status: string;
  is_enabled: boolean;
  actions_24h: number;
  errors_24h: number;
  avg_latency_ms: number | null;
  token_cost_30d: number;
  last_run_at: string | null;
  last_error: string | null;
  business_name?: string;
}

interface AgentRun {
  id: string;
  agent_type?: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  cost_usd: number;
  error_message: string | null;
  output_summary: string | null;
}

interface AgentTypeSummary {
  type: string;
  total: number;
  running: number;
  idle: number;
  error: number;
  disabled: number;
  totalCost30d: number;
  totalActions24h: number;
  totalErrors24h: number;
}

const STATUS_ICONS: Record<string, any> = {
  idle: Clock,
  running: Activity,
  waiting_human: Zap,
  error: AlertTriangle,
  disabled: PowerOff,
};

const STATUS_COLORS: Record<string, string> = {
  idle: "text-slate-400",
  running: "text-emerald-400",
  waiting_human: "text-amber-400",
  error: "text-red-400",
  disabled: "text-slate-600",
};

const STATUS_BG: Record<string, string> = {
  idle: "bg-slate-500/20",
  running: "bg-emerald-500/20",
  waiting_human: "bg-amber-500/20",
  error: "bg-red-500/20",
  disabled: "bg-slate-500/10",
};

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [summaries, setSummaries] = useState<AgentTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const supabase = createClient();

    const [agentsRes, runsRes] = await Promise.all([
      (supabase.from("agent_instances") as any)
        .select("id, account_id, agent_type, status, is_enabled, actions_24h, errors_24h, avg_latency_ms, token_cost_30d, last_run_at, last_error")
        .order("status", { ascending: true }),
      (supabase.from("agent_runs") as any)
        .select("id, status, started_at, completed_at, duration_ms, cost_usd, error_message, output_summary")
        .order("started_at", { ascending: false })
        .limit(15),
    ]);

    const agentList: AgentInstance[] = agentsRes.data ?? [];
    setAgents(agentList);
    setRecentRuns(runsRes.data ?? []);

    // Build summaries by agent type
    const typeMap: Record<string, AgentTypeSummary> = {};
    for (const a of agentList) {
      if (!typeMap[a.agent_type]) {
        typeMap[a.agent_type] = {
          type: a.agent_type,
          total: 0, running: 0, idle: 0, error: 0, disabled: 0,
          totalCost30d: 0, totalActions24h: 0, totalErrors24h: 0,
        };
      }
      const s = typeMap[a.agent_type];
      s.total++;
      if (a.status === "running") s.running++;
      else if (a.status === "idle") s.idle++;
      else if (a.status === "error") s.error++;
      if (!a.is_enabled) s.disabled++;
      s.totalCost30d += parseFloat(String(a.token_cost_30d)) || 0;
      s.totalActions24h += a.actions_24h ?? 0;
      s.totalErrors24h += a.errors_24h ?? 0;
    }
    setSummaries(Object.values(typeMap).sort((a, b) => b.total - a.total));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggleAgent = async (agentId: string, enable: boolean) => {
    const supabase = createClient();
    await (supabase.from("agent_instances") as any)
      .update({ is_enabled: enable, status: enable ? "idle" : "disabled" })
      .eq("id", agentId);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading agent health data…</span>
        </div>
      </div>
    );
  }

  const totalAgents = agents.length;
  const runningCount = agents.filter((a) => a.status === "running").length;
  const errorCount = agents.filter((a) => a.status === "error").length;
  const totalCost = agents.reduce((s, a) => s + (parseFloat(String(a.token_cost_30d)) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">AI Agent Health</h1>
          <p className="text-sm text-slate-400 mt-1">Platform-wide agent monitoring and control</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm text-white hover:bg-white/15 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AgentKPI icon={Bot} label="Total Agents" value={totalAgents} color="from-blue-500 to-blue-700" />
        <AgentKPI icon={Activity} label="Running" value={runningCount} color="from-emerald-500 to-emerald-700" />
        <AgentKPI icon={AlertTriangle} label="Errors" value={errorCount} color={errorCount > 0 ? "from-red-500 to-red-700" : "from-slate-500 to-slate-700"} />
        <AgentKPI icon={DollarSign} label="Token Cost (30d)" value={`$${totalCost.toFixed(2)}`} color="from-[#FF6B00] to-orange-700" />
      </div>

      {/* Agent Type Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map((s) => (
          <div key={s.type} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-[#FF6B00]" />
              <span className="text-sm font-semibold text-white capitalize">{s.type.replace(/_/g, " ")}</span>
              <span className="text-xs text-slate-500 ml-auto">{s.total} instances</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-emerald-400">{s.running}</p>
                <p className="text-xs text-slate-500">Running</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400">{s.error}</p>
                <p className="text-xs text-slate-500">Errors</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-300">${s.totalCost30d.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Cost 30d</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">{s.totalActions24h} actions / 24h</span>
              {s.totalErrors24h > 0 && (
                <span className="text-xs text-red-400">{s.totalErrors24h} errors / 24h</span>
              )}
            </div>
          </div>
        ))}
        {summaries.length === 0 && (
          <div className="col-span-full text-center py-8 text-slate-500">
            No agent instances deployed yet.
          </div>
        )}
      </div>

      {/* Recent Runs */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#FF6B00]" />
            Recent Agent Runs
          </h2>
        </div>
        <div className="divide-y divide-white/5">
          {recentRuns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">No agent runs recorded yet.</p>
          ) : (
            recentRuns.map((run) => (
              <div key={run.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {run.status === "success" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : run.status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-white truncate">
                      {run.output_summary || run.error_message || `Run ${run.id.slice(0, 8)}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-5">
                    {new Date(run.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {run.duration_ms != null && ` · ${(run.duration_ms / 1000).toFixed(1)}s`}
                    {run.cost_usd > 0 && ` · $${run.cost_usd.toFixed(4)}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  run.status === "success" ? "bg-emerald-500/20 text-emerald-400" :
                  run.status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-amber-500/20 text-amber-400"
                }`}>
                  {run.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AgentKPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
