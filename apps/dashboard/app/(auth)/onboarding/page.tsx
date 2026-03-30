// @ts-nocheck
/**
 * TitanCrew · Onboarding Wizard
 * 7-step setup flow: business info → trade type → techs → integrations → crew deploy.
 * Fast to complete (<5 min). At step 7, the Onboarder Agent fires and deploys the crew.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Wrench, Users, Calendar, FileText,
  MessageSquare, Rocket, Check, ChevronRight, ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Step definitions ─────────────────────────────────────

const STEPS = [
  { id: 1, label: "Your Business",    icon: Building2,    key: "business" },
  { id: 2, label: "Trade Type",       icon: Wrench,       key: "trade" },
  { id: 3, label: "Your Team",        icon: Users,        key: "team" },
  { id: 4, label: "Calendar",         icon: Calendar,     key: "calendar" },
  { id: 5, label: "QuickBooks",       icon: FileText,     key: "quickbooks" },
  { id: 6, label: "Notifications",    icon: MessageSquare,key: "notifications" },
  { id: 7, label: "Deploy Crew",      icon: Rocket,       key: "deploy" },
];

const TRADE_OPTIONS = [
  { value: "plumbing",    label: "Plumbing",    emoji: "🔧" },
  { value: "electrical",  label: "Electrical",  emoji: "⚡" },
  { value: "hvac",        label: "HVAC",        emoji: "❄️" },
  { value: "general",     label: "General",     emoji: "🏗️" },
  { value: "roofing",     label: "Roofing",     emoji: "🏠" },
  { value: "other",       label: "Other",       emoji: "🔨" },
];

const STATE_OPTIONS = ["TX", "FL", "CA", "AZ", "NY", "IL", "WA", "CO", "GA", "NC", "OH", "PA", "MI", "NV", "Other"];

// ─── Main component ───────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);

  const [formData, setFormData] = useState({
    business_name: "",
    owner_name: "",
    phone: "",
    city: "",
    state: "TX",
    trade_type: "plumbing",
    tech_count: 1,
    avg_job_value: 350,
    has_google_calendar: false,
    has_quickbooks: false,
    sms_notifications: true,
    email_notifications: true,
    daily_summary: true,
  });

  const update = (key: string, value: unknown) =>
    setFormData((f) => ({ ...f, [key]: value }));

  const canProceed = (): boolean => {
    if (step === 1) return !!(formData.business_name && formData.owner_name && formData.phone);
    if (step === 2) return !!formData.trade_type;
    return true;
  };

  const handleNext = async () => {
    if (step < 7) {
      // Save progress to Supabase (upsert creates row if missing)
      // Only include columns that exist in the accounts table
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("accounts") as any).upsert({
          owner_user_id: user.id,
          email: user.email ?? "",
          owner_name: formData.owner_name || user.email ?? "",
          business_name: formData.business_name || "My Business",
          phone: formData.phone || null,
          city: formData.city || null,
          state: formData.state || null,
          trade_type: formData.trade_type,
          tech_count: formData.tech_count,
          avg_job_value: formData.avg_job_value,
          onboard_step: step,
        }, { onConflict: "owner_user_id" });
      }
      setStep((s) => s + 1);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDeploying(false); return; }

      // Finalize account setup — only valid DB columns, no formData spread
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upsertedAccount } = await (supabase.from("accounts") as any)
        .upsert({
          owner_user_id: user.id,
          email: user.email ?? "",
          owner_name: formData.owner_name || user.email ?? "",
          business_name: formData.business_name || "My Business",
          phone: formData.phone || null,
          city: formData.city || null,
          state: formData.state || null,
          trade_type: formData.trade_type,
          tech_count: formData.tech_count,
          avg_job_value: formData.avg_job_value,
          onboard_step: 7,
          crew_deployed_at: new Date().toISOString(),
          notification_prefs: {
            sms: formData.sms_notifications,
            email: formData.email_notifications,
            daily_summary: formData.daily_summary,
          },
        }, { onConflict: "owner_user_id" })
        .select("id")
        .single() as { data: { id: string } | null };

      if (!upsertedAccount) { setDeploying(false); return; }

      // Fire-and-forget — don't block completion on agent trigger
      fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: upsertedAccount.id,
          event: "onboard_new_customer",
          payload: {
            business_name: formData.business_name,
            trade_type: formData.trade_type,
            tech_count: formData.tech_count,
          },
        }),
      }).catch(() => {});

      // Show completion animation for 2.5 seconds then redirect
      setDeployDone(true);
      setTimeout(() => router.push("/"), 2500);
    } catch (err) {
      console.error("Deploy error:", err);
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFF] flex flex-col">
      {/* Top bar */}
      <div className="bg-[#1A2744] px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-white font-extrabold text-lg">Titan</span>
            <span className="text-[#FF6B00] font-extrabold text-lg">Crew</span>
          </div>
          <span className="text-slate-400 text-sm">Setup — Step {step} of 7</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-200">
        <div
          className="h-full bg-[#FF6B00] transition-all duration-500"
          style={{ width: `${(step / 7) * 100}%` }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-lg">
          {/* Step pills */}
          <div className="flex items-center gap-1.5 flex-wrap mb-8">
            {STEPS.map((s) => (
              <div key={s.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                ${s.id < step ? "bg-emerald-100 text-emerald-700" :
                  s.id === step ? "bg-[#1A2744] text-white" :
                  "bg-slate-100 text-slate-400"}`}>
                {s.id < step ? <Check className="w-3 h-3" /> : null}
                {s.label}
              </div>
            ))}
          </div>

          {/* Step panels */}
          {step === 1 && (
            <StepCard title="Tell us about your business" subtitle="This helps TitanCrew personalize everything for you.">
              <Field label="Business Name *" placeholder="Smith's Plumbing & Drain">
                <input className={inputCls} value={formData.business_name} onChange={(e) => update("business_name", e.target.value)} placeholder="Smith's Plumbing & Drain" />
              </Field>
              <Field label="Your Name *" placeholder="Mike Smith">
                <input className={inputCls} value={formData.owner_name} onChange={(e) => update("owner_name", e.target.value)} placeholder="Mike Smith" />
              </Field>
              <Field label="Your Cell Phone * (AI crew texts you here)">
                <input className={inputCls} type="tel" value={formData.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 (555) 000-1234" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input className={inputCls} value={formData.city} onChange={(e) => update("city", e.target.value)} placeholder="Austin" />
                </Field>
                <Field label="State">
                  <select className={inputCls} value={formData.state} onChange={(e) => update("state", e.target.value)}>
                    {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            </StepCard>
          )}

          {step === 2 && (
            <StepCard title="What's your trade?" subtitle="TitanCrew specializes in how your industry operates.">
              <div className="grid grid-cols-3 gap-3">
                {TRADE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update("trade_type", opt.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                      ${formData.trade_type === opt.value
                        ? "border-[#FF6B00] bg-orange-50"
                        : "border-slate-200 hover:border-slate-300"
                      }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-xs font-semibold text-[#1A2744]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </StepCard>
          )}

          {step === 3 && (
            <StepCard title="How big is your team?" subtitle="Your crew will be sized to match your business.">
              <Field label="How many active technicians?">
                <div className="flex items-center gap-4">
                  <button onClick={() => update("tech_count", Math.max(1, formData.tech_count - 1))} className="w-10 h-10 rounded-full border border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-50">-</button>
                  <span className="text-2xl font-extrabold text-[#1A2744] w-12 text-center">{formData.tech_count}</span>
                  <button onClick={() => update("tech_count", formData.tech_count + 1)} className="w-10 h-10 rounded-full border border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
                </div>
              </Field>
              <Field label="Average job value ($)">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">$</span>
                  <input type="number" className={inputCls} value={formData.avg_job_value} onChange={(e) => update("avg_job_value", parseInt(e.target.value) || 0)} />
                </div>
              </Field>
            </StepCard>
          )}

          {step === 4 && (
            <StepCard title="Connect Google Calendar" subtitle="The Scheduler Agent reads and writes to your techs' calendars. Optional — you can add this later.">
              {formData.has_google_calendar ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Google Calendar connected</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      window.location.href = `/api/oauth/google?redirect=/onboarding?step=4`;
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold text-[#1A2744] hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Connect Google Calendar
                  </button>
                  <button onClick={() => setStep((s) => s + 1)} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2">
                    Skip for now — connect later in Settings
                  </button>
                </div>
              )}
            </StepCard>
          )}

          {step === 5 && (
            <StepCard title="Connect QuickBooks" subtitle="The Finance Agent auto-creates invoices and syncs payments. Optional.">
              <div className="space-y-3">
                <button
                  onClick={() => {
                    window.location.href = `/api/oauth/quickbooks?redirect=/onboarding?step=5`;
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#2CA01C] rounded-xl text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Connect QuickBooks Online
                </button>
                <button onClick={() => setStep((s) => s + 1)} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2">
                  Skip — connect later in Settings
                </button>
              </div>
            </StepCard>
          )}

          {step === 6 && (
            <StepCard title="How should we notify you?" subtitle="Your crew sends you updates via SMS. Choose what's important.">
              {[
                { key: "sms_notifications", label: "SMS alerts", sub: "HIL approvals, urgent items, errors" },
                { key: "daily_summary", label: "6am daily briefing", sub: "Revenue, jobs, top opportunities" },
                { key: "email_notifications", label: "Email digest", sub: "Weekly performance report" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-[#1A2744]">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub}</p>
                  </div>
                  <button
                    onClick={() => update(item.key, !(formData as Record<string, unknown>)[item.key])}
                    className={`relative w-10 rounded-full transition-colors flex-shrink-0`}
                    style={{
                      height: "22px",
                      backgroundColor: (formData as Record<string, unknown>)[item.key] ? "#FF6B00" : "#e2e8f0",
                    }}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                      ${(formData as Record<string, unknown>)[item.key] ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                </div>
              ))}
            </StepCard>
          )}

          {step === 7 && (
            <StepCard
              title={deployDone ? "🎉 Your crew is deployed!" : "Ready to deploy your AI crew?"}
              subtitle={deployDone ? "Redirecting to your dashboard..." : "Your 6 AI agents are ready. This takes about 30 seconds."}
            >
              {!deployDone ? (
                <div className="space-y-4">
                  <div className="bg-[#1A2744] rounded-xl p-4 text-white space-y-2">
                    {["🧠 Foreman AI — daily briefing & oversight", "📅 Scheduler — fills your calendar 24/7", "💬 Customer Comm — confirmations & reviews", "💰 Finance — auto-invoicing & follow-ups", "🔩 Parts — auto-reorder before you run out"].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm">
                        <Check className="w-3.5 h-3.5 text-[#FF6B00] flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#FF6B00] text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-70 transition-colors text-base"
                  >
                    {deploying ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deploying your crew...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5" />
                        Launch TitanCrew
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Taking you to your dashboard...</p>
                </div>
              )}
            </StepCard>
          )}

          {/* Navigation */}
          {step < 7 && (
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1A2744] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1A2744] text-white text-sm font-semibold rounded-xl hover:bg-[#263760] disabled:opacity-40 transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-[#1A2744]">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, placeholder }: { label: string; children: React.ReactNode; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00] transition-colors";
