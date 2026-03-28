/**
 * TitanCrew · AgentStatusStrip
 * Compact card showing all 5-6 agents and their live status.
 * Clicking an agent navigates to its detail page.
 */

"use client";

import Link from "next/link";
import {
  Calendar, Package, MessageSquare, DollarSign,
  Cpu, Truck, Bot, AlertTriangle, Clock, Zap,
} from "lucide-react";
import type { AgentType, AgentStatus } from "@/lib/supabase/types";

interface AgentInstance {
  id: string;
  agent_type: AgentType;
  status: AgentStatus;
  actions_24h: number;
  errors_24h: number;
  last_run_at: string | null;
  token_cost_30d: number;
}

interface AgentStatusStripProps {
  agents: AgentInstance[];
}

const AGENT_META: Record<AgentType, { label: string; icon: React.ElementType; shortLabel: string }> = {
  scheduler:              { label: "Scheduler",        icon: Calendar,       shortLabel: "Schedule" },
  parts_inventory:        { label: "Parts & Stock",    icon: Package,        shortLabel: "Parts" },
  customer_comm:          { label: "Customer Comm",    icon: MessageSquare,  shortLabel: "Comms" },
  finance_invoice:        { label: "Finance",          icon: DollarSign,     shortLabel: "Finance" },
  foreman_predictor:      { label: "Foreman AI",       icon: Cpu,            shortLabel: "Foreman" },
  tech_dispatch:          { label: "Dispatch",         icon: Truck,          shortLabel: "Dispatch" },
  lead_hunter:            { label: "Lead Hunter",      icon: Bot,            shortLabel: "Leads" },
  demo_creator:           { label: "Demo Creator",     icon: Zap,            shortLabel: "Demo" },
  onboarder:              { label: "Onboarder",        icon: Bot,            shortLabel: "Onboard" },
  performance_optimizer:  { label: "Optimizer",        icon: Zap,            shortLabel: "Optimize" },
  billing_churn_preventer:{ label: "Churn Guard",      icon: AlertTriangle,  shortLabel: "Churn" },
};

const STATUS_STYLES: Record<AgentStatus, { dot: string; badge: string; label: string }> = {
  idle:          { dot: "bg-slate-300",                  badge: "text-slate-500 bg-slate-100",    label: "Idle" },
  running:       { dot: "bg-blue-500 agent-pulse",       badge: "text-blue-700 bg-blue-100",      label: "Running" },
  waiting_human: { dot: "bg-amber-400 agent-pulse",      badge: "text-amber-700 bg-amber-100",    label: "Waiting" },
  error:         { dot: "bg-red-500",                    badge: "text-red-700 bg-red-100",        label: "Error" },
  disabled:      { dot: "bg-slate-200",                  badge: "text-slate-400 bg-slate-50",     label: "Off" },
};

export function AgentStatusStrip({ agents }: AgentStatusStripProps) {
  const customerAgentTypes: AgentType[] = [
    "foreman_predictor", "scheduler", "customer_comm",
    "finance_invoice", "parts_inventory", "tech_dispatch",
  ];

  // Show only customer crew agents, in priority order
  const displayAgents = customerAgentTypes
    .map((type) => agents.find((a) => a.agent_type === type))
    .filter(Boolean) as AgentInstance[];

  const runningCount = agents.filter((a) => a.status === "running").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 agent-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#1A2744]" />
          <h3 className="text-sm font-bold text-[#1A2744]">AI Crew</h3>
        </div>
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
              {runningCount} active
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {errorCount} error
            </span>
          )}
        </div>
      </div>

      {/* Agent list */}
      <div className="px-3 pb-3 space-y-1">
        {displayAgents.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">
            No agents deployed yet.
          </p>
        )}

        {displayAgents.map((agent) => {
          const meta = AGENT_META[agent.agent_type];
          const statusStyle = STATUS_STYLES[agent.status];
          const Icon = meta.icon;

          const lastRunLabel = agent.last_run_at
            ? (() => {
                const diff = Date.now() - new Date(agent.last_run_at).getTime();
                const mins = Math.floor(diff / 60000);
                const hrs = Math.floor(mins / 60);
                if (mins < 1) return "just now";
                if (hrs < 1) return `${mins}m ago`;
                if (hrs < 24) return `${hrs}h ago`;
                return `${Math.floor(hrs / 24)}d ago`;
              })()
            : "never";

          return (
            <Link
              key={agent.id}
              href={`/crew/${agent.agent_type}`}
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors group"
            >
              {/* Status dot */}
              <div className="relative flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
              </div>

              {/* Icon + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-medium text-[#1A2744] truncate">{meta.label}</span>
              </div>

              {/* Right side: actions count + last run */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {agent.actions_24h > 0 && (
                  <span className="text-xs text-slate-400">{agent.actions_24h} actions</span>
                )}
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${statusStyle.badge}`}>
                  {statusStyle.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-slate-50">
        <Link href="/crew" className="text-xs text-[#FF6B00] font-medium hover:underline">
          Manage crew →
        </Link>
      </div>
    </div>
  );
}
