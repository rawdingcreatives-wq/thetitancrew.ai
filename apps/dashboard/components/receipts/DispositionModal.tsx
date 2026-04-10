"use client";

/**
 * DispositionModal — Material disposition for parsed receipts
 *
 * Full-screen mobile modal that lets the user:
 * 1. Select a job to attribute materials to
 * 2. Set disposition per line item (used_on_job / leftover / wasted)
 * 3. Adjust quantities
 * 4. Submit to POST /api/receipts/[id]/disposition
 *
 * Mobile-first with 48px touch targets for gloved field use.
 */
import { useState, useEffect, useCallback } from "react";

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

type Disposition = "used_on_job" | "leftover_return_to_truck" | "wasted";

interface ItemDisposition {
  line_item_id: string;
  disposition: Disposition;
  disposed_quantity: number;
  notes: string;
}

interface DispositionModalProps {
  receipt: Receipt;
  jobs: Job[];
  onClose: () => void;
}

const DISPOSITION_OPTIONS: { value: Disposition; label: string; icon: string; color: string }[] = [
  {
    value: "used_on_job",
    label: "Used on Job",
    icon: "M5 13l4 4L19 7",
    color: "border-green-500 bg-green-50 text-green-700",
  },
  {
    value: "leftover_return_to_truck",
    label: "Return to Truck",
    icon: "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10 M16.5 6h2.382a1 1 0 01.894.553l1.448 2.894A1 1 0 0121.5 10h0v6h-2",
    color: "border-blue-500 bg-blue-50 text-blue-700",
  },
  {
    value: "wasted",
    label: "Wasted / Damaged",
    icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    color: "border-red-500 bg-red-50 text-red-700",
  },
];

export function DispositionModal({ receipt, jobs, onClose }: DispositionModalProps) {
  const items = receipt.receipt_line_items || [];

  // State
  const [selectedJobId, setSelectedJobId] = useState<string>(receipt.job_id || "");
  const [itemDispositions, setItemDispositions] = useState<ItemDisposition[]>(
    items.map((item) => ({
      line_item_id: item.id,
      disposition: (item.disposition as Disposition) || "used_on_job",
      disposed_quantity: item.disposed_quantity || item.quantity,
      notes: "",
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkDisposition, setBulkDisposition] = useState<Disposition | "">("");

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Update a single item's disposition
  const updateItem = useCallback(
    (lineItemId: string, updates: Partial<ItemDisposition>) => {
      setItemDispositions((prev) =>
        prev.map((d) => (d.line_item_id === lineItemId ? { ...d, ...updates } : d))
      );
    },
    []
  );

  // Apply bulk disposition to all items
  const applyBulkDisposition = useCallback(
    (disposition: Disposition) => {
      setBulkDisposition(disposition);
      setItemDispositions((prev) =>
        prev.map((d) => ({ ...d, disposition }))
      );
    },
    []
  );

  // Submit
  const handleSubmit = async () => {
    if (!selectedJobId) {
      setError("Please select a job to attribute these materials to.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/receipts/${receipt.id}/disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          items: itemDispositions.map((d) => ({
            line_item_id: d.line_item_id,
            disposition: d.disposition,
            disposed_quantity: d.disposed_quantity,
            notes: d.notes || undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Disposition failed");
      }

      // Success — close modal (parent will router.refresh())
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const allItemsSet = itemDispositions.every((d) => d.disposition && d.disposed_quantity > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-[#1A2744]">
          <div>
            <h2 className="text-lg font-bold text-white">Dispose Materials</h2>
            <p className="text-sm text-slate-300 mt-0.5">
              {receipt.vendor_name || "Receipt"} — ${receipt.total_amount?.toFixed(2) || "0.00"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Job Selector */}
          <div>
            <label className="text-sm font-semibold text-[#1A2744] block mb-1.5">
              Attribute to Job <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setError(null);
              }}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00] min-h-[48px]"
            >
              <option value="">— Select a job —</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.status})
                </option>
              ))}
            </select>
          </div>

          {/* Bulk Action */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">
              Quick: Set All Items To
            </label>
            <div className="flex gap-2">
              {DISPOSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => applyBulkDisposition(opt.value)}
                  className={`flex-1 px-2 py-2.5 text-xs font-medium rounded-lg border-2 transition-all min-h-[44px] ${
                    bulkDisposition === opt.value
                      ? opt.color
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-Item Dispositions */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">
              Line Items ({items.length})
            </label>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const disp = itemDispositions[idx];
                if (!disp) return null;

                return (
                  <div
                    key={item.id}
                    className="bg-slate-50 rounded-xl p-3 border border-slate-200"
                  >
                    {/* Item Info */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#1A2744] text-sm truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Qty: {item.quantity}
                          {item.unit_price != null && ` × $${item.unit_price.toFixed(2)}`}
                        </p>
                      </div>
                      {item.line_total != null && (
                        <span className="font-semibold text-[#1A2744] text-sm ml-2">
                          ${item.line_total.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Disposition Selector */}
                    <div className="flex gap-1.5 mb-2">
                      {DISPOSITION_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            updateItem(item.id, { disposition: opt.value });
                            setBulkDisposition("");
                          }}
                          className={`flex-1 px-1.5 py-2 text-xs font-medium rounded-lg border-2 transition-all min-h-[40px] ${
                            disp.disposition === opt.value
                              ? opt.color
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-500 whitespace-nowrap">Qty:</label>
                      <input
                        type="number"
                        min={1}
                        max={item.quantity * 2}
                        value={disp.disposed_quantity}
                        onChange={(e) =>
                          updateItem(item.id, {
                            disposed_quantity: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00] min-h-[40px]"
                      />
                      {disp.disposition === "wasted" && (
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={disp.notes}
                          onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00] min-h-[40px]"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-4 bg-slate-50 space-y-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-3 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 min-h-[48px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedJobId || !allItemsSet}
              className="flex-1 px-4 py-3 text-sm font-bold text-white bg-[#FF6B00] rounded-xl hover:bg-[#e55f00] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                `Dispose ${items.length} Items`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
