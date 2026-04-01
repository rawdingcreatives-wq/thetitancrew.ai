// @ts-nocheck
"use client";

/**
 * TitanCrew · Approval Queue Component
 *
 * Displays pending human-in-the-loop (HIL) approval requests from AI agents.
 * Used in the dashboard sidebar and the /crew page.
 *
 * Features:
 *   - Real-time updates via Supabase channel subscription
 *   - Approve / Reject with optional notes
 *   - Urgency indicators and agent type badges
 *   - Expandable detail panel per item
 */

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Bot,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";

interface ApprovalItem {
  id: string;
  run_id: string;
  agent_type: string;
  account_id: string;
  action_summary: string;
  action_payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface ApprovalQueueProps {
  accountId: string;
  supabase: any;
  limit?: number;
  compact?: boolean;
}

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  scheduler:   { label: "Scheduler",  color: "bg-blue-500/20 text-blue-400" },
  invoicer:    { label: "Invoicer",   color: "bg-green-500/20 text-green-400" },
  comms:       { label: "Comms",      color: "bg-purple-500/20 text-purple-400" },
  parts:       { label: "Parts",      color: "bg-amber-500/20 text-amber-400" },
  billing_churn_preventer: { label: "Billing", color: "bg-red-500/20 text-red-400" },
  onboarder:   { label: "Onboarder",  color: "bg-cyan-500/20 text-cyan-400" },
  default:     { label: "Agent",      color: "bg-slate-500/20 text-slate-400" },
};

function getAgentConfig(type: string) {
  return AGENT_LABELS[type] ?? AGENT_LABELS.default;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

export default function ApprovalQueue({
  accountId, supabase, limit = 10, compact = false,
}: ApprovalQueueProps) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("hil_queue")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && data) setItems(data as ApprovalItem[]);
    setLoading(false);
  }, [supabase, accountId, limit]);

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel("hil_queue:" + accountId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "hil_queue",
        filter: "account_id=eq." + accountId,
      }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, accountId, fetchItems]);

  async function handleDecision(itemId: string, decision: "approved" | "rejected") {
    setActionLoading(itemId);
    try {
      await fetch("/api/hil/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, decision }),
      });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.error("[ApprovalQueue] Decision failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

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
        const agent = getAgentConfig(item.agent_type);
        const isExpanded = expandedId === item.id;
        const isActioning = actionLoading === item.id;

        return (
          <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 overflow-hidden transition-all">
            <div
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-white/[0.03]"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <Bot className="w-5 h-5 text-[#FF6B00] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + agent.color}>
                    {agent.label}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-snug truncate">{item.action_summary}</p>
              </div>
              {isExpanded
                ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
              }
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-white/5">
                <pre className="mt-3 text-xs text-slate-400 bg-black/20 rounded p-2 overflow-x-auto max-h-40">
                  {JSON.stringify(item.action_payload, null, 2)}
                </pre>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecision(item.id, "approved"); }}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecision(item.id, "rejected"); }}
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
