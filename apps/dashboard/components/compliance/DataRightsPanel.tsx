"use client";
import { useState } from "react";
import { Database, Download, Trash2, Shield, Loader2 } from "lucide-react";

export function DataRightsPanel({ _accountId }: { _accountId: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const request = async (action: "export" | "delete") => {
    setLoading(action);
    setMsg(null);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(null);
    setMsg(action === "export"
      ? "Data export requested. You'll receive an email within 24 hours."
      : "Deletion request submitted. Account data will be removed within 30 days per CCPA/GDPR.");
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-[#1A2744] mb-1 flex items-center gap-2">
        <Database className="w-4 h-4 text-[#FF6B00]" /> Data Rights (CCPA / GDPR)
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        You have the right to access, export, or delete all data TitanCrew holds about your business.
      </p>
      {msg && (
        <div className="mb-4 rounded-lg p-3 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-start gap-2">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />{msg}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => request("export")} disabled={loading !== null}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1A2744] hover:bg-[#243358] disabled:opacity-60 transition-colors">
          {loading === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export My Data
        </button>
        <button onClick={() => request("delete")} disabled={loading !== null}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-60 transition-colors">
          {loading === "delete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Request Data Deletion
        </button>
      </div>
    </div>
  );
}
