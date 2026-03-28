/**
 * TitanCrew Dashboard — /audit-log
 *
 * Immutable, owner-accessible audit trail of every AI agent action.
 * Every row was written by AuditLogger — append-only, no deletes.
 *
 * Features:
 *   - Real-time stream of agent actions with rationale
 *   - Filter by agent type, action type, date range
 *   - HIL approval status visible inline
 *   - CSV export for compliance/legal purposes
 *   - "Question this action" button → opens support ticket
 */

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { AuditLogFilters } from "@/components/audit/AuditLogFilters";
import { AuditLogSummary } from "@/components/audit/AuditLogSummary";
import { Shield, Download, Lock } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

export const metadata = { title: "Audit Log — TitanCrew" };

type AuditEntry = Database["public"]["Tables"]["audit_log"]["Row"];

// ─── Page ─────────────────────────────────────────────────

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: {
    agentType?: string;
    eventType?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/onboarding");

  // Build query with filters
  const PAGE_SIZE = 50;
  const page = parseInt(searchParams.page ?? "1");
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (searchParams.agentType && searchParams.agentType !== "all") {
    query = query.eq("actor", searchParams.agentType);
  }
  if (searchParams.eventType && searchParams.eventType !== "all") {
    query = query.ilike("event_type", `${searchParams.eventType}%`);
  }
  if (searchParams.from) {
    query = query.gte("created_at", new Date(searchParams.from).toISOString());
  }
  if (searchParams.to) {
    query = query.lte("created_at", new Date(searchParams.to + "T23:59:59").toISOString());
  }

  const { data: entries, count } = await query;

  // Summary stats (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentStats } = await supabase
    .from("audit_log")
    .select("event_type, actor")
    .eq("account_id", account.id)
    .gte("created_at", thirtyDaysAgo);

  const totalActions = recentStats?.length ?? 0;
  const uniqueAgents = new Set(recentStats?.map((r) => r.actor)).size;
  const eventTypes = [...new Set(recentStats?.map((r) => r.event_type?.split(".")[0]))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1A2744] rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-[#FF6B00]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A2744]">Audit Log</h1>
            <p className="text-gray-500 text-sm">
              Every AI action taken on your account — immutable, tamper-proof
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Lock size={12} />
            <span>Append-only · No deletions possible</span>
          </div>
          <a
            href={`/api/audit-log/export?accountId=${account.id}&format=csv`}
            className="flex items-center gap-2 bg-[#1A2744] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#2E4478] transition-colors"
          >
            <Download size={16} />
            Export CSV
          </a>
        </div>
      </div>

      {/* 30-day Summary */}
      <AuditLogSummary
        totalActions={totalActions}
        uniqueAgents={uniqueAgents}
        eventCategories={eventTypes}
        accountName={account.business_name ?? "Your Business"}
      />

      {/* Filters */}
      <AuditLogFilters currentFilters={searchParams} />

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 className="font-semibold text-[#1A2744]">
            Agent Actions
          </h2>
          <span className="text-sm text-gray-500">
            {count?.toLocaleString() ?? 0} total records
          </span>
        </div>
        <AuditLogTable
          entries={(entries as AuditEntry[]) ?? []}
          totalCount={count ?? 0}
          currentPage={page}
          pageSize={PAGE_SIZE}
        />
      </div>

      {/* Legal Notice */}
      <div className="text-center text-xs text-gray-400">
        <p>
          This audit log is maintained for your account per TitanCrew's{" "}
          <a href="/compliance" className="text-[#FF6B00] hover:underline">Data Processing Agreement</a>.
          Records are retained for 7 years. Cannot be modified or deleted by TitanCrew staff.
        </p>
      </div>
    </div>
  );
}
