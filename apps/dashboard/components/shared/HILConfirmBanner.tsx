/**
 * TitanCrew · HILConfirmBanner
 * Prominent banner for pending human-in-loop approvals.
 * Shows countdown timer, action details, and approve/reject buttons.
 */

"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Check, X, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

interface HILConfirmation {
  id: string;
  description: string;
  amount: number | null;
  action_type: string;
  risk_level: string;
  expires_at: string;
  response_token: string;
}

interface HILConfirmBannerProps {
  confirmation: HILConfirmation;
}

export function HILConfirmBanner({ confirmation }: HILConfirmBannerProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Live countdown timer
  useEffect(() => {
    const update = () => {
      const diff = new Date(confirmation.expires_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [confirmation.expires_at]);

  if (dismissed) return null;

  const handleAction = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      const res = await fetch(
        `/api/hil/confirm?token=${confirmation.response_token}&action=${action}`,
        { method: "POST" }
      );
      if (res.ok) {
        setDismissed(true);
        router.refresh();
      }
    } catch (err) {
      console.error("HIL response failed:", err);
    } finally {
      setLoading(null);
    }
  };

  const riskColor = {
    low: "border-slate-200 bg-slate-50",
    medium: "border-amber-200 bg-amber-50",
    high: "border-orange-300 bg-orange-50",
    critical: "border-red-300 bg-red-50",
  }[confirmation.risk_level] ?? "border-amber-200 bg-amber-50";

  const riskIconColor = {
    low: "text-slate-500",
    medium: "text-amber-600",
    high: "text-[#FF6B00]",
    critical: "text-red-600",
  }[confirmation.risk_level] ?? "text-amber-600";

  return (
    <div className={`rounded-2xl border-2 p-4 ${riskColor}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${riskIconColor}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#1A2744]">
                AI Crew needs your approval
              </span>
              <span className="text-xs bg-white/70 border border-current/20 px-2 py-0.5 rounded-full font-medium capitalize text-slate-600">
                {confirmation.action_type.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1 truncate">{confirmation.description}</p>
            {confirmation.amount && (
              <p className="text-sm font-bold text-[#1A2744] mt-0.5">
                Amount: ${confirmation.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>

        {/* Timer + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{timeLeft}</span>
          </div>
          <button
            onClick={() => handleAction("reject")}
            disabled={!!loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reject</span>
          </button>
          <button
            onClick={() => handleAction("approve")}
            disabled={!!loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FF6B00] text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading === "approve" ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}
