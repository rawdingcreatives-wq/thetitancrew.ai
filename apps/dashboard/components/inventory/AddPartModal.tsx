// @ts-nocheck
/**
 * TitanCrew · AddPartModal
 * Client component modal for adding a new inventory item.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface AddPartModalProps {
  accountId: string;
  onClose: () => void;
}

export function AddPartModal({ accountId, onClose }: AddPartModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    sku: "",
    quantity_on_hand: "0",
    reorder_point: "2",
    unit_cost: "",
    supplier: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Part name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: form.name.trim(),
          sku: form.sku || undefined,
          quantity_on_hand: parseInt(form.quantity_on_hand, 10) || 0,
          reorder_point: parseInt(form.reorder_point, 10) || 2,
          unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : undefined,
          supplier: form.supplier || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add part");
      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not add part. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1A2744]">Add Inventory Part</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Part Name *</label>
            <input
              required autoFocus
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., 3/4 in. Ball Valve"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">SKU / Part #</label>
              <input
                value={form.sku}
                onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="BV-075"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Supplier</label>
              <input
                value={form.supplier}
                onChange={(e) => setForm(f => ({ ...f, supplier: e.target.value }))}
                placeholder="Ferguson"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">On Hand</label>
              <input
                type="number" min="0"
                value={form.quantity_on_hand}
                onChange={(e) => setForm(f => ({ ...f, quantity_on_hand: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Reorder At</label>
              <input
                type="number" min="0"
                value={form.reorder_point}
                onChange={(e) => setForm(f => ({ ...f, reorder_point: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Unit Cost ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.unit_cost}
                onChange={(e) => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                placeholder="12.50"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2 bg-[#FF6B00] text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? "Adding..." : "Add Part"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
