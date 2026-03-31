// @ts-nocheck
/**
 * TitanCrew · Customers Page
 * Customer list with job history, contact info, and AI engagement status.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Users, Phone, Mail, MapPin, Star, TrendingUp, Clock } from "lucide-react";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) redirect("/login");

  // Pull customers from jobs (unique customer_name + phone combos)
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, customer_name, customer_phone, customer_email, address, status, invoice_amount, booked_by_ai, created_at, job_type")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  // Aggregate into customer records
  const customerMap = new Map();
  for (const job of jobs ?? []) {
    const key = job.customer_phone || job.customer_email || job.customer_name;
    if (!key) continue;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        name: job.customer_name,
        phone: job.customer_phone,
        email: job.customer_email,
        address: job.address,
        jobs: [],
        totalSpend: 0,
        aiBooked: 0,
        lastJob: job.created_at,
      });
    }
    const c = customerMap.get(key);
    c.jobs.push(job);
    c.totalSpend += job.invoice_amount ?? 0;
    if (job.booked_by_ai) c.aiBooked++;
    if (job.created_at > c.lastJob) c.lastJob = job.created_at;
  }

  const customers = Array.from(customerMap.values()).sort(
    (a, b) => new Date(b.lastJob).getTime() - new Date(a.lastJob).getTime()
  );

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpend, 0);
  const repeatCustomers = customers.filter(c => c.jobs.length > 1).length;
  const aiBookedCustomers = customers.filter(c => c.aiBooked > 0).length;

  function timeAgo(iso: string) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A2744]">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Every customer your crew has served</p>
        </div>
        <a
          href="/jobs"
          className="flex items-center gap-2 bg-[#FF6B00] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
        >
          + Add Job (adds customer)
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Customers", value: customers.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Repeat Customers", value: repeatCustomers, icon: Star, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "AI Engaged", value: aiBookedCustomers, icon: TrendingUp, color: "text-[#FF6B00]", bg: "bg-orange-50" },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-extrabold text-[#1A2744]">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Customer list */}
      {customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-[#1A2744] mb-2">No customers yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Customers will appear here as jobs are created. Your AI crew books and manages them automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Contact</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Jobs</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Spend</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Last Job</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#1A2744] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">
                            {(c.name || "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1A2744]">{c.name || "Unknown"}</p>
                          {c.address && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {c.address.split(",")[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="space-y-1">
                        {c.phone && (
                          <p className="text-xs text-slate-600 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />{c.phone}
                          </p>
                        )}
                        {c.email && (
                          <p className="text-xs text-slate-600 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />{c.email}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#1A2744]">
                        {c.jobs.length}
                        {c.jobs.length > 1 && (
                          <span className="text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">repeat</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-emerald-700">
                        ${c.totalSpend.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(c.lastJob)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.aiBooked > 0 ? (
                        <span className="text-xs bg-orange-50 text-[#FF6B00] font-semibold px-2 py-0.5 rounded-full">
                          AI ×{c.aiBooked}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
