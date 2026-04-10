/**
 * TitanCrew · Finance Page
 * Revenue overview, invoices, payments, and AI-attributed income.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DollarSign, TrendingUp, FileText, Clock, Zap } from "lucide-react";

interface Account {
  id: string;
  business_name: string;
  plan: string;
  revenue_ai_30d: number;
  jobs_booked_30d: number;
  jobs_ai_booked_30d: number;
}

interface Job {
  id: string;
  customer_name: string;
  status: string;
  invoice_amount: number;
  booked_by_ai: boolean;
  created_at: string;
  actual_end: string;
  job_type: string;
}

export default async function FinancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase.from("accounts")
    .select("id, business_name, plan, revenue_ai_30d, jobs_booked_30d, jobs_ai_booked_30d")
    .eq("owner_user_id", user.id)
    .single() as { data: Account | null };
  if (!account) redirect("/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentJobs } = await supabase.from("jobs")
    .select("id, customer_name, status, invoice_amount, booked_by_ai, created_at, actual_end, job_type")
    .eq("account_id", account.id)
    .gte("created_at", sixtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50) as { data: Job[] | null };

  const jobs = recentJobs ?? [];
  const thisMonth  = jobs.filter((j: Job) => j.created_at >= thirtyDaysAgo);
  const lastMonth  = jobs.filter((j: Job) => j.created_at < thirtyDaysAgo);

  const revenue30d   = thisMonth.filter((j: Job) => ["completed","invoiced","paid"].includes(j.status))
                                .reduce((s: number, j: Job) => s + (j.invoice_amount ?? 0), 0);
  const revenuePrev  = lastMonth.filter((j: Job) => ["completed","invoiced","paid"].includes(j.status))
                                .reduce((s: number, j: Job) => s + (j.invoice_amount ?? 0), 0);
  const revenueChange = revenuePrev > 0 ? Math.round(((revenue30d - revenuePrev) / revenuePrev) * 100) : 0;

  const outstanding  = jobs.filter((j: Job) => j.status === "invoiced").reduce((s: number, j: Job) => s + (j.invoice_amount ?? 0), 0);
  const outstandingJobs = jobs.filter((j: Job) => j.status === "invoiced");

  const aiRevenue    = account.revenue_ai_30d ?? 0;
  const planCost     = account.plan === "growth" ? 799 : account.plan === "scale" ? 1299 : 399;
  const roi          = revenue30d > 0 ? Math.round(((revenue30d - planCost) / planCost) * 100) : 0;

  function formatCurrency(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const statusConfig = {
    completed: { label: "Completed", color: "text-emerald-700 bg-emerald-50" },
    invoiced:  { label: "Invoice Sent", color: "text-amber-700 bg-amber-50" },
    paid:      { label: "Paid", color: "text-blue-700 bg-blue-50" },
    scheduled: { label: "Scheduled", color: "text-slate-700 bg-slate-100" },
    in_progress: { label: "In Progress", color: "text-orange-700 bg-orange-50" },
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A2744]">Finance</h1>
        <p className="text-sm text-slate-500 mt-1">Revenue, invoices, and AI-attributed income</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Revenue (30d)",
            value: formatCurrency(revenue30d),
            sub: revenueChange !== 0 ? `${revenueChange > 0 ? "+" : ""}${revenueChange}% vs prior month` : "No prior data",
            subColor: revenueChange >= 0 ? "text-emerald-600" : "text-red-500",
            icon: DollarSign, bg: "bg-emerald-50", color: "text-emerald-600",
          },
          {
            label: "Outstanding",
            value: formatCurrency(outstanding),
            sub: `${outstandingJobs.length} invoice${outstandingJobs.length !== 1 ? "s" : ""} pending`,
            subColor: "text-amber-600",
            icon: FileText, bg: "bg-amber-50", color: "text-amber-600",
          },
          {
            label: "AI Revenue",
            value: formatCurrency(aiRevenue),
            sub: "Jobs booked by AI this month",
            subColor: "text-[#FF6B00]",
            icon: Zap, bg: "bg-orange-50", color: "text-[#FF6B00]",
          },
          {
            label: "ROI on Plan",
            value: revenue30d > 0 ? `${roi > 0 ? "+" : ""}${roi}%` : "—",
            sub: `vs ${formatCurrency(planCost)}/mo plan`,
            subColor: roi >= 0 ? "text-emerald-600" : "text-slate-500",
            icon: TrendingUp, bg: "bg-blue-50", color: "text-blue-600",
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <p className="text-2xl font-extrabold text-[#1A2744]">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{kpi.label}</p>
              <p className={`text-xs font-semibold mt-1 ${kpi.subColor}`}>{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Outstanding invoices */}
      {outstandingJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Outstanding Invoices</h2>
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
            {outstandingJobs.map((job: Job) => (
              <div key={job.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A2744] truncate">{job.customer_name || "Unknown"}</p>
                  <p className="text-xs text-slate-400">{job.job_type} · {formatDate(job.created_at)}</p>
                </div>
                {job.booked_by_ai && (
                  <span className="text-xs bg-orange-50 text-[#FF6B00] font-semibold px-2 py-0.5 rounded-full">AI</span>
                )}
                <span className="text-sm font-bold text-amber-700">
                  {formatCurrency(job.invoice_amount ?? 0)}
                </span>
              </div>
            ))}
            <div className="px-4 py-3 bg-amber-50 flex items-center justify-between">
              <span className="text-xs text-amber-700 font-semibold">Total Outstanding</span>
              <span className="text-sm font-extrabold text-amber-800">{formatCurrency(outstanding)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Transactions</h2>
        {jobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-[#1A2744] mb-2">No revenue yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Finance tracking starts once your first jobs are completed. Finance AI handles invoicing automatically.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Customer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Type</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {jobs.slice(0, 20).map((job: Job) => {
                    const sc = statusConfig[job.status as keyof typeof statusConfig] ?? { label: job.status, color: "text-slate-600 bg-slate-50" };
                    return (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#1A2744]">{job.customer_name || "Unknown"}</span>
                            {job.booked_by_ai && (
                              <span className="text-xs bg-orange-50 text-[#FF6B00] font-semibold px-1.5 py-0.5 rounded-full">AI</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-slate-500">{job.job_type || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sc.color}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${job.invoice_amount ? "text-emerald-700" : "text-slate-300"}`}>
                            {job.invoice_amount ? formatCurrency(job.invoice_amount) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-slate-400">{formatDate(job.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
