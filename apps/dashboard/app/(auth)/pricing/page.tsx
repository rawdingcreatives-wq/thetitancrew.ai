/**
 * TitanCrew — Pricing / Plan Selection Page
 *
 * Route: /pricing
 * Shown to users who haven't subscribed yet (or want to upgrade).
 * Calls POST /api/billing/checkout → redirects to Stripe Checkout.
 *
 * Flow:
 *   Sign Up → /pricing → Stripe Checkout → /billing/success → /onboarding
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap, ArrowRight, Star } from "lucide-react";

// ─── Plan data ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    key:       "lite",
    name:      "Lite",
    price:     0,
    priceLine: "Free",
    tag:       null,
    color:     "#64748B",
    accent:    "border-slate-200",
    highlight: false,
    features: [
      "5 AI agents included",
      "Google Calendar integration",
      "QuickBooks Online sync",
      "SMS & email automations",
      "Daily 6 AM AI briefing",
      "Compliance & audit log",
      "Up to 3 technicians",
    ],
    proFeatures: [],
    cta: "Start with Lite",
  },
  {
    key:       "growth",
    name:      "Growth",
    price:     399,
    priceLine: "$399/mo",
    tag:       "Most Popular",
    color:     "#FF6B00",
    accent:    "border-[#FF6B00]",
    highlight: true,
    features: [
      "Everything in Lite, plus:",
      "All 6 AI agents (including Tech Dispatch)",
      "Tech Dispatch AI (route optimization)",
      "Multi-location support",
      "Priority support + onboarding call",
      "Custom AI agent workflows",
      "API access for integrations",
      "Advanced analytics & attribution",
      "Unlimited technicians",
    ],
    proFeatures: [
      "Tech Dispatch AI",
      "Multi-location",
      "Custom workflows",
      "API access",
    ],
    cta: "Start with Growth",
  },
  {
    key:       "scale",
    name:      "Scale",
    price:     799,
    priceLine: "$799/mo",
    tag:       null,
    color:     "#9F7AEA",
    accent:    "border-purple-500",
    highlight: false,
    features: [
      "Everything in Growth, plus:",
      "White-label customization",
      "Dedicated account manager",
      "Priority support (2-hour SLA)",
      "Custom deployment & onboarding",
      "Advanced security & compliance",
      "Unlimited users & locations",
    ],
    proFeatures: [
      "White-label",
      "Account manager",
      "Priority SLA",
    ],
    cta: "Start with Scale",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router  = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError  ] = useState<string | null>(null);

  const selectPlan = async (planKey: string) => {
    setLoading(planKey);
    setError(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planKey }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        // If Stripe isn't configured yet, skip directly to onboarding
        // (dev/demo mode — remove this bypass in production)
        if (data.error === "Stripe not configured" || data.error === "Price ID not configured") {
          router.push(`/onboarding?plan=${planKey}`);
          return;
        }
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(null);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-[#0D1626]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,107,0,0.15) 0%, transparent 60%)",
      }}
    >
      {/* Top bar */}
      <div className="px-5 py-4 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <div className="w-7 h-7 bg-[#FF6B00] rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(255,107,0,0.5)]">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-extrabold text-lg tracking-tight">
            <span className="text-white">Titan</span>
            <span className="text-[#FF6B00]">Crew</span>
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center px-4 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
          style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.25)", color: "#FF9500" }}>
          <Star className="w-3.5 h-3.5" />
          Choose your plan — cancel any time
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
          Simple, transparent pricing.
        </h1>
        <p className="text-slate-400 mt-3 text-base max-w-lg mx-auto">
          Your AI crew pays for itself in the first week. No setup fees, no contracts.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-lg mx-auto px-4 mb-4">
          <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/30 bg-red-500/10">
            {error}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="flex-1 flex items-start justify-center px-4 pb-16">
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-2xl p-6 space-y-5 border-2 ${plan.accent} transition-all`}
              style={{
                background: plan.highlight
                  ? "rgba(255,107,0,0.06)"
                  : "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
                boxShadow: plan.highlight
                  ? "0 0 40px rgba(255,107,0,0.18), 0 4px 24px rgba(0,0,0,0.4)"
                  : "0 4px 24px rgba(0,0,0,0.3)",
              }}
            >
              {/* "Most Popular" badge */}
              {plan.tag && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg, #FF6B00, #FF9500)" }}
                >
                  {plan.tag}
                </div>
              )}

              {/* Plan name & price */}
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{plan.name}</p>
                <div className="flex items-end gap-1 mt-2">
                  <span className="text-4xl font-extrabold text-white">${plan.price}</span>
                  <span className="text-slate-400 text-sm mb-1.5">/mo</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">per month · billed monthly · cancel any time</p>
              </div>

              {/* Feature list */}
              <ul className="space-y-2.5">
                {plan.features.map((feat, i) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm">
                    {i === 0 && plan.highlight ? (
                      <span className="text-[#FF9500] font-semibold w-full">{feat}</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-300">{feat}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => selectPlan(plan.key)}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-60"
                style={
                  plan.highlight
                    ? {
                        background: "linear-gradient(135deg, #FF6B00, #FF9500)",
                        boxShadow: loading ? "none" : "0 0 24px rgba(255,107,0,0.45)",
                      }
                    : {
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }
                }
              >
                {loading === plan.key ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Setting up…
                  </>
                ) : (
                  <>
                    {plan.cta}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Guarantee row */}
      <div className="border-t border-white/[0.07] px-4 py-6">
        <div className="flex flex-wrap items-center justify-center gap-6 max-w-2xl mx-auto">
          {[
            { icon: "🔒", text: "No credit card tricks — cancel in 1 click" },
            { icon: "⚡", text: "Your crew goes live in under 5 minutes" },
            { icon: "💰", text: "Pays for itself in the first week or we refund" },
          ].map((g) => (
            <div key={g.text} className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-base">{g.icon}</span>
              {g.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
