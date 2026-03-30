"use client";
/**
 * TitanCrew — PlanGate Component
 *
 * Wraps Pro/Elite-only UI sections with a tasteful lock overlay.
 * Usage:
 *   <PlanGate feature="techDispatch" currentPlan={plan}>
 *     <TechDispatchPanel />
 *   </PlanGate>
 *
 * When the user is on a qualifying plan, renders children normally.
 * Otherwise shows a frosted-glass overlay with the feature name and
 * an Upgrade CTA.
 */

import Link from "next/link";
import { Lock, ArrowUpRight } from "lucide-react";
import { hasFeature } from "@/lib/plan-gates";
import type { PlanFeatures } from "@/lib/plan-gates";

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  agentCount:         "Extended Agent Count",
  techDispatch:       "Tech Dispatch AI",
  multiLocation:      "Multi-Location Support",
  priorityOnboarding: "Priority Onboarding Call",
  customWorkflows:    "Custom AI Workflows",
  apiAccess:          "API Access",
  advancedAnalytics:  "Advanced Analytics",
  whiteLabel:         "White Label Branding",
  accountManager:     "Dedicated Account Manager",
};

interface PlanGateProps {
  feature: keyof PlanFeatures;
  currentPlan: string | null | undefined;
  children: React.ReactNode;
  /** Optional: show a compact inline badge instead of full overlay */
  compact?: boolean;
}

export function PlanGate({ feature, currentPlan, children, compact = false }: PlanGateProps) {
  const allowed = hasFeature(currentPlan, feature);

  if (allowed) return <>{children}</>;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
        <Lock className="w-3 h-3" />
        Pro feature
        <Link
          href="/pricing"
          className="text-[#FF6B00] font-semibold hover:underline ml-0.5"
        >
          Upgrade →
        </Link>
      </span>
    );
  }

  return (
    <div className="relative">
      {/* Blurred children */}
      <div className="pointer-events-none select-none" style={{ filter: "blur(4px)", opacity: 0.35 }}>
        {children}
      </div>

      {/* Lock overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center rounded-xl gap-3 p-4"
        style={{
          background: "rgba(13,22,38,0.75)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,107,0,0.25)",
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.3)" }}
        >
          <Lock className="w-5 h-5 text-[#FF6B00]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-white">{FEATURE_LABELS[feature]}</p>
          <p className="text-xs text-slate-400 mt-1">Available on the Pro plan</p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #FF6B00, #FF9500)",
            boxShadow: "0 0 16px rgba(255,107,0,0.4)",
          }}
        >
          <ArrowUpRight className="w-4 h-4" />
          Upgrade to Pro
        </Link>
      </div>
    </div>
  );
}

/**
 * ProBadge — small inline indicator for Pro-only items in lists/tables.
 * Shows an orange "PRO" pill that links to the pricing page.
 */
export function ProBadge() {
  return (
    <Link
      href="/pricing"
      className="inline-flex items-center gap-1 text-[10px] font-extrabold text-white px-1.5 py-0.5 rounded uppercase tracking-wide ml-1.5"
      style={{ background: "linear-gradient(135deg, #FF6B00, #FF9500)" }}
    >
      <Lock className="w-2.5 h-2.5" />
      PRO
    </Link>
  );
}
