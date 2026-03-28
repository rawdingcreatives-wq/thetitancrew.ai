/**
 * TitanCrew · QuickActions
 * One-tap shortcuts for common owner actions from the dashboard.
 */

"use client";

import { useState } from "react";
import { Plus, RefreshCw, Bot, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface QuickActionsProps {
  accountId: string;
}

export function QuickActions({ accountId }: QuickActionsProps) {
  const router = useRouter();
  const [triggering, setTriggering] = useState<string | null>(null);

  const triggerAgent = async (event: string, label: string) => {
    setTriggering(event);
    try {
      const res = await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, event, payload: {} }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error(`Trigger ${event} failed:`, err);
    } finally {
      setTimeout(() => setTriggering(null), 1500);
    }
  };

  const actions = [
    {
      id: "new_job",
      label: "New Job",
      icon: Plus,
      color: "bg-[#1A2744] text-white hover:bg-navy-800",
      onClick: () => router.push("/jobs?new=1"),
    },
    {
      id: "daily_morning_sweep",
      label: "Run Crew Now",
      icon: Bot,
      color: "bg-[#FF6B00] text-white hover:bg-orange-600",
      onClick: () => triggerAgent("daily_morning_sweep", "Run Crew Now"),
    },
    {
      id: "reengagement_sweep",
      label: "Re-engage",
      icon: RefreshCw,
      color: "bg-white text-[#1A2744] border border-slate-200 hover:bg-slate-50",
      onClick: () => triggerAgent("reengagement_sweep", "Re-engage"),
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileText,
      color: "bg-white text-[#1A2744] border border-slate-200 hover:bg-slate-50",
      onClick: () => router.push("/analytics"),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 agent-card p-4">
      <h3 className="text-sm font-bold text-[#1A2744] mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const isLoading = triggering === action.id;

          return (
            <button
              key={action.id}
              onClick={action.onClick}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${action.color} disabled:opacity-60`}
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span>{isLoading ? "Running..." : action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
