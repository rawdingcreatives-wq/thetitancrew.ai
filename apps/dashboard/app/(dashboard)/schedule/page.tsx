/**
 * TitanCrew · Schedule Page
 * Upcoming and recent jobs in a calendar-style timeline view.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Calendar, MapPin, User, CheckCircle2, Zap } from "lucide-react";

interface Account {
  id: string;
  business_name: string;
  google_calendar_token: string | null;
}

interface Customer {
  name: string;
}

interface Technician {
  name: string;
}

interface UpcomingJob {
  id: string;
  address: string;
  job_type: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string | null;
  booked_by_ai: boolean;
  customer_id: string;
  technician_id: string;
  trade_customers: Customer;
  technicians: Technician;
}

interface RecentJob {
  id: string;
  address: string;
  job_type: string;
  status: string;
  scheduled_start: string;
  actual_end: string;
  booked_by_ai: boolean;
  customer_id: string;
  trade_customers: Customer;
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase.from("accounts")
    .select("id, business_name, google_calendar_token")
    .eq("owner_user_id", user.id)
    .single() as { data: Account | null };
  if (!account) redirect("/login");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: upcomingJobs } = await supabase.from("jobs")
    .select("id, address, job_type, status, scheduled_start, scheduled_end, booked_by_ai, customer_id, technician_id, trade_customers(name), technicians(name)")
    .eq("account_id", account.id)
    .in("status", ["scheduled", "dispatched", "in_progress"])
    .order("scheduled_start", { ascending: true })
    .limit(50) as { data: UpcomingJob[] | null };

  const { data: recentJobs } = await supabase.from("jobs")
    .select("id, address, job_type, status, scheduled_start, actual_end, booked_by_ai, customer_id, trade_customers(name)")
    .eq("account_id", account.id)
    .in("status", ["completed", "invoiced"])
    .gte("actual_end", sevenDaysAgo)
    .order("actual_end", { ascending: false })
    .limit(10) as { data: RecentJob[] | null };

  function formatDate(iso: string | null) {
    if (!iso) return "Unscheduled";
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatTime(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  const statusConfig = {
    scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    dispatched: { label: "Dispatched", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    in_progress: { label: "In Progress", color: "bg-[#FF6B00]/10 text-[#FF6B00]", dot: "bg-[#FF6B00]" },
    completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    invoiced: { label: "Invoiced", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  };

  // Group upcoming by date label
  const grouped: Record<string, UpcomingJob[]> = {};
  for (const job of upcomingJobs ?? []) {
    const key = formatDate(job.scheduled_start);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(job);
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A2744]">Schedule</h1>
          <p className="text-sm text-slate-500 mt-1">Upcoming jobs and crew calendar</p>
        </div>
        {account.google_calendar_token ? (
          <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Google Calendar synced
          </span>
        ) : (
          <a
            href="/onboarding"
            className="flex items-center gap-1.5 text-xs bg-orange-50 text-[#FF6B00] font-semibold px-3 py-1.5 rounded-full border border-orange-200 hover:bg-orange-100 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" /> Connect Calendar
          </a>
        )}
      </div>

      {/* Upcoming jobs */}
      <div className="space-y-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Upcoming</h2>

        {Object.keys(grouped).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-[#1A2744] mb-2">No jobs scheduled</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Your Scheduler AI will fill this calendar automatically. Connect your Google Calendar to get started.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, dayJobs]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-sm font-bold ${dateLabel === "Today" ? "text-[#FF6B00]" : "text-[#1A2744]"}`}>
                  {dateLabel}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400">{dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {dayJobs.map((job: UpcomingJob) => {
                  const sc = statusConfig[job.status as keyof typeof statusConfig] ?? statusConfig.scheduled;
                  return (
                    <div key={job.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex items-start gap-4">
                      <div className="flex flex-col items-center gap-1 pt-0.5 min-w-[56px]">
                        <span className="text-xs font-bold text-[#1A2744]">{formatTime(job.scheduled_start)}</span>
                        {job.scheduled_end && (
                          <span className="text-xs text-slate-400">{formatTime(job.scheduled_end)}</span>
                        )}
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${sc.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1A2744]">{job.trade_customers?.name || "Unknown"}</span>
                          {job.job_type && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{job.job_type}</span>
                          )}
                          {job.booked_by_ai && (
                            <span className="text-xs bg-orange-50 text-[#FF6B00] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <Zap className="w-3 h-3" /> AI
                            </span>
                          )}
                        </div>
                        {job.address && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {job.address}
                          </p>
                        )}
                        {job.technicians?.name && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3 flex-shrink-0" />
                            {job.technicians.name}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent completions */}
      {(recentJobs ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Completed This Week</h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-50">
            {(recentJobs ?? []).map((job: RecentJob) => (
              <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-sm font-medium text-[#1A2744] flex-1">{job.trade_customers?.name || "Unknown"}</span>
                {job.job_type && <span className="text-xs text-slate-400 hidden sm:block">{job.job_type}</span>}
                {job.booked_by_ai && (
                  <span className="text-xs bg-orange-50 text-[#FF6B00] font-semibold px-2 py-0.5 rounded-full">AI</span>
                )}
                <span className="text-xs text-slate-400">{formatDate(job.actual_end)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
