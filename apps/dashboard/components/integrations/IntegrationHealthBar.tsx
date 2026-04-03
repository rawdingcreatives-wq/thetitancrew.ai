// @ts-nocheck
/**
 * TitanCrew · IntegrationHealthBar
 * Visual bar showing integration completeness and agent readiness.
 */

import { AlertTriangle, CheckCircle2, Zap } from "lucide-react";

interface IntegrationStatus {
  googleCalendar: { connected: boolean };
  quickbooks: { connected: boolean };
  ferguson: { enabled: boolean };
  grainger: { enabled: boolean };
  twilio?: { a2pRegistered: boolean };
}

interface IntegrationHealthBarProps {
  status: IntegrationStatus;
}

export function IntegrationHealthBar({ status }: IntegrationHealthBarProps) {
  const integrations = [
    { id: "google", label: "Google Calendar", ok: status.googleCalendar.connected, critical: true },
    { id: "qbo", label: "QuickBooks", ok: status.quickbooks.connected, critical: true },
    { id: "ferguson", label: "Ferguson", ok: status.ferguson.enabled, critical: false },
    { id: "grainger", label: "Grainger", ok: status.grainger.enabled, critical: false },
  ];

  const connected = integrations.filter((i) => i.ok).length;
  const total = integrations.length;
  const pct = Math.round((connected / total) * 100);
  const criticalMissing = integrations.filter((i) => i.critical && !i.ok);
  const allGood = connected === total;

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        background: allGood ? "rgba(16,185,129,0.04)" : "rgba(255,107,0,0.04)",
        borderColor: allGood ? "rgba(16,185,129,0.2)" : "rgba(255,107,0,0.2)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {allGood ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Zap className="w-4 h-4 text-[#FF6B00]" />
          )}
          <span className="text-sm font-semibold text-[#1A2744]">
            {allGood ? "All integrations connected" : `${connected}/${total} integrations connected`}
          </span>
        </div>
        <span className={`text-xs font-bold ${allGood ? "text-emerald-600" : "text-[#FF6B00]"}`}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: allGood
              ? "linear-gradient(90deg, #10B981, #34D399)"
              : "linear-gradient(90deg, #FF6B00, #FF9500)",
          }}
        />
      </div>

      {/* Integration dots */}
      <div className="flex flex-wrap gap-2">
        {integrations.map((i) => (
          <div
            key={i.id}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
              i.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : i.critical
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "bg-slate-50 border-slate-200 text-slate-500"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${i.ok ? "bg-emerald-500" : i.critical ? "bg-red-500" : "bg-slate-300"}`} />
            {i.label}
          </div>
        ))}
      </div>

      {criticalMissing.length > 0 && (
        <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {criticalMissing.map((i) => i.label).join(" and ")} {criticalMissing.length === 1 ? "is" : "are"} required for full agent capability.
        </p>
      )}
    </div>
  );
}
