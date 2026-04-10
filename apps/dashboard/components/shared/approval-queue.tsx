"use client";

/**
 * TitanCrew · Approval Queue Component
 *
 * Displays pending human-in-the-loop (HIL) approval requests from AI agents.
 * Uses hil_confirmations table from the Phase 0 schema.
 *
 * Features:
 *   - Real-time updates via Supabase channel subscription
 *   - Approve / Reject with optional notes
 *   - Risk level indicators and agent type badges
 *   - Expandable detail panel per item
 */

import { useEffect, useState, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Bot,
  ChevronDown, ChevronUp, Loader2, DollarSign, ShieldAlert,
} from "lucide-react";

// ─── Types (matches hil_confirmations table) ─────────────────

interface ApprovalItem {
  id: string;
  account_id: string;
  agent_run_id: string | null;
  action_type: string;
  risk_level: "low" | "medium" | "high" | "critical";
  description: string;
  amount: number | null;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "timed_out";
  created_at: string;
  expires_at: string;
  sent_via: string;
  responded_at: string | null;
  rejection_reason: string | null;
}

interface ApprovalQueueProps {
  accountId: string;
  supabase: SupabaseClient;
  limit?: number;
  compact?: boolean;
}

// ─── Agent & risk config ─────────────────────────────────────

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  purchase_order:  { label: "Parts Order",    color: "bg-amber-500/20 text-amber-400" },
  invoice:         { label: "Invoice",        color: "bg-green-500/20 text-green-400" },
  schedule_change: { label: "Schedule",       color: "bg-blue-500/20 text-blue-400" },
  customer_comm:   { label: "Comms",          color: "bg-purple-500/20 text-purple-400" },
  default:         { label: "Agent Action",   color: "bg-slate-500/20 text-slate-400" },
};

const RISK_COLORS: Record<string, string> = {
  low:      "text-green-400",
  medium:   "text-amber-400",
  high:     "text-orange-400",
  critical: "text-red-400",
};

function getActionConfig(type: string) {
  return AGENT_LABELS[type] ?? AGENT_LABELS.default;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ───────────────────────────────────────────────

export default function ApprovalQueue({
  accountId,
  supabase,
  limit = 10,
  compact = false,
}: ApprovalQueueProps) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch pending items ────────────────────────────────────
  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("hil_confirmations")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      setItems(data as ApprovalItem[]);
    }
    setLoading(false);
  }, [supabase, accountId, limit]);

  // ── Real-time subscription ─────────────────────────────────
  useEffect(() => {
    fetchItems();

    const channel = supabase
      .channel(`hil:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hil_confirmations",
          filter: `account_id=eq.${accountId}`,
        },
        () => fetchItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, accountId, fetchItems]);

  // ── Approve / Reject ───────────────────────────────────────
  async function handleDecision(itemId: string, decision: "approved" | "rejected", notes?: string) {
    setActionLoading(itemId);
    try {
      await fetch("/api/hil/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, decision, notes }),
      });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.error("[ApprovalQueue] Decision failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading approvals...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
        No pending approvals
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#FF6B00]" />
            Pending Approvals
            <span className="bg-[#FF6B00] text-white text-xs rounded-full px-2 py-0.5 font-bold">
              {items.length}
            </span>
          </h3>
        </div>
      )}

      {items.map((item) => {
        const action = getActionConfig(item.action_type);
        const isExpanded = expandedId === item.id;
        const isActioning = actionLoading === item.id;

        return (
          <div
            key={item.id}
            className="rounded-lg border border-white/10 bg-white/5 overflow-hidden transition-all"
          >
            {/* Header */}
            <div
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-white/[0.03]"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <Bot className="w-5 h-5 text-[#FF6B00] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${action.color}`}>
                    {action.label}
                  </span>
                  <ShieldAlert className={`w-3 h-3 ${RISK_COLORS[item.risk_level]}`} />
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-snug truncate">
                  {item.description}
                </p>
                {item.amount && (
                  <p className="text-xs text-[#FF6B00] mt-0.5 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    ${item.amount.toFixed(2)}
                  </p>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
              )}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-3 border-t border-white/5">
                <pre className="mt-3 text-xs text-slate-400 bg-black/20 rounded p-2 overflow-x-auto max-h-40">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecision(item.id, "approved");
                    }}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {isActioning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecision(item.id, "rejected");
                    }}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
