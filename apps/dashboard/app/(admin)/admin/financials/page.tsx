// @ts-nocheck
/**
 * TitanCrew · Admin Financials Dashboard
 *
 * MRR/ARR breakdown, revenue by plan, billing events,
 * churn rate tracking, and LTV estimates.
 */
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DollarSign, TrendingUp, TrendingDown, Users,
  CreditCard, AlertTriangle, ArrowUpRight, PieChart,
} from "lucide-react";

interface PlanBreakdown {
  plan: string;
  count: number;
  mrr: number;
}

interface BillingEvent {
  id: string;
  created_at: string;
  event_type: string;
  amount: number;
  account_id: string;
}

const PLAN_PRICES: Record<string, number> = {
  basic: 399,
  pro: 799,
  enterprise: 1299,
};

const PLAN_COLORS: Record<string, string> = {
  basic: "bg-slate-500",
  pro: "bg-blue-500",
  enterprise: "bg-[#FF6B00]",
};

export default function AdminFinancialsPage() {
  const [plans, setPlans] = useState<PlanBreakdown[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [totalMRR, setTotalMRR] = useState(0);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [pastDueCount, setPastDueCount] = useState(0);
  const [canceledCount, setCanceledCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      const [accountsRes, pastDueRes, canceledRes, eventsRes] = await Promise.all([
        (supabase.from("accounts") as any).select("plan, mrr, subscription_status"),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "past_due"),
        (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
        (supabase.from("billing_events") as any).select("id, created_at, event_type, amount, account_id").order("created_at", { ascending: false }).limit(20),
      ]);

      const accts = accountsRes.data ?? [];
      setTotalAccounts(accts.length);
      setPastDueCount(pastDueRes.count ?? 0);
      setCanceledCount(canceledRes.count ?? 0);
      setBillingEvents(eventsRes.data ?? []);

      // Aggregate by plan
      const planMap: Record<string, { count: number; mrr: number }> = {};
      let mrr = 0;
      for (const a of accts) {
        const p = a.plan ?? "basic";
        if (!planMap[p]) planMap[p] = { count: 0, mrr: 0 };
        planMap[p].count++;
        const accountMrr = parseFloat(a.mrr) || 0;
        planMap[p].mrr += accountMrr;
        mrr += accountMrr;
      }
      setTotalMRR(mrr);
      setPlans(
        Object.entries(planMap).map(([plan, data]) => ({ plan, ...data }))
          .sort((a, b) => b.mrr - a.mrr)
      );

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading financials…</span>
        </div>
      </div>
    );
  }

  const arr = totalMRR * 12;
  const avgRevPerAccount = totalAccounts > 0 ? totalMRR / totalAccounts : 0;
  const churnRate = totalAccounts > 0 ? ((canceledCount / totalAccounts) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Financials</h1>
        <p className="text-sm text-slate-400 mt-1">Revenue metrics, billing health, and plan distribution</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FinKPI icon={DollarSign} label="MRR" value={`$${totalMRR.toLocaleString()}`} color="from-[#FF6B00] to-orange-700" />
        <FinKPI icon={TrendingUp} label="ARR" value={`$${arr.toLocaleString()}`} color="from-purple-500 to-purple-700" />
        <FinKPI icon={Users} label="Avg Rev / Account" value={`$${avgRevPerAccount.toFixed(0)}`} color="from-blue-500 to-blue-700" />
        <FinKPI icon={TrendingDown} label="Churn Rate" value={`${churnRate.toFixed(1)}%`} color={churnRate > 5 ? "from-red-500 to-red-700" : "from-emerald-500 to-emerald-700"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plan Breakdown */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#FF6B00]" />
              Revenue by Plan
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {plans.map((p) => {
              const pct = totalMRR > 0 ? (p.mrr / totalMRR) * 100 : 0;
              return (
                <div key={p.plan}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-sm ${PLAN_COLORS[p.plan] ?? "bg-slate-500"}`} />
                      <span className="text-sm text-white capitalize font-medium">{p.plan}</span>
                      <span className="text-xs text-slate-500">{p.count} accounts</span>
                    </div>
                    <span className="text-sm text-white font-medium">${p.mrr.toLocaleString()}/mo</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PLAN_COLORS[p.plan] ?? "bg-slate-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {plans.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No revenue data yet.</p>
            )}
          </div>
        </div>

        {/* Billing Health */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#FF6B00]" />
              Billing Health
            </h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-2xl font-bold text-amber-400">{pastDueCount}</p>
                <p className="text-xs text-slate-400">Past Due</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-2xl font-bold text-red-400">{canceledCount}</p>
                <p className="text-xs text-slate-400">Canceled</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Recent Billing Events</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {billingEvents.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">No billing events recorded.</p>
                ) : (
                  billingEvents.slice(0, 10).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between py-1.5 border-b border-white/5">
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{ev.event_type.replace(/\./g, " ")}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(ev.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {ev.amount != null && (
                        <span className="text-xs font-medium text-white ml-2">
                          ${(ev.amount / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinKPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
