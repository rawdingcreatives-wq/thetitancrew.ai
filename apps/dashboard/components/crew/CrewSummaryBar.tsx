// @ts-nocheck
/**
 * TitanCrew · CrewSummaryBar
 * Top-of-crew-page strip: global run trigger + health summary.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Zap, AlertTriangle, Activity, DollarSign } from "lucide-react";

interface CrewSummaryBarProps {
  runningCount: number;
  errorCount: number;
  totalActions24h: number;
  totalCost30d: number;
  accountId: string;
}

export function CrewSummaryBar({
  runningCount, errorCount, totalActions24h, totalCost30d, accountId
}: CrewSummaryBarProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  const handleFullRun = async () => {
    setRunning(true);
    try {
      await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, event: "daily_morning_sweep", payload: {} }),
      });
      router.refresh();
    } finally {
      setTimeout(() => setRunning(false), 3000);
    }
  };

  return (
    <div className="bg-[#1A2744] rounded-2xl p-4 text-white">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left: stats */}
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#FF6B00]" />
            <div>
              <p className="text-xs text-slate-400">Active now</p>
              <p className="text-sm font-bold">{runningCount} agents</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400">Actions today</p>
              <p className="text-sm font-bold">{totalActions24h}</p>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <div>
                <p className="text-xs text-slate-400">Errors</p>
                <p className="text-sm font-bold text-red-400">{errorCount}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400">API cost (30d)</p>
              <p className="text-sm font-bold">${totalCost30d.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Right: run crew button */}
        <button
          onClick={handleFullRun}
          disabled={running || runningCount > 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B00] hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          {running ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {running ? "Running full crew..." : runningCount > 0 ? "Crew active" : "Run Full Crew"}
        </button>
      </div>
    </div>
  );
}
