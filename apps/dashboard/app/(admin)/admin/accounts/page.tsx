// @ts-nocheck
/**
 * TitanCrew Admin Accounts Browser
 *
 * Searchable, filterable table of all platform accounts.
 * Shows plan, status, MRR, churn risk, last active, trade type.
 * Actions: view detail, suspend, flag for review.
 */
"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search, Filter, ChevronDown, AlertTriangle, Ban,
  Flag, ExternalLink, Users, ArrowUpDown, X,
} from "lucide-react";

interface Account {
  id: string;
  business_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  trade_type: string;
  state: string | null;
  plan: string;
  subscription_status: string;
  mrr: number;
  tech_count: number;
  churn_risk_score: number;
  last_active_at: string | null;
  created_at: string;
  suspended_at: string | null;
  flagged_for_review: boolean;
  jobs_booked_30d: number;
  revenue_ai_30d: number;
}

type SortKey = "business_name" | "created_at" | "mrr" | "churn_risk_score" | "last_active_at";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/20 text-emerald-400",
  trialing: "bg-amber-500/20 text-amber-400",
  past_due: "bg-red-500/20 text-red-400",
  canceled: "bg-slate-500/20 text-slate-400",
  paused:   "bg-purple-500/20 text-purple-400",
};

const PLAN_COLORS: Record<string, string> = {
  basic:      "bg-slate-500/20 text-slate-300",
  pro:        "bg-blue-500/20 text-blue-400",
  enterprise: "bg-[#FF6B00]/20 text-[#FF6B00]",
};

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await (supabase.from("accounts") as any)
        .select("id, business_name, owner_name, email, phone, trade_type, state, plan, subscription_status, mrr, tech_count, churn_risk_score, last_active_at, created_at, suspended_at, flagged_for_review, jobs_booked_30d, revenue_ai_30d")
        .order("created_at", { ascending: false });
      setAccounts(data ?? []);
      setLoading(false);
    })();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = useMemo(() => {
    let list = [...accounts];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.business_name.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone && a.phone.includes(q))
      );
    }
    if (filterPlan !== "all") list = list.filter((a) => a.plan === filterPlan);
    if (filterStatus !== "all") list = list.filter((a) => a.subscription_status === filterStatus);

    list.sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === "created_at" || sortKey === "last_active_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [accounts, search, filterPlan, filterStatus, sortKey, sortAsc]);

  const selectedAccount = selectedId ? accounts.find((a) => a.id === selectedId) : null;

  const handleSuspend = async (accountId: string) => {
    const supabase = createClient();
    const now = new Date().toISOString();
    await (supabase.from("accounts") as any)
      .update({ suspended_at: now, suspend_reason: "Admin suspended" })
      .eq("id", accountId);
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, suspended_at: now } : a));
  };

  const handleUnsuspend = async (accountId: string) => {
    const supabase = createClient();
    await (supabase.from("accounts") as any)
      .update({ suspended_at: null, suspend_reason: null })
      .eq("id", accountId);
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, suspended_at: null } : a));
  };

  const handleFlag = async (accountId: string, flagged: boolean) => {
    const supabase = createClient();
    await (supabase.from("accounts") as any)
      .update({ flagged_for_review: flagged })
      .eq("id", accountId);
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, flagged_for_review: flagged } : a));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading accounts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-slate-400">{accounts.length} total accounts on the platform</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50 focus:border-[#FF6B00]"
          />
        </div>
        <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50">
          <option value="all">All Plans</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort("business_name")}>
                <span className="flex items-center gap-1">Business <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort("mrr")}>
                <span className="flex items-center gap-1">MRR <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Trade</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort("churn_risk_score")}>
                <span className="flex items-center gap-1">Churn Risk <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort("created_at")}>
                <span className="flex items-center gap-1">Joined <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No accounts match your filters.</td>
              </tr>
            ) : (
              filtered.map((acc) => (
                <tr key={acc.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {acc.flagged_for_review && <Flag className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      {acc.suspended_at && <Ban className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{acc.business_name}</p>
                        <p className="text-xs text-slate-500 truncate">{acc.owner_name} {acc.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[acc.plan] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {acc.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[acc.subscription_status] ?? "bg-slate-500/20 text-slate-300"}`}>
                      {acc.subscription_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">
                    ${(parseFloat(String(acc.mrr)) || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{acc.trade_type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <ChurnBadge score={acc.churn_risk_score} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(acc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedId(acc.id === selectedId ? null : acc.id)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="View details">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleFlag(acc.id, !acc.flagged_for_review)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${acc.flagged_for_review ? "text-amber-400" : "text-slate-400 hover:text-amber-400"}`} title={acc.flagged_for_review ? "Unflag" : "Flag for review"}>
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                      {acc.suspended_at ? (
                        <button onClick={() => handleUnsuspend(acc.id)} className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-emerald-400 transition-colors" title="Unsuspend">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => handleSuspend(acc.id)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors" title="Suspend">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedAccount && (
        <AccountDetailPanel account={selectedAccount} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function ChurnBadge({ score }: { score: number }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 70 ? "text-red-400" : pct >= 40 ? "text-amber-400" : "text-emerald-400";
  const bg = pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${color}`}>{pct}%</span>
    </div>
  );
}

function AccountDetailPanel({ account, onClose }: { account: Account; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#1A2744] border-l border-white/10 z-50 shadow-2xl overflow-y-auto">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">{account.business_name}</h2>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <DetailRow label="Owner" value={account.owner_name} />
        <DetailRow label="Email" value={account.email} />
        <DetailRow label="Phone" value={account.phone ?? "—"} />
        <DetailRow label="Trade" value={account.trade_type?.replace(/_/g, " ")} />
        <DetailRow label="State" value={account.state ?? "—"} />
        <DetailRow label="Plan" value={account.plan} />
        <DetailRow label="Status" value={account.subscription_status} />
        <DetailRow label="MRR" value={`$${parseFloat(String(account.mrr || 0)).toLocaleString()}`} />
        <DetailRow label="Technicians" value={String(account.tech_count ?? 0)} />
        <DetailRow label="Jobs (30d)" value={String(account.jobs_booked_30d ?? 0)} />
        <DetailRow label="AI Revenue (30d)" value={`$${parseFloat(String(account.revenue_ai_30d || 0)).toLocaleString()}`} />
        <DetailRow label="Churn Risk" value={`${Math.round((account.churn_risk_score ?? 0) * 100)}%`} />
        <DetailRow label="Joined" value={new Date(account.created_at).toLocaleDateString()} />
        <DetailRow label="Last Active" value={account.last_active_at ? new Date(account.last_active_at).toLocaleDateString() : "Never"} />
        {account.suspended_at && (
          <DetailRow label="Suspended" value={new Date(account.suspended_at).toLocaleDateString()} />
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-white font-medium capitalize">{value}</span>
    </div>
  );
}
