// @ts-nocheck
import { Check, X, Clock } from "lucide-react";

export function HILComplianceStats({ total, approved, rejected, pending }: { total: number; approved: number; rejected: number; pending: number }) {
  const rate = total > 0 ? Math.round(((approved + rejected) / total) * 100) : 100;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-[#1A2744] mb-4">Human-in-the-Loop Response Rate</h3>
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total", value: total, icon: null, color: "text-slate-700" },
          { label: "Approved", value: approved, icon: Check, color: "text-emerald-600" },
          { label: "Rejected", value: rejected, icon: X, color: "text-red-600" },
          { label: "Pending", value: pending, icon: Clock, color: "text-amber-600" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="text-center">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-1">
                {Icon && <Icon className="w-3 h-3" />}{s.label}
              </p>
            </div>
          );
        })}
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#FF6B00] to-emerald-500 rounded-full" style={{ width: `${rate}%` }} />
      </div>
      <p className="text-xs text-slate-500 mt-1.5 text-right">{rate}% response rate</p>
    </div>
  );
}
