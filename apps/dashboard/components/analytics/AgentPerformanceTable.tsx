/**
 * TitanCrew · AgentPerformanceTable
 * Shows per-agent stats: runs, success rate, avg latency, 30d cost.
 */

"use client";

import { CheckCircle, XCircle, Clock, DollarSign } from "lucide-react";
import type { AgentType } from "@/lib/supabase/types";

const AGENT_LABELS: Partial<Record<AgentType, string>> = {
  foreman_predictor: "Foreman AI",
  scheduler: "Scheduler",
  customer_comm: "Customer Comm",
  finance_invoice: "Finance",
  parts_inventory: "Parts & Stock",
  tech_dispatch: "Tech Dispatch",
};

interface AgentInstance {
  id: string;
  agent_type: AgentType;
  actions_24h: number;
  errors_24h: number;
  token_cost_30d: number;
  last_run_at: string | null;
}

interface AgentRun {
  agent_id: string;
  status: string;
  cost_usd: number;
  duration_ms: number | null;
}

interface AgentPerformanceTableProps {
  agents: AgentInstance[];
  runs: AgentRun[];
}

export function AgentPerformanceTable({ agents, runs }: AgentPerformanceTableProps) {
  const customerTypes: AgentType[] = [
    "foreman_predictor", "scheduler", "customer_comm",
    "finance_invoice", "parts_inventory", "tech_dispatch",
  ];

  const tableAgents = customerTypes
    .map((t) => agents.find((a) => a.agent_type === t))
    .filter(Boolean) as AgentInstance[];

  const getStats = (agentId: string) => {
    const agentRuns = runs.filter((r) => r.agent_id === agentId);
    const total = agentRuns.length;
    const success = agentRuns.filter((r) => r.status === "success").length;
    const avgLatency = agentRuns.length > 0
      ? Math.round(agentRuns.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / agentRuns.length / 1000)
      : 0;
    const totalCost = agentRuns.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    return { total, success, successRate: total > 0 ? (success / total * 100).toFixed(0) : "—", avgLatency, totalCost };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Runs (30d)</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Success</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Time</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">API Cost</th>
            <th className="text-right py-2 pl-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions/day</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tableAgents.map((agent) => {
            const stats = getStats(agent.id);
            return (
              <tr key={agent.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 pr-4">
                  <span className="font-medium text-[#1A2744]">
                    {AGENT_LABELS[agent.agent_type] ?? agent.agent_type}
                  </span>
                </td>
                <td className="text-right py-3 px-3 text-slate-600 font-medium">{stats.total}</td>
                <td className="text-right py-3 px-3">
                  <span className={`font-semibold ${
                    stats.successRate === "—" ? "text-slate-400" :
                    parseInt(stats.successRate) >= 90 ? "text-emerald-600" :
                    parseInt(stats.successRate) >= 70 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {stats.successRate}{stats.successRate !== "—" ? "%" : ""}
                  </span>
                </td>
                <td className="text-right py-3 px-3 text-slate-500">
                  {stats.avgLatency > 0 ? `${stats.avgLatency}s` : "—"}
                </td>
                <td className="text-right py-3 px-3 text-slate-500">
                  ${stats.totalCost.toFixed(3)}
                </td>
                <td className="text-right py-3 pl-3 text-slate-600 font-medium">
                  {agent.actions_24h}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
