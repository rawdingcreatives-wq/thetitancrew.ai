"use client";

/**
 * TitanCrew · Check Your Email Page
 *
 * Shown after a user signs up. Tells them to check their inbox
 * for a confirmation email before they can proceed.
 */

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Mail, RefreshCw } from "lucide-react";
import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CheckEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F1B2D] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckEmailContent />
    </Suspense>
  );
}

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    const supabase = createClient();
    await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/onboarding`,
      },
    });
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="min-h-screen bg-[#0F1B2D] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-white font-extrabold text-2xl tracking-tight">Titan</span>
            <span className="text-[#FF6B00] font-extrabold text-2xl tracking-tight">Crew</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#1A2744] rounded-2xl border border-white/10 p-8 shadow-2xl">
          {/* Animated mail icon */}
          <div className="mx-auto w-20 h-20 bg-[#FF6B00]/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <Mail className="w-10 h-10 text-[#FF6B00]" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-2">
            We sent a confirmation link to
          </p>
          {email && (
            <p className="text-[#FF6B00] font-semibold text-base mb-6">{email}</p>
          )}
          {!email && (
            <p className="text-slate-300 font-medium text-sm mb-6">your email address</p>
          )}

          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Click the link in the email to verify your account and start setting up your AI crew.
            It may take a minute to arrive — check your spam folder if you don&apos;t see it.
          </p>

          {/* Steps */}
          <div className="bg-white/5 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              What happens next
            </p>
            <div className="space-y-3">
              {[
                { step: "1", text: "Open the email from TitanCrew" },
                { step: "2", text: 'Click "Confirm your email"' },
                { step: "3", text: "Set up your AI crew in 5 minutes" },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FF6B00] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white">{item.step}</span>
                  </div>
                  <span className="text-sm text-slate-300">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Resend button */}
          {email && (
            <button
              onClick={handleResend}
              disabled={resending || resent}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
              {resent ? "Email sent!" : resending ? "Sending..." : "Resend confirmation email"}
            </button>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-6 space-y-2">
          <p className="text-xs text-slate-500">
            Wrong email?{" "}
            <Link href="/signup" className="text-[#FF6B00] hover:underline">
              Sign up again
            </Link>
          </p>
          <p className="text-xs text-slate-500">
            Already confirmed?{" "}
            <Link href="/login" className="text-[#FF6B00] hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
