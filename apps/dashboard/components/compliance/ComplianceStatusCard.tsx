// @ts-nocheck
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  compliant:    { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", label: "Compliant" },
  warning:      { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Warning" },
  action_needed:{ icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Action Needed" },
};

export function ComplianceStatusCard({ icon, label, status, detail }: { icon: React.ReactNode; label: string; status: keyof typeof STATUS_CONFIG; detail?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.compliant;
  const Icon = cfg.icon;
  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cfg.color}>{icon}</span>
          <span className="text-sm font-semibold text-[#1A2744]">{label}</span>
        </div>
        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
          <Icon className="w-3 h-3" />{cfg.label}
        </span>
      </div>
      {detail && <p className="text-xs text-slate-500 mt-2">{detail}</p>}
    </div>
  );
}
