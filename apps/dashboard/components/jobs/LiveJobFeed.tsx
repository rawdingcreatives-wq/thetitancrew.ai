// @ts-nocheck
/**
 * TitanCrew · LiveJobFeed
 * Real-time job pipeline with status indicators.
 * Shows jobs grouped by status with AI attribution badges.
 */

"use client";

import { useState } from "react";
import { Bot, Clock, MapPin, DollarSign, User, Circle, ChevronRight } from "lucide-react";
import type { JobStatus } from "@/lib/supabase/types";

interface Job {
  id: string;
  title: string;
  status: JobStatus;
  priority: number;
  scheduled_start: string | null;
  estimate_amount: number | null;
  invoice_amount: number | null;
  booked_by_ai: boolean;
  source: string | null;
  trade_customers?: { name: string; phone: string } | null;
  technicians?: { name: string } | null;
}

interface LiveJobFeedProps {
  jobs: Job[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; order: number }> = {
  lead:        { label: "Lead",        color: "text-slate-600 bg-slate-100",    dot: "bg-slate-400",   order: 1 },
  scheduled:   { label: "Scheduled",   color: "text-blue-700 bg-blue-100",      dot: "bg-blue-500",    order: 2 },
  dispatched:  { label: "Dispatched",  color: "text-purple-700 bg-purple-100",  dot: "bg-purple-500",  order: 3 },
  in_progress: { label: "In Progress", color: "text-[#FF6B00] bg-orange-100",   dot: "bg-[#FF6B00]",   order: 4 },
  completed:   { label: "Completed",   color: "text-emerald-700 bg-emerald-100",dot: "bg-emerald-500", order: 5 },
  invoiced:    { label: "Invoiced",    color: "text-indigo-700 bg-indigo-100",  dot: "bg-indigo-500",  order: 6 },
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "lead", label: "Leads" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "Active" },
  { key: "invoiced", label: "Invoiced" },
];

export function LiveJobFeed({ jobs }: LiveJobFeedProps) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? jobs
    : jobs.filter((j) => j.status === filter);

  const counts = FILTER_TABS.reduce((acc, tab) => {
    acc[tab.key] = tab.key === "all" ? jobs.length : jobs.filter((j) => j.status === tab.key).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 agent-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-base font-bold text-[#1A2744]">Live Job Pipeline</h3>
        <span className="text-xs text-slate-400">{jobs.length} active</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
              ${filter === tab.key
                ? "bg-[#1A2744] text-white"
                : "text-slate-500 hover:bg-slate-100"
              }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                filter === tab.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div className="divide-y divide-slate-50">
        {filtered.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">No jobs in this view.</p>
          </div>
        )}

        {filtered.map((job) => {
          const statusConfig = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.lead;
          const amount = job.invoice_amount ?? job.estimate_amount;
          const scheduledDate = job.scheduled_start
            ? new Date(job.scheduled_start).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit", hour12: true,
              })
            : null;

          return (
            <div
              key={job.id}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              {/* Status dot */}
              <div className="flex-shrink-0 relative">
                <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot}`} />
                {(job.status === "in_progress" || job.status === "dispatched") && (
                  <div className={`absolute inset-0 rounded-full ${statusConfig.dot} opacity-40 agent-pulse`} />
                )}
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#1A2744] truncate">
                    {job.title}
                  </span>
                  {job.booked_by_ai && (
                    <span className="flex items-center gap-0.5 text-xs font-medium text-[#FF6B00] bg-orange-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      <Bot className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                  {job.priority === 1 && (
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                      Urgent
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {job.trade_customers?.name && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <User className="w-3 h-3" />
                      {job.trade_customers.name}
                    </span>
                  )}
                  {job.technicians?.name && (
                    <span className="text-xs text-slate-400">
                      → {job.technicians.name}
                    </span>
                  )}
                  {scheduledDate && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {scheduledDate}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: amount + status */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {amount && (
                  <div className="hidden sm:flex items-center gap-0.5 text-sm font-semibold text-[#1A2744]">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    {amount >= 1000
                      ? `${(amount / 1000).toFixed(1)}k`
                      : amount.toFixed(0)}
                  </div>
                )}
                <span className={`hidden sm:inline-flex text-xs font-medium px-2 py-1 rounded-full ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-50">
        <a href="/jobs" className="text-xs text-[#FF6B00] font-medium hover:underline">
          View full pipeline →
        </a>
      </div>
    </div>
  );
}
