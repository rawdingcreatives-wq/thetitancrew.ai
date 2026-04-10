/**
 * TitanCrew · JobsHeader
 * Sticky header for jobs page: title, total counts, + new job button.
 */

"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface JobsHeaderProps {
  accountId: string;
  technicians: { id: string; name: string }[];
}

export function JobsHeader({ accountId, technicians }: JobsHeaderProps) {
  const router = useRouter();
  const [showNewJob, setShowNewJob] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    job_type: "service",
    priority: "2",
    estimate_amount: "",
    technician_id: "",
    address: "",
    customer_name: "",
    customer_phone: "",
  });

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create job");
      setShowNewJob(false);
      setForm({ title: "", job_type: "service", priority: "2", estimate_amount: "", technician_id: "", address: "", customer_name: "", customer_phone: "" });
      showToast("Job created successfully!", true);
      router.refresh();
    } catch (err: unknown) {
      showToast((err instanceof Error ? err.message : String(err)) ?? "Could not create job. Please try again.", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all
          ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#1A2744]">Jobs Pipeline</h1>
          <p className="text-xs text-slate-400 mt-0.5">Drag cards to update status</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <Search className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => setShowNewJob(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B00] text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Job</span>
          </button>
        </div>
      </div>

      {/* New Job Modal */}
      {showNewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-[#1A2744]">New Job Lead</h2>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Job Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Water heater replacement"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Customer Name</label>
                  <input
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    placeholder="John Smith"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Phone</label>
                  <input
                    value={form.customer_phone}
                    onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    placeholder="555-000-1234"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Est. Value ($)</label>
                  <input
                    type="number"
                    value={form.estimate_amount}
                    onChange={(e) => setForm((f) => ({ ...f, estimate_amount: e.target.value }))}
                    placeholder="350"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                  >
                    <option value="1">🔴 Urgent</option>
                    <option value="2">🟡 Normal</option>
                    <option value="3">🟢 Low</option>
                  </select>
                </div>
              </div>
              {technicians.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Assign Tech (optional)</label>
                  <select
                    value={form.technician_id}
                    onChange={(e) => setForm((f) => ({ ...f, technician_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                  >
                    <option value="">Let AI assign</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St, Austin TX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewJob(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 bg-[#FF6B00] text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-60"
                >
                  {saving ? "Creating..." : "Create Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
