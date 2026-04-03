// @ts-nocheck
/**
 * TitanCrew · AuditLogFilters
 * Filter bar for the audit log page.
 */
"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, Filter, X } from "lucide-react";

interface AuditLogFiltersProps {
  currentFilters: {
    agentType?: string;
    eventType?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

const AGENT_TYPES = [
  { value: "", label: "All Agents" },
  { value: "foreman_predictor", label: "Foreman AI" },
  { value: "scheduler", label: "Scheduler" },
  { value: "customer_comm", label: "Customer Comm" },
  { value: "finance_invoice", label: "Finance & Invoice" },
  { value: "parts_inventory", label: "Parts & Inventory" },
  { value: "tech_dispatch", label: "Tech Dispatch" },
];

export function AuditLogFilters({ currentFilters }: AuditLogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [agentType, setAgentType] = useState(currentFilters.agentType ?? "");
  const [from, setFrom] = useState(currentFilters.from ?? "");
  const [to, setTo] = useState(currentFilters.to ?? "");

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (agentType) params.set("agentType", agentType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    setAgentType("");
    setFrom("");
    setTo("");
    router.push(pathname);
  };

  const hasFilters = agentType || from || to;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Filter className="w-4 h-4" />
        <span className="font-medium">Filter</span>
      </div>

      {/* Agent type */}
      <select
        value={agentType}
        onChange={(e) => setAgentType(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
      >
        {AGENT_TYPES.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>

      {/* Date from */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400">From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
        />
      </div>

      {/* Date to */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400">To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
        />
      </div>

      <button
        onClick={applyFilters}
        className="text-sm font-semibold text-white bg-[#FF6B00] hover:bg-orange-600 px-4 py-2 rounded-lg transition-colors"
      >
        Apply
      </button>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
