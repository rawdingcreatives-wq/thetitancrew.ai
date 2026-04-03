// @ts-nocheck
"use client";

/**
 * TitanCrew · Forgot Password Page
 * Sends a password reset email via Supabase.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Zap, Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?redirect=/settings`,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFF] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-[#1A2744] font-extrabold text-2xl tracking-tight">Titan</span>
            <span className="text-[#FF6B00] font-extrabold text-2xl tracking-tight">Crew</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-[#1A2744] mb-2">Check your email</h1>
              <p className="text-slate-500 text-sm mb-6">
                We sent a password reset link to <strong className="text-slate-700">{email}</strong>.
                Click the link in the email to reset your password.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-[#FF6B00] font-medium hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-[#1A2744] mb-1">Reset your password</h1>
              <p className="text-slate-500 text-sm mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourbusiness.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] transition-colors text-sm"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#FF6B00] hover:bg-[#E55F00] disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-[#FF6B00]"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
