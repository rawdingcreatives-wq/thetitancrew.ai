// @ts-nocheck
/**
 * TitanCrew · Admin Support Tickets
 *
 * Manage customer support tickets. View, assign, respond,
 * and track resolution. Filterable by status and priority.
 */
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  HeadphonesIcon, Search, Filter, Clock, CheckCircle,
  AlertTriangle, MessageSquare, User, X, Send,
  ChevronDown, ArrowUpDown, Tag,
} from "lucide-react";

interface Ticket {
  id: string;
  created_at: string;
  updated_at: string;
  account_id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  tags: string[] | null;
  resolved_at: string | null;
  resolution_note: string | null;
  satisfaction: number | null;
  business_name?: string;
}

interface Comment {
  id: string;
  created_at: string;
  body: string;
  is_internal: boolean;
  author_admin_id: string | null;
  author_user_id: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  open:             { color: "text-blue-400",    bg: "bg-blue-500/20",    label: "Open" },
  in_progress:      { color: "text-amber-400",   bg: "bg-amber-500/20",   label: "In Progress" },
  waiting_customer: { color: "text-purple-400",  bg: "bg-purple-500/20",  label: "Waiting" },
  resolved:         { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Resolved" },
  closed:           { color: "text-slate-400",   bg: "bg-slate-500/20",   label: "Closed" },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
  low:    { color: "text-slate-400",   bg: "bg-slate-500/20" },
  normal: { color: "text-blue-400",    bg: "bg-blue-500/20" },
  high:   { color: "text-amber-400",   bg: "bg-amber-500/20" },
  urgent: { color: "text-red-400",     bg: "bg-red-500/20" },
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await (supabase.from("support_tickets") as any)
        .select("*")
        .order("created_at", { ascending: false });
      setTickets(data ?? []);
      setLoading(false);
    })();
  }, []);

  const loadComments = async (ticketId: string) => {
    const supabase = createClient();
    const { data } = await (supabase.from("support_ticket_comments") as any)
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
  };

  const handleSelectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    await loadComments(ticket.id);
  };

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    const supabase = createClient();
    const updates: any = { status };
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    await (supabase.from("support_tickets") as any)
      .update(updates)
      .eq("id", ticketId);
    setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, ...updates } : t));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleSendComment = async () => {
    if (!selectedTicket || !newComment.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get admin user id
    const { data: adminUser } = await (supabase.from("admin_users") as any)
      .select("id")
      .eq("user_id", user?.id)
      .single();

    await (supabase.from("support_ticket_comments") as any).insert({
      ticket_id: selectedTicket.id,
      author_admin_id: adminUser?.id ?? null,
      body: newComment.trim(),
      is_internal: false,
    });

    setNewComment("");
    await loadComments(selectedTicket.id);
    setSending(false);
  };

  const filtered = tickets.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    }
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/50">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading support tickets…</span>
        </div>
      </div>
    );
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const urgentCount = tickets.filter((t) => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Support Tickets</h1>
          <p className="text-sm text-slate-400 mt-1">
            {openCount} open · {inProgressCount} in progress
            {urgentCount > 0 && <span className="text-red-400 ml-1">· {urgentCount} urgent</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting_customer">Waiting</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Ticket list + detail split */}
      <div className="flex gap-4">
        {/* Ticket list */}
        <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur flex-1 ${selectedTicket ? "hidden lg:block lg:max-w-md" : ""}`}>
          <div className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-500 text-center">No tickets match your filters.</p>
            ) : (
              filtered.map((ticket) => {
                const sc = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
                const pc = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.normal;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                      selectedTicket?.id === ticket.id ? "bg-white/[0.05]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate flex-1">{ticket.subject}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.color} flex-shrink-0 ml-2`}>
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{ticket.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${pc.bg} ${pc.color}`}>{ticket.priority}</span>
                      {ticket.category && (
                        <span className="text-xs text-slate-500">{ticket.category}</span>
                      )}
                      <span className="text-xs text-slate-600 ml-auto">
                        {new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedTicket && (
          <div className="flex-1 rounded-xl border border-white/10 bg-white/5 backdrop-blur flex flex-col max-h-[calc(100vh-14rem)]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white truncate">{selectedTicket.subject}</h3>
                <p className="text-xs text-slate-400">
                  Created {new Date(selectedTicket.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 lg:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
              <p className="text-sm text-slate-300">{selectedTicket.description}</p>
            </div>

            {/* Status actions */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 flex-shrink-0 flex-wrap">
              {["open", "in_progress", "waiting_customer", "resolved", "closed"].map((s) => {
                const sc = STATUS_CONFIG[s] ?? STATUS_CONFIG.open;
                const active = selectedTicket.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleUpdateStatus(selectedTicket.id, s)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      active ? `${sc.bg} ${sc.color} ring-1 ring-white/20` : "bg-white/5 text-slate-500 hover:bg-white/10"
                    }`}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>

            {/* Comments thread */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className={`rounded-lg p-3 ${c.author_admin_id ? "bg-[#FF6B00]/10 border border-[#FF6B00]/20 ml-4" : "bg-white/5 border border-white/10 mr-4"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-300">
                        {c.author_admin_id ? "Admin" : "Customer"}
                        {c.is_internal && <span className="text-xs text-amber-400 ml-1">(internal)</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a reply…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50"
                />
                <button
                  onClick={handleSendComment}
                  disabled={!newComment.trim() || sending}
                  className="p-2 rounded-lg bg-[#FF6B00] text-white hover:bg-[#FF6B00]/80 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
