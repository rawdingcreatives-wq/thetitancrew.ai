/**
 * TitanCrew · AgentCard
 * Full-detail card for a single agent: status, toggle, run history, trigger button.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Package, MessageSquare, DollarSign, Cpu, Truck,
  Bot, Play, Lock, Check, AlertTriangle, ChevronDown, ChevronUp,
  Clock, Activity,
} from "lucide-react";
import type { AgentType, AgentStatus } from "@/lib/supabase/types";

interface AgentRun {
  id: string;
  trigger_event: string | null;
  status: string;
  started_at: string;
  duration_ms: number | null;
  output_summary: string | null;
  cost_usd: number;
}

interface AgentInstance {
  id: string;
  agent_type: AgentType;
  status: AgentStatus;
  is_enabled: boolean;
  actions_24h: number;
  errors_24h: number;
  last_run_at: string | null;
  token_cost_30d: number;
}

interface AgentCardProps {
  agentType: AgentType;
  instance: AgentInstance | null;
  tagline: string;
  features: string[];
  isProOnly: boolean;
  locked: boolean;
  recentRuns: AgentRun[];
  accountId: string;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  scheduler: Calendar,
  parts_inventory: Package,
  customer_comm: MessageSquare,
  finance_invoice: DollarSign,
  foreman_predictor: Cpu,
  tech_dispatch: Truck,
};

const AGENT_LABELS: Record<string, string> = {
  scheduler: "Scheduler Agent",
  parts_inventory: "Parts & Inventory",
  customer_comm: "Customer Comm",
  finance_invoice: "Finance & Invoice",
  foreman_predictor: "Foreman AI",
  tech_dispatch: "Tech Dispatch",
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; badge: string }> = {
  idle:          { label: "Idle",      dot: "bg-slate-300",            badge: "text-slate-600 bg-slate-100" },
  running:       { label: "Running",   dot: "bg-blue-500 agent-pulse", badge: "text-blue-700 bg-blue-100" },
  waiting_human: { label: "Waiting",   dot: "bg-amber-400 agent-pulse",badge: "text-amber-700 bg-amber-100" },
  error:         { label: "Error",     dot: "bg-red-500",              badge: "text-red-700 bg-red-100" },
  disabled:      { label: "Disabled",  dot: "bg-slate-200",            badge: "text-slate-400 bg-slate-50" },
};

export function AgentCard({
  agentType, instance, tagline, features, isProOnly, locked, recentRuns, accountId
}: AgentCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const Icon = AGENT_ICONS[agentType] ?? Bot;
  const label = AGENT_LABELS[agentType] ?? agentType;
  const status = instance?.status ?? "disabled";
  const statusConfig = STATUS_CONFIG[status];
  const isEnabled = instance?.is_enabled ?? false;

  const handleToggle = async () => {
    if (locked || !instance) return;
    setToggling(true);
    try {
      await fetch(`/api/agents/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: instance.id, enabled: !isEnabled }),
      });
      router.refresh();
    } finally {
      setToggling(false);
    }
  };

  const handleTrigger = async () => {
    if (locked || !instance) return;
    setTriggering(true);
    try {
      await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, event: agentType, payload: {} }),
      });
      router.refresh();
    } finally {
      setTimeout(() => setTriggering(false), 2000);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border agent-card overflow-hidden transition-all
      ${locked ? "opacity-75 border-slate-100" : status === "error" ? "border-red-200" : "border-slate-100"}`}>

      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Icon + name */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              ${locked ? "bg-slate-100" : "bg-[#1A2744]"}`}>
              {locked
                ? <Lock className="w-4 h-4 text-slate-400" />
                : <Icon className="w-4 h-4 text-[#FF6B00]" />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#1A2744]">{label}</span>
                {isProOnly && (
                  <span className="text-xs font-semibold text-[#FF6B00] bg-orange-50 px-1.5 py-0.5 rounded-full">
                    Pro
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusConfig.dot}`} />
                <span className={`text-xs font-medium ${statusConfig.badge} px-1.5 py-0.5 rounded-full`}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Toggle switch */}
          {!locked && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 mt-0.5
                ${isEnabled ? "bg-[#FF6B00]" : "bg-slate-200"} disabled:opacity-60`}
              style={{ height: "22px" }}
              aria-label={isEnabled ? "Disable agent" : "Enable agent"}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                ${isEnabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          )}

          {locked && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg font-medium flex-shrink-0">
              Upgrade to Pro
            </span>
          )}
        </div>

        {/* Tagline */}
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">{tagline}</p>

        {/* Metrics strip */}
        {instance && !locked && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
            <div className="text-center">
              <p className="text-sm font-bold text-[#1A2744]">{instance.actions_24h}</p>
              <p className="text-xs text-slate-400">actions today</p>
            </div>
            {instance.errors_24h > 0 && (
              <div className="text-center">
                <p className="text-sm font-bold text-red-600">{instance.errors_24h}</p>
                <p className="text-xs text-slate-400">errors</p>
              </div>
            )}
            {instance.last_run_at && (
              <div className="text-center">
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {(() => {
                    const diff = Date.now() - new Date(instance.last_run_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    const hrs = Math.floor(mins / 60);
                    if (mins < 1) return "just now";
                    if (hrs < 1) return `${mins}m ago`;
                    return `${hrs}h ago`;
                  })()}
                </p>
                <p className="text-xs text-slate-400">last run</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!locked && isEnabled && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleTrigger}
              disabled={triggering || status === "running"}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[#FF6B00] text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {triggering ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : status === "running" ? (
                <Activity className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {triggering ? "Triggered" : status === "running" ? "Running..." : "Run Now"}
            </button>

            {features.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded: features + recent runs */}
      {expanded && (
        <div className="border-t border-slate-50">
          {/* Features */}
          {features.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Capabilities</p>
              <div className="space-y-1">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-[#FF6B00] flex-shrink-0" />
                    <span className="text-xs text-slate-600">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent runs */}
          {recentRuns.length > 0 && (
            <div className="px-4 pt-2 pb-3 border-t border-slate-50">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Recent Runs</p>
              <div className="space-y-1.5">
                {recentRuns.map((run) => (
                  <div key={run.id} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      run.status === "success" ? "bg-emerald-500" : "bg-red-500"
                    }`} />
                    <span className="text-xs text-slate-500 flex-1 truncate">
                      {run.trigger_event?.replace(/_/g, " ") ?? "manual"}
                    </span>
                    {run.duration_ms && (
                      <span className="text-xs text-slate-400">{(run.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    <span className="text-xs text-slate-400">
                      ${run.cost_usd?.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
