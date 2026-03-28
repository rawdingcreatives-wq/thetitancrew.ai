/**
 * TitanCrew · JobKanban
 * Drag-to-update kanban board with 6 status columns.
 * AI-booked jobs get orange border treatment.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, DollarSign, User, MapPin, ChevronRight } from "lucide-react";
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
  job_type: string | null;
  address: string | null;
  trade_customers?: { id: string; name: string; phone: string } | null;
  technicians?: { id: string; name: string } | null;
}

interface JobKanbanProps {
  jobs: Job[];
  accountId: string;
}

const COLUMNS: { key: JobStatus; label: string; color: string; headerBg: string }[] = [
  { key: "lead",        label: "Leads",       color: "border-slate-300",  headerBg: "bg-slate-50" },
  { key: "scheduled",   label: "Scheduled",   color: "border-blue-300",   headerBg: "bg-blue-50" },
  { key: "dispatched",  label: "Dispatched",  color: "border-purple-300", headerBg: "bg-purple-50" },
  { key: "in_progress", label: "In Progress", color: "border-orange-300", headerBg: "bg-orange-50" },
  { key: "completed",   label: "Completed",   color: "border-emerald-300",headerBg: "bg-emerald-50" },
  { key: "invoiced",    label: "Invoiced",    color: "border-indigo-300", headerBg: "bg-indigo-50" },
];

const PRIORITY_COLORS: Record<number, string> = {
  1: "border-l-red-500 border-l-2",
  2: "border-l-orange-400 border-l-2",
  3: "border-l-slate-300 border-l-2",
};

export function JobKanban({ jobs, accountId }: JobKanbanProps) {
  const router = useRouter();
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const jobsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.key] = jobs.filter((j) => j.status === col.key);
    return acc;
  }, {} as Record<JobStatus, Job[]>);

  const handleDrop = async (e: React.DragEvent, newStatus: JobStatus) => {
    e.preventDefault();
    if (!draggedJobId || updating) return;

    const job = jobs.find((j) => j.id === draggedJobId);
    if (!job || job.status === newStatus) { setDraggedJobId(null); return; }

    setUpdating(draggedJobId);
    setDraggedJobId(null);

    try {
      await fetch(`/api/jobs/${draggedJobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="flex gap-4 min-w-max pb-4">
      {COLUMNS.map((col) => {
        const colJobs = jobsByStatus[col.key] ?? [];
        const colRevenue = colJobs.reduce((s, j) => s + (j.invoice_amount ?? j.estimate_amount ?? 0), 0);

        return (
          <div
            key={col.key}
            className="w-72 flex-shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* Column header */}
            <div className={`${col.headerBg} rounded-xl px-3 py-2.5 mb-3 border ${col.color}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1A2744] uppercase tracking-wide">
                  {col.label}
                </span>
                <div className="flex items-center gap-2">
                  {colRevenue > 0 && (
                    <span className="text-xs text-slate-500">
                      ${colRevenue >= 1000 ? `${(colRevenue/1000).toFixed(1)}k` : colRevenue.toFixed(0)}
                    </span>
                  )}
                  <span className="w-5 h-5 bg-white rounded-full text-xs font-bold text-slate-600 flex items-center justify-center">
                    {colJobs.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Job cards */}
            <div className="space-y-2 min-h-16">
              {colJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isDragging={draggedJobId === job.id}
                  isUpdating={updating === job.id}
                  onDragStart={() => setDraggedJobId(job.id)}
                  onDragEnd={() => setDraggedJobId(null)}
                />
              ))}

              {/* Drop zone visual */}
              {draggedJobId && (
                <div className={`h-20 rounded-xl border-2 border-dashed transition-colors
                  ${col.color} opacity-50 flex items-center justify-center`}>
                  <span className="text-xs text-slate-400">Drop here</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Individual Job Card ────────────────────────────────

function JobCard({
  job,
  isDragging,
  isUpdating,
  onDragStart,
  onDragEnd,
}: {
  job: Job;
  isDragging: boolean;
  isUpdating: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const amount = job.invoice_amount ?? job.estimate_amount;
  const priorityClass = PRIORITY_COLORS[job.priority] ?? PRIORITY_COLORS[3];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl border agent-card cursor-grab active:cursor-grabbing transition-all
        ${priorityClass}
        ${isDragging ? "opacity-40 rotate-1 scale-95" : ""}
        ${isUpdating ? "opacity-60 pointer-events-none" : ""}
        ${job.booked_by_ai ? "ring-1 ring-[#FF6B00]/20" : ""}
      `}
    >
      <div className="p-3">
        {/* Title + AI badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-[#1A2744] leading-tight line-clamp-2">
            {job.title}
          </span>
          {job.booked_by_ai && (
            <Bot className="w-3 h-3 text-[#FF6B00] flex-shrink-0 mt-0.5" />
          )}
        </div>

        {/* Meta */}
        <div className="space-y-1">
          {job.trade_customers?.name && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500 truncate">{job.trade_customers.name}</span>
            </div>
          )}

          {job.scheduled_start && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {new Date(job.scheduled_start).toLocaleDateString("en-US", {
                  month: "short", day: "numeric",
                  hour: "numeric", minute: "2-digit", hour12: true
                })}
              </span>
            </div>
          )}

          {job.technicians?.name && (
            <div className="text-xs text-slate-400 pl-4">→ {job.technicians.name}</div>
          )}
        </div>

        {/* Footer: amount */}
        {amount && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
            <div className="flex items-center gap-0.5 text-xs font-bold text-[#1A2744]">
              <DollarSign className="w-3 h-3 text-slate-400" />
              {amount >= 1000 ? `${(amount/1000).toFixed(1)}k` : amount.toFixed(0)}
            </div>
            {job.job_type && (
              <span className="text-xs text-slate-400 capitalize">
                {job.job_type.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
