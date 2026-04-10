"use client";

/**
 * ReceiptList — Displays receipts with status badges and expansion
 *
 * Each receipt card shows: vendor, date, total, status, item count.
 * Tapping expands to show line items + disposition controls.
 * Mobile-first with large touch targets.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DispositionModal } from "./DispositionModal";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  disposition: string | null;
  disposed_quantity: number | null;
}

interface Receipt {
  id: string;
  status: string;
  vendor_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  original_filename: string | null;
  parse_confidence: number | null;
  job_id: string | null;
  created_at: string;
  receipt_line_items: LineItem[];
}

interface Job {
  id: string;
  title: string;
  status: string;
}

interface ReceiptListProps {
  receipts: Receipt[];
  jobs: Job[];
  accountId: string;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  uploaded:   { label: "Uploaded",   color: "text-slate-600 bg-slate-100",   dot: "bg-slate-400" },
  parsing:    { label: "Parsing...", color: "text-blue-700 bg-blue-100",     dot: "bg-blue-500" },
  parsed:     { label: "Parsed",    color: "text-[#FF6B00] bg-orange-100",  dot: "bg-[#FF6B00]" },
  attributed: { label: "Attributed", color: "text-indigo-700 bg-indigo-100", dot: "bg-indigo-500" },
  disposed:   { label: "Disposed",  color: "text-green-700 bg-green-100",   dot: "bg-green-500" },
  error:      { label: "Error",     color: "text-red-700 bg-red-100",       dot: "bg-red-500" },
};

export function ReceiptList({ receipts, jobs, accountId }: ReceiptListProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dispositionReceipt, setDispositionReceipt] = useState<Receipt | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetryParse = async (receiptId: string) => {
    setRetrying(receiptId);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/parse`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setRetrying(null);
    }
  };

  if (receipts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[#1A2744]">No receipts yet</h3>
        <p className="text-sm text-slate-500 mt-1">
          Snap a receipt photo in the field to get started
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {receipts.map((receipt) => {
          const status = statusConfig[receipt.status] || statusConfig.uploaded;
          const isExpanded = expandedId === receipt.id;
          const items = receipt.receipt_line_items || [];
          const disposedItems = items.filter((i) => i.disposition);

          return (
            <div
              key={receipt.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Card Header — tappable */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : receipt.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors min-h-[60px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#1A2744] truncate">
                      {receipt.vendor_name || receipt.original_filename || "Receipt"}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    {receipt.receipt_date && (
                      <span>{new Date(receipt.receipt_date).toLocaleDateString()}</span>
                    )}
                    {items.length > 0 && (
                      <span>{items.length} items</span>
                    )}
                    {disposedItems.length > 0 && (
                      <span className="text-green-600">
                        {disposedItems.length}/{items.length} disposed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {receipt.total_amount != null && (
                    <span className="font-bold text-[#1A2744]">
                      ${receipt.total_amount.toFixed(2)}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-slate-100 px-4 pb-4">
                  {/* Confidence badge */}
                  {receipt.parse_confidence != null && (
                    <div className="mt-3 mb-2">
                      <span className="text-xs text-slate-500">
                        Parse confidence:{" "}
                        <span className={receipt.parse_confidence >= 0.8 ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                          {(receipt.parse_confidence * 100).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Line Items */}
                  {items.length > 0 ? (
                    <div className="space-y-2 mt-3">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[#1A2744] truncate">
                              {item.description}
                            </p>
                            <p className="text-xs text-slate-500">
                              Qty: {item.quantity}
                              {item.unit_price != null && ` × $${item.unit_price.toFixed(2)}`}
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            {item.line_total != null && (
                              <p className="font-medium text-[#1A2744]">
                                ${item.line_total.toFixed(2)}
                              </p>
                            )}
                            {item.disposition && (
                              <span className="text-xs text-green-600">
                                {item.disposition.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mt-3">
                      {receipt.status === "uploaded" ? "Not yet parsed" : "No line items detected"}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    {(receipt.status === "uploaded" || receipt.status === "error") && (
                      <button
                        onClick={() => handleRetryParse(receipt.id)}
                        disabled={retrying === receipt.id}
                        className="flex-1 px-3 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                      >
                        {retrying === receipt.id ? "Parsing..." : "Parse Receipt"}
                      </button>
                    )}

                    {(receipt.status === "parsed" || receipt.status === "attributed") && (
                      <button
                        onClick={() => setDispositionReceipt(receipt)}
                        className="flex-1 px-3 py-2.5 text-sm font-semibold text-white bg-[#FF6B00] rounded-lg hover:bg-[#e55f00] min-h-[44px]"
                      >
                        Dispose Materials
                      </button>
                    )}

                    {receipt.status === "disposed" && (
                      <div className="flex-1 px-3 py-2.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg text-center min-h-[44px] flex items-center justify-center">
                        All materials disposed
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disposition Modal */}
      {dispositionReceipt && (
        <DispositionModal
          receipt={dispositionReceipt}
          jobs={jobs}
          onClose={() => {
            setDispositionReceipt(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
