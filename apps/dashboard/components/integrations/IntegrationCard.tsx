// @ts-nocheck
/**
 * TitanCrew · IntegrationCard
 * Shows connection status, connect/disconnect button, features, and agent dependencies.
 */
"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, ExternalLink, Lock, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface IntegrationCardProps {
  id: string;
  name: string;
  description: string;
  logoSrc?: string;
  connected: boolean;
  connectedAt?: string;
  connectedDetail?: string;
  connectUrl?: string;
  disconnectUrl?: string;
  features: string[];
  requiredFor?: string[];
  docUrl?: string;
  isAdminManaged?: boolean;
}

export function IntegrationCard({
  id, name, description, logoSrc, connected, connectedAt, connectedDetail,
  connectUrl, disconnectUrl, features, requiredFor = [], docUrl, isAdminManaged,
}: IntegrationCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!disconnectUrl) return;
    setDisconnecting(true);
    try {
      await fetch(disconnectUrl, { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  };

  const connectedDate = connectedAt
    ? new Date(connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        connected ? "border-emerald-200 bg-white" : "border-slate-200 bg-white"
      }`}
      style={{ boxShadow: connected ? "0 0 0 1px rgba(16,185,129,0.1), 0 4px 16px rgba(0,0,0,0.06)" : "0 4px 16px rgba(0,0,0,0.06)" }}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Logo / Icon */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl font-bold ${
            connected ? "bg-emerald-50 border border-emerald-100" : "bg-slate-100 border border-slate-200"
          }`}>
            {logoSrc ? (
              <img src={logoSrc} alt={name} className="w-7 h-7 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              name.slice(0, 2)
            )}
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-[#1A2744] text-base">{name}</h3>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                connected
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}>
                {connected
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Connected</>
                  : <><XCircle className="w-3.5 h-3.5" /> Not connected</>
                }
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
            {connected && connectedDetail && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">{connectedDetail}</p>
            )}
            {connected && connectedDate && (
              <p className="text-xs text-slate-400 mt-0.5">Connected {connectedDate}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          {isAdminManaged ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              Managed by TitanCrew
            </div>
          ) : connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {disconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Disconnect
            </button>
          ) : connectUrl ? (
            <a
              href={connectUrl}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#FF6B00] hover:bg-orange-600 px-4 py-2 rounded-lg transition-colors"
            >
              Connect →
            </a>
          ) : null}

          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors ml-auto"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Expandable: features + agent dependencies */}
      <div className="border-t border-slate-100">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>What this unlocks</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="px-5 pb-4 space-y-3">
            {/* Features */}
            <ul className="space-y-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                  <Check className="w-3.5 h-3.5 text-[#FF6B00] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>

            {/* Required for */}
            {requiredFor.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                <span className="text-xs text-slate-400 w-full mb-0.5">Required for:</span>
                {requiredFor.map((agent) => (
                  <span
                    key={agent}
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#1A2744]/5 text-[#1A2744] border border-[#1A2744]/10"
                  >
                    {agent}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
