// @ts-nocheck
/**
 * TitanCrew · MetricsRow
 * 4-card KPI strip across the top of the dashboard.
 */

"use client";

import { Briefcase, Bot, TrendingUp, AlertTriangle } from "lucide-react";

interface MetricsRowProps {
  jobsBooked30d: number;
  jobsAIBooked30d: number;
  revenueAI30d: number;
  todayRevenue: number;
  churnRisk: number;
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  bgAccent: string;
  trend?: "up" | "down" | "neutral";
}

function MetricCard({ label, value, sub, icon, accent, bgAccent }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 agent-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-extrabold ${accent} tracking-tight`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 ${bgAccent} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function MetricsRow({
  jobsBooked30d,
  jobsAIBooked30d,
  revenueAI30d,
  todayRevenue,
  churnRisk,
}: MetricsRowProps) {
  const aiPct = jobsBooked30d > 0 ? Math.round((jobsAIBooked30d / jobsBooked30d) * 100) : 0;

  const formatRevenue = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

  const churnLabel = churnRisk < 0.25 ? "Healthy" : churnRisk < 0.6 ? "Monitor" : "At Risk";
  const churnColor = churnRisk < 0.25 ? "text-emerald-600" : churnRisk < 0.6 ? "text-amber-600" : "text-red-600";
  const churnBg = churnRisk < 0.25 ? "bg-emerald-50" : churnRisk < 0.6 ? "bg-amber-50" : "bg-red-50";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <MetricCard
        label="Jobs (30 days)"
        value={String(jobsBooked30d)}
        sub={`${jobsAIBooked30d} booked by AI`}
        icon={<Briefcase className="w-4 h-4 text-[#1A2744]" />}
        accent="text-[#1A2744]"
        bgAccent="bg-slate-100"
      />
      <MetricCard
        label="AI Booking Rate"
        value={`${aiPct}%`}
        sub="of jobs this month"
        icon={<Bot className="w-4 h-4 text-[#FF6B00]" />}
        accent="text-[#FF6B00]"
        bgAccent="bg-orange-50"
      />
      <MetricCard
        label="AI Revenue (30d)"
        value={formatRevenue(revenueAI30d)}
        sub={`${formatRevenue(todayRevenue)} today`}
        icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
        accent="text-emerald-700"
        bgAccent="bg-emerald-50"
      />
      <MetricCard
        label="Account Health"
        value={churnLabel}
        sub={`Risk score: ${(churnRisk * 100).toFixed(0)}%`}
        icon={<AlertTriangle className={`w-4 h-4 ${churnColor}`} />}
        accent={churnColor}
        bgAccent={churnBg}
      />
    </div>
  );
}
