/**
 * TitanCrew · AIRevenueWidget
 * The "hero" metric: how much extra revenue AI has generated this month.
 * This is TitanCrew's core value proof — make it prominent and satisfying.
 */

"use client";

import { TrendingUp, Bot, DollarSign } from "lucide-react";
import { useMemo } from "react";

interface AIRevenueWidgetProps {
  revenueAI30d: number;
  jobsAI30d: number;
  jobsTotal30d: number;
}

export function AIRevenueWidget({
  revenueAI30d,
  jobsAI30d,
  jobsTotal30d,
}: AIRevenueWidgetProps) {
  const aiPct = jobsTotal30d > 0 ? Math.round((jobsAI30d / jobsTotal30d) * 100) : 0;

  const formatted = useMemo(() => {
    if (revenueAI30d >= 10000) {
      return `$${(revenueAI30d / 1000).toFixed(1)}k`;
    }
    return `$${revenueAI30d.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  }, [revenueAI30d]);

  return (
    <div className="bg-[#1A2744] rounded-2xl p-5 text-white orange-glow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#FF6B00]/20 rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-[#FF6B00]" />
          </div>
          <span className="text-sm font-medium text-slate-300">AI Revenue</span>
        </div>
        <span className="text-xs text-slate-400 bg-white/10 px-2 py-1 rounded-full">30 days</span>
      </div>

      {/* Big number */}
      <div className="mb-4">
        <div className="text-4xl font-extrabold text-white tracking-tight">
          {revenueAI30d > 0 ? formatted : "$0"}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <TrendingUp className="w-3.5 h-3.5 text-[#10B981]" />
          <span className="text-sm text-[#10B981] font-medium">
            {jobsAI30d} jobs booked by AI
          </span>
        </div>
      </div>

      {/* Progress bar: AI vs manual */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">AI booked</span>
          <span className="text-xs font-semibold text-[#FF6B00]">{aiPct}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FF6B00] rounded-full transition-all duration-700"
            style={{ width: `${aiPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-slate-500">{jobsAI30d} AI</span>
          <span className="text-xs text-slate-500">{jobsTotal30d} total</span>
        </div>
      </div>

      {/* ROI callout */}
      {revenueAI30d > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="text-xs text-slate-300">
              {formatted} extra vs. manual-only —{" "}
              <span className="text-[#10B981] font-semibold">
                {((revenueAI30d / 799) * 100).toFixed(0)}× ROI
              </span>{" "}
              on your plan
            </span>
          </div>
        </div>
      )}

      {revenueAI30d === 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-slate-400">
            AI revenue tracking starts after your first AI-booked job. Crew is running — jobs incoming.
          </p>
        </div>
      )}
    </div>
  );
}
