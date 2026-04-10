"use client";

/**
 * TitanCrew — AuditLogTable
 * Renders the immutable audit log in a sortable, paginated table.
 * Each row shows: timestamp, agent, action, details summary, HIL status.
 */

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { timeAgo, agentLabel } from "@/lib/utils";
import { CheckCircle2, Clock, Info, AlertTriangle, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

interface AuditEntry {
  id: string;
  account_id: string;
  actor: string;
  event_type: string;
  created_at: string;
  details: Record<string, unknown>;
}

interface AuditLogTableProps {
  entries: AuditEntry[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
}

// ─── Event Type Renderers ─────────────────────────────────

function getEventIcon(eventType: string) {
  if (eventType.includes("invoice")) return <span className="text-purple-500">💰</span>;
  if (eventType.includes("calendar") || eventType.includes("job")) return <span>📅</span>;
  if (eventType.includes("sms") || eventType.includes("comms")) return <span>💬</span>;
  if (eventType.includes("supplier") || eventType.includes("purchase")) return <span>🔧</span>;
  if (eventType.includes("hil")) return <span>👤</span>;
  if (eventType.includes("onboard")) return <span>🚀</span>;
  if (eventType.includes("cost") || eventType.includes("billing")) return <span>💳</span>;
  return <span>🤖</span>;
}

function getEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "calendar.job_booked": "Job Booked",
    "calendar.job_updated": "Job Updated",
    "calendar.job_cancelled": "Job Cancelled",
    "calendar.availability_checked": "Availability Checked",
    "qbo.invoice_created": "Invoice Created",
    "qbo.invoice_voided": "Invoice Voided",
    "qbo.customer_created": "Customer Synced",
    "supplier.parts_searched": "Parts Searched",
    "supplier.purchase_order_created": "PO Created",
    "hil.requested": "HIL Requested",
    "hil.approved": "HIL Approved",
    "hil.rejected": "HIL Rejected",
    "hil.expired": "HIL Expired",
    "onboarding_complete": "Onboarding Complete",
    "prompt_variant_promoted": "Prompt Updated",
    "critical_issue_escalated": "Issue Escalated",
    "health_score_updated": "Health Score Updated",
    "churn_intervention.payment_failed_sms.sent": "Payment Recovery SMS Sent",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ").replace(/\./g, " → ");
}

function HILBadge({ details }: { details: Record<string, unknown> | null }) {
  const hilStatus = details?.hilApproved as boolean | undefined;
  if (hilStatus === undefined) return null;

  if (hilStatus === true) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
        <CheckCircle2 size={10} /> HIL Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
      <AlertTriangle size={10} /> Auto (No HIL)
    </span>
  );
}

// ─── Row Detail Expander ──────────────────────────────────

function AuditRowDetail({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const details = entry.details as Record<string, unknown> | null;

  if (!details || Object.keys(details).length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[#FF6B00] hover:underline flex items-center gap-1"
      >
        <Info size={10} />
        {expanded ? "Hide details" : "View details"}
      </button>
      {expanded && (
        <pre className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main Table ───────────────────────────────────────────

export function AuditLogTable({
  entries,
  totalCount,
  currentPage,
  pageSize,
}: AuditLogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(totalCount / pageSize);

  function navigatePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Clock size={40} className="mb-3 opacity-40" />
        <p className="font-medium">No audit entries found</p>
        <p className="text-sm mt-1">Agent actions will appear here as they run</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFF] border-b border-[#E2E8F0]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">HIL Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {entries.map((entry) => {
              const details = entry.details as Record<string, unknown> | null;
              return (
                <tr key={entry.id} className="hover:bg-[#F8FAFF] transition-colors group">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    <div>{timeAgo(entry.created_at!)}</div>
                    <div className="text-gray-400">{new Date(entry.created_at!).toLocaleTimeString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[#1A2744] font-medium text-xs">
                      <span className="w-5 h-5 bg-[#1A2744] rounded-full flex items-center justify-center text-white text-[9px] flex-shrink-0">
                        {(entry.actor ?? "?")[0].toUpperCase()}
                      </span>
                      {agentLabel(entry.actor ?? "")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-lg leading-none">{getEventIcon(entry.event_type ?? "")}</span>
                      <div>
                        <div className="font-medium text-[#1A2744]">{getEventLabel(entry.event_type ?? "")}</div>
                        {(details && "jobId" in details && details.jobId && (
                          <div className="text-xs text-gray-400">Job: {String(details.jobId).slice(0, 12)}…</div>
                        )) as unknown as ReactNode}
                        {(details && "totalAmount" in details && details.totalAmount && (
                          <div className="text-xs text-gray-500">${Number(details.totalAmount).toLocaleString()}</div>
                        )) as unknown as ReactNode}
                        <AuditRowDetail entry={entry} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <HILBadge details={details} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#FF6B00]"
                      title="Question this action"
                      onClick={() => window.open(`mailto:support@titancrew.ai?subject=Question about audit entry ${entry.id}`, "_blank")}
                    >
                      <HelpCircle size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-[#F1F5F9]">
        {entries.map((entry) => {
          const details = entry.details as Record<string, unknown> | null;
          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getEventIcon(entry.event_type ?? "")}</span>
                  <div>
                    <div className="font-medium text-[#1A2744] text-sm">{getEventLabel(entry.event_type ?? "")}</div>
                    <div className="text-xs text-gray-400">{agentLabel(entry.actor ?? "")} · {timeAgo(entry.created_at!)}</div>
                  </div>
                </div>
                <HILBadge details={details} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigatePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600 px-3">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => navigatePage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
