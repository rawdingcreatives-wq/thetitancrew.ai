// @ts-nocheck
/**
 * TitanCrew — Billing Success Page
 *
 * Route: /billing/success?session_id=...&plan=...
 *
 * Stripe redirects here after a successful checkout.
 * We update the account plan in Supabase (belt-and-suspenders; the
 * Stripe webhook at /api/webhooks/stripe also handles this), then
 * redirect the user to onboarding to set up their crew.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Check, Zap, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function BillingSuccessContent() {
  const router       = useRouter();
  const params       = useSearchParams();
  const sessionId    = params.get("session_id");
  const plan         = params.get("plan") ?? "basic";
  const supabase     = createClient();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }

        // Update plan in Supabase (webhook will also do this, but belt-and-suspenders)
        await supabase
          .from("accounts")
          .update({ plan })
          .eq("owner_user_id", user.id);

        setStatus("ready");

        // Auto-redirect to onboarding after 3s
        setTimeout(() => router.replace("/onboarding"), 3000);
      } catch {
        setStatus("error");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planLabel = plan === "pro" ? "Pro" : plan === "elite" ? "Elite" : "Basic";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#0D1626] px-4"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 60%)",
      }}
    >
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.4)",
            boxShadow: "0 0 40px rgba(16,185,129,0.2)",
          }}
        >
          {status === "loading" ? (
            <span className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          ) : (
            <Check className="w-10 h-10 text-emerald-400" />
          )}
        </div>

        {status !== "error" ? (
          <>
            <div>
              <p className="text-2xl font-extrabold text-white">
                Welcome to TitanCrew {planLabel}! 🎉
              </p>
              <p className="text-slate-400 mt-2">
                Your subscription is active. Let's set up your AI crew — it only takes 5 minutes.
              </p>
            </div>

            <div
              className="rounded-xl px-5 py-4 text-left space-y-2"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">What's next</p>
              {["Tell us about your business (2 min)", "Connect Google Calendar & QuickBooks", "Deploy your 6 AI agents"].map((s, i) => (
                <div key={s} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-[#FF6B00] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {s}
                </div>
              ))}
            </div>

            <button
              onClick={() => router.replace("/onboarding")}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #FF6B00, #FF9500)",
                boxShadow: "0 0 24px rgba(255,107,0,0.45)",
              }}
            >
              <Zap className="w-5 h-5" />
              Set Up Your Crew
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-xs text-slate-600">Redirecting automatically in 3 seconds…</p>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-white font-bold">Something went wrong setting up your account.</p>
            <p className="text-slate-400 text-sm">Your payment was processed but we couldn't update your account. Please contact support at support@thetitancrew.ai</p>
            <button
              onClick={() => router.replace("/onboarding")}
              className="w-full py-3 rounded-xl font-bold text-white bg-[#FF6B00]"
            >
              Continue to Setup →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense>
      <BillingSuccessContent />
    </Suspense>
  );
}
