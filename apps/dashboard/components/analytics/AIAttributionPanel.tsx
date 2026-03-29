// @ts-nocheck
/**
 * TitanCrew · AIAttributionPanel
 * Hero analytics block showing the core value proof:
 * how much extra revenue AI generated vs. what the plan costs.
 */

"use client";

import { Bot, TrendingUp, DollarSign, Zap } from "lucide-react";

interface AIAttributionPanelProps {
  revenueAI30d: number;
  jobsAI30d: number;
  jobsTotal30d: number;
  plan: string;
}

export function AIAttributionPanel({
  revenueAI30d, jobsAI30d, jobsTotal30d, plan
}: AIAttributionPanelProps) {
  const planCost = plan === "pro" ? 799 : 399;
  const roi = planCost > 0 ? (revenueAI30d / planCost) : 0;
  const aiPct = jobsTotal30d > 0 ? (jobsAI30d / jobsTotal30d) * 100 : 0;

  const stats = [
    {
      label: "AI-Attributed Revenue",
      value: revenueAI30d >= 1000
        ? `$${(revenueAI30d / 1000).toFixed(1)}k`
        : `$${revenueAI30d.toFixed(0)}`,
      sub: "last 30 days",
      icon: DollarSign,
      accent: "text-[#FF6B00]",
      bg: "bg-orange-50",
    },
    {
      label: "Jobs Booked by AI",
      value: String(jobsAI30d),
      sub: `${aiPct.toFixed(0)}% of all jobs`,
      icon: Bot,
      accent: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Return on Investment",
      value: roi > 0 ? `${roi.toFixed(0)}×` : "—",
      sub: `vs. $${planCost}/mo plan cost`,
      icon: TrendingUp,
      accent: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Extra Jobs vs. Manual",
      value: `+${Math.round(jobsAI30d * 0.35)}`,
      sub: "estimated incremental",
      icon: Zap,
      accent: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="bg-[#1A2744] rounded-2xl p-5 text-white">
      <div className="flex items-center gap-2 mb-5">
        <Bot className="w-5 h-5 text-[#FF6B00]" />
        <h3 className="text-base font-bold">AI Attribution — Last 30 Days</h3>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white/5 rounded-xl p-4">
              <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${stat.accent}`} />
              </div>
              <p className="text-2xl font-extrabold text-white">{stat.value}</p>
              <p className="text-xs font-medium text-slate-300 mt-0.5">{stat.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {revenueAI30d > planCost && (
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          <p className="text-sm text-slate-300">
            TitanCrew generated{" "}
            <span className="text-white font-semibold">
              ${(revenueAI30d - planCost).toLocaleString()} net profit
            </span>{" "}
            above plan cost this month.
          </p>
        </div>
      )}
    </div>
  );
}
