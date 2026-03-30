// @ts-nocheck
/**
 * TitanCrew · Onboarding Wizard v2
 *
 * 9-step Mission Control setup flow:
 *   1  Your Business  — name, owner, phone, city, state
 *   2  Trade Type     — emoji grid selector
 *   3  Your Team      — tech count + avg job value
 *   4  ROI Preview    — interactive savings calculator
 *   5  Calendar       — Google Calendar OAuth (optional)
 *   6  QuickBooks     — QuickBooks Online OAuth (optional)
 *   7  Meta / FB      — Facebook Business Manager OAuth (optional)
 *   8  Phone & Comms  — Twilio number + notification prefs
 *   9  Deploy Crew    — launch + agent trigger
 *
 * Dark glassmorphic design: Titan Navy bg, Safety Orange accents,
 * frosted glass cards, animated progress bar.
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, Wrench, Users, TrendingUp, Calendar, FileText,
  Phone, Rocket, Check, ChevronRight, ChevronLeft, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROICalculator } from "@/components/onboarding/ROICalculator";

// ─── Constants ───────────────────────────────────────────────

const TOTAL = 9;

const STEPS = [
  { id: 1, label: "Your Business", icon: Building2  },
  { id: 2, label: "Trade Type",    icon: Wrench     },
  { id: 3, label: "Your Team",     icon: Users      },
  { id: 4, label: "ROI Preview",   icon: TrendingUp },
  { id: 5, label: "Calendar",      icon: Calendar   },
  { id: 6, label: "QuickBooks",    icon: FileText   },
  { id: 7, label: "Social Media",  icon: null       }, // Coming soon — placeholder step
  { id: 8, label: "Phone",         icon: Phone      },
  { id: 9, label: "Deploy Crew",   icon: Rocket     },
];

const TRADE_OPTIONS = [
  { value: "plumbing",      label: "Plumbing",      emoji: "🔧" },
  { value: "electrical",    label: "Electrical",    emoji: "⚡" },
  { value: "hvac",          label: "HVAC",          emoji: "❄️" },
  { value: "snow_plow",     label: "Snow Plow",     emoji: "🌨️" },
  { value: "junk_removal",  label: "Junk Removal",  emoji: "🚛" },
  { value: "general",       label: "General",       emoji: "🏗️" },
  { value: "roofing",       label: "Roofing",       emoji: "🏠" },
  { value: "other",         label: "Other",         emoji: "🔨" },
];

const US_STATES = [
  "TX","FL","CA","AZ","NY","IL","WA","CO","GA","NC","OH","PA","MI","NV","Other"
];

// Dark glassmorphic input style
const INPUT =
  "w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white " +
  "placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50 " +
  "focus:border-[#FF6B00] transition-colors";

// ─── Inner component (needs useSearchParams) ─────────────────

function OnboardingContent() {
  const router   = useRouter();
  const params   = useSearchParams();
  const supabase = createClient();

  const [step,       setStep]       = useState(1);
  const [deploying,  setDeploying]  = useState(false);
  const [deployDone, setDeployDone] = useState(false);
  const [accountId,  setAccountId]  = useState<string | null>(null);

  const [calConn,  setCalConn]  = useState(false);
  const [qboConn,  setQboConn]  = useState(false);
  const [metaConn, setMetaConn] = useState(false);

  const [form, setForm] = useState({
    business_name:     "",
    owner_name:        "",
    phone:             "",
    city:              "",
    state:             "TX",
    trade_type:        "plumbing",
    tech_count:        1,
    avg_job_value:     350,
    roi_technicians:   1,
    roi_jobs_per_week: 10,
    roi_avg_job_value: 350,
    roi_admin_hours:   10,
    twilio_phone:      "",
    sms_alerts:        true,
    daily_briefing:    true,
    email_digest:      true,
  });

  const upd = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  // On mount: check OAuth callback params + load saved account
  useEffect(() => {
    if (params.get("meta")     === "connected") setMetaConn(true);
    if (params.get("calendar") === "connected") setCalConn(true);
    if (params.get("qbo")      === "connected") setQboConn(true);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: acc } = await (supabase.from("accounts") as any)
        .select("*")
        .eq("owner_user_id", user.id)
        .single();

      if (!acc) return;

      setAccountId(acc.id);
      setForm((f) => ({
        ...f,
        business_name:     acc.business_name      ?? "",
        owner_name:        acc.owner_name         ?? "",
        phone:             acc.phone              ?? "",
        city:              acc.city               ?? "",
        state:             acc.state              ?? "TX",
        trade_type:        acc.trade_type         ?? "plumbing",
        tech_count:        acc.tech_count         ?? 1,
        avg_job_value:     acc.avg_job_value       ?? 350,
        roi_technicians:   acc.roi_technicians     ?? acc.tech_count ?? 1,
        roi_jobs_per_week: acc.roi_jobs_per_week   ?? Math.max(5, (acc.tech_count ?? 1) * 8),
        roi_avg_job_value: acc.roi_avg_job_value   ?? acc.avg_job_value ?? 350,
        roi_admin_hours:   acc.roi_admin_hours     ?? 10,
      }));

      if (acc.google_calendar_token) setCalConn(true);
      if (acc.qbo_access_token)      setQboConn(true);
      if (acc.meta_access_token)     setMetaConn(true);

      const saved = acc.onboard_step ?? 1;
      if (saved > 1 && saved < TOTAL) setStep(saved);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canProceed = (): boolean => {
    if (step === 1) return !!(form.business_name && form.owner_name && form.phone);
    if (step === 2) return !!form.trade_type;
    return true;
  };

  const saveProgress = async (s: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await (supabase.from("accounts") as any)
      .upsert(
        {
          owner_user_id:     user.id,
          email:             user.email ?? "",
          owner_name:        form.owner_name    || (user.email ?? ""),
          business_name:     form.business_name || "My Business",
          phone:             form.phone         || null,
          city:              form.city          || null,
          state:             form.state         || null,
          trade_type:        form.trade_type,
          tech_count:        form.tech_count,
          avg_job_value:     form.avg_job_value,
          roi_technicians:    form.roi_technicians,
          roi_jobs_per_week:  form.roi_jobs_per_week,
          roi_avg_job_value:  form.roi_avg_job_value,
          roi_admin_hours:    form.roi_admin_hours,
          twilio_phone_number: form.twilio_phone || null,
          onboard_step:       s,
        },
        { onConflict: "owner_user_id" }
      )
      .select("id")
      .single();

    if (data?.id) setAccountId(data.id);
  };

  const handleNext = async () => {
    await saveProgress(step);
    setStep((s) => Math.min(s + 1, TOTAL));
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDeploying(false); return; }

      const { data: acc } = await (supabase.from("accounts") as any)
        .upsert(
          {
            owner_user_id:     user.id,
            email:             user.email ?? "",
            owner_name:        form.owner_name    || (user.email ?? ""),
            business_name:     form.business_name || "My Business",
            phone:             form.phone         || null,
            city:              form.city          || null,
            state:             form.state         || null,
            trade_type:        form.trade_type,
            tech_count:        form.tech_count,
            avg_job_value:     form.avg_job_value,
            roi_technicians:   form.roi_technicians,
            roi_jobs_per_week: form.roi_jobs_per_week,
            roi_avg_job_value: form.roi_avg_job_value,
            roi_admin_hours:   form.roi_admin_hours,
            twilio_phone_number: form.twilio_phone || null,
            onboard_step:      TOTAL,
            crew_deployed_at:  new Date().toISOString(),
            notification_prefs: {
              sms:           form.sms_alerts,
              email:         form.email_digest,
              daily_summary: form.daily_briefing,
            },
          },
          { onConflict: "owner_user_id" }
        )
        .select("id")
        .single();

      if (!acc) { setDeploying(false); return; }

      fetch("/api/agents/trigger", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: acc.id,
          event:     "onboard_new_customer",
          payload: {
            business_name:  form.business_name,
            trade_type:     form.trade_type,
            tech_count:     form.tech_count,
            meta_connected: metaConn,
          },
        }),
      }).catch(() => {});

      setDeployDone(true);
      setTimeout(() => router.replace("/"), 2500);
    } catch (err) {
      console.error("Deploy error:", err);
      setDeploying(false);
    }
  };

  const startCalendar = () => {
    if (!accountId) return;
    // Pass returnTo so OAuth callback lands back in onboarding (not /integrations)
    window.location.href = `/api/integrations/google-calendar?action=start&returnTo=/onboarding`;
  };
  const startQBO = () => {
    if (!accountId) return;
    window.location.href = `/api/integrations/quickbooks?action=start&returnTo=/onboarding`;
  };
  // Meta / Facebook intentionally disabled — placeholder kept for future feature
  const startMeta = () => {
    alert("Social media integrations are coming soon. Skip this step for now.");
  };

  // ─────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col bg-[#0D1626]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 100% 55% at 50% -5%, rgba(255,107,0,0.14) 0%, transparent 62%)",
      }}
    >
      {/* Top bar */}
      <div className="px-5 py-4 border-b border-white/[0.07]">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#FF6B00] rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(255,107,0,0.5)]">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-lg tracking-tight">
              <span className="text-white">Titan</span>
              <span className="text-[#FF6B00]">Crew</span>
            </span>
          </div>
          <span className="text-slate-500 text-sm tabular-nums">
            Step {step} of {TOTAL}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF9500] transition-all duration-700 ease-out"
          style={{ width: `${(step / TOTAL) * 100}%` }}
        />
      </div>

      {/* Step pills */}
      <div className="px-4 pt-5 pb-0">
        <div className="flex items-center gap-1.5 flex-wrap max-w-2xl mx-auto">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const done = s.id < step;
            const curr = s.id === step;
            return (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
                  done
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                    : curr
                    ? "bg-[#FF6B00] text-white shadow-[0_0_14px_rgba(255,107,0,0.45)]"
                    : "bg-white/5 text-slate-600 border border-white/[0.07]"
                }`}
              >
                {done ? (
                  <Check className="w-3 h-3 flex-shrink-0" />
                ) : Icon ? (
                  <Icon className="w-3 h-3 flex-shrink-0" />
                ) : (
                  <span className="text-[10px]">📣</span>
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-4 pt-5 pb-12">
        <div className="w-full max-w-lg space-y-4">

          {/* ═══ STEP 1 ══════════════════════════════════════ */}
          {step === 1 && (
            <Card title="Tell us about your business" sub="Your AI crew will introduce themselves as part of your team.">
              <Field label="Business Name *">
                <input className={INPUT} value={form.business_name}
                  onChange={(e) => upd("business_name", e.target.value)}
                  placeholder="Smith's Plumbing & Drain" />
              </Field>
              <Field label="Your Name *">
                <input className={INPUT} value={form.owner_name}
                  onChange={(e) => upd("owner_name", e.target.value)}
                  placeholder="Mike Smith" />
              </Field>
              <Field label="Your Cell * (AI crew texts you here)">
                <input className={INPUT} type="tel" value={form.phone}
                  onChange={(e) => upd("phone", e.target.value)}
                  placeholder="+1 (555) 000-1234" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input className={INPUT} value={form.city}
                    onChange={(e) => upd("city", e.target.value)}
                    placeholder="Austin" />
                </Field>
                <Field label="State">
                  <select className={INPUT} value={form.state}
                    onChange={(e) => upd("state", e.target.value)}>
                    {US_STATES.map((s) => (
                      <option key={s} value={s} className="bg-[#1A2744] text-white">{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* ═══ STEP 2 ══════════════════════════════════════ */}
          {step === 2 && (
            <Card title="What's your trade?" sub="TitanCrew specializes in how your industry operates.">
              <div className="grid grid-cols-3 gap-3">
                {TRADE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => upd("trade_type", opt.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                      form.trade_type === opt.value
                        ? "border-[#FF6B00] bg-[#FF6B00]/10 shadow-[0_0_20px_rgba(255,107,0,0.2)]"
                        : "border-white/10 bg-white/5 hover:border-white/25"
                    }`}>
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-xs font-semibold text-white">{opt.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ═══ STEP 3 ══════════════════════════════════════ */}
          {step === 3 && (
            <Card title="How big is your team?" sub="Your AI crew will be sized to match your business volume.">
              <Field label="Active Technicians">
                <div className="flex items-center gap-5">
                  <button onClick={() => { const v = Math.max(1, form.tech_count - 1); upd("tech_count", v); upd("roi_technicians", v); }}
                    className="w-11 h-11 rounded-full border border-white/20 text-white text-xl font-bold hover:bg-white/10 transition-colors">−</button>
                  <span className="text-4xl font-extrabold text-white w-16 text-center tabular-nums">{form.tech_count}</span>
                  <button onClick={() => { const v = form.tech_count + 1; upd("tech_count", v); upd("roi_technicians", v); }}
                    className="w-11 h-11 rounded-full border border-white/20 text-white text-xl font-bold hover:bg-white/10 transition-colors">+</button>
                </div>
              </Field>
              <Field label="Average Job Value ($)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">$</span>
                  <input type="number" className={INPUT + " pl-7"} value={form.avg_job_value}
                    onChange={(e) => { const v = parseInt(e.target.value) || 0; upd("avg_job_value", v); upd("roi_avg_job_value", v); }} />
                </div>
              </Field>
            </Card>
          )}

          {/* ═══ STEP 4 — ROI Calculator ══════════════════════ */}
          {step === 4 && (
            <ROICalculator
              initialData={{
                technicians:   form.roi_technicians,
                jobsPerWeek:   form.roi_jobs_per_week,
                avgJobValue:   form.roi_avg_job_value,
                adminHours:    form.roi_admin_hours,
              }}
              onUpdate={(d) => {
                upd("roi_technicians",   d.technicians);
                upd("roi_jobs_per_week", d.jobsPerWeek);
                upd("roi_avg_job_value", d.avgJobValue);
                upd("roi_admin_hours",   d.adminHours);
              }}
              onContinue={handleNext}
            />
          )}

          {/* ═══ STEP 5 — Google Calendar ═════════════════════ */}
          {step === 5 && (
            <Card title="Connect Google Calendar" sub="Scheduler AI reads and writes to your techs' calendars for real-time booking.">
              {calConn ? (
                <ConnBadge label="Google Calendar connected" />
              ) : (
                <div className="space-y-3">
                  <button onClick={startCalendar} disabled={!accountId}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-white rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-lg">
                    <GoogleIcon />
                    Connect Google Calendar
                  </button>
                  <Benefits items={["Scheduler AI books jobs directly into your calendar","Real-time sync prevents double-bookings","Automated reminders sent to techs"]} />
                  <SkipBtn onClick={() => setStep((s) => s + 1)} />
                </div>
              )}
            </Card>
          )}

          {/* ═══ STEP 6 — QuickBooks ══════════════════════════ */}
          {step === 6 && (
            <Card title="Connect QuickBooks Online" sub="Finance AI auto-creates invoices, syncs payments, and chases late accounts.">
              {qboConn ? (
                <ConnBadge label="QuickBooks Online connected" />
              ) : (
                <div className="space-y-3">
                  <button onClick={startQBO} disabled={!accountId}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#2CA01C] hover:bg-green-700 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors">
                    Connect QuickBooks Online
                  </button>
                  <Benefits items={["Auto-generate invoices after every job","Sync payments and flag late accounts","Finance AI reports in your morning briefing"]} />
                  <SkipBtn onClick={() => setStep((s) => s + 1)} />
                </div>
              )}
            </Card>
          )}

          {/* ═══ STEP 7 — Social Media (Coming Soon) ════════ */}
          {step === 7 && (
            <Card title="Social Media Automation" sub="Growth AI will post deals, respond to leads, and share 5-star reviews automatically.">
              <div className="space-y-4">
                <div className="rounded-xl p-5 space-y-3"
                  style={{ background: "rgba(26,39,68,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.25)" }}>
                      📣
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Growth AI handles your social presence</p>
                      <p className="text-xs text-slate-400">Facebook · Instagram · Google Business</p>
                    </div>
                  </div>
                  <Benefits items={[
                    "Auto-post seasonal promotions & completed jobs",
                    "Respond to Facebook & Instagram DMs instantly",
                    "Share 5-star reviews across your pages",
                    "Run targeted local service ads automatically",
                  ]} />
                </div>

                <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(255,107,0,0.06)", border: "1px solid rgba(255,107,0,0.18)" }}>
                  <span className="text-lg">🚀</span>
                  <p className="text-xs text-[#FF9500]">
                    <span className="font-bold">Coming in April 2026 —</span> social media integrations will be available to connect from your Settings page after launch.
                  </p>
                </div>

                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                  style={{ background: "linear-gradient(135deg, #FF6B00, #FF9500)", boxShadow: "0 0 20px rgba(255,107,0,0.3)" }}>
                  Continue to Phone Setup →
                </button>
              </div>
            </Card>
          )}

          {/* ═══ STEP 8 — Phone & Comms ═══════════════════════ */}
          {step === 8 && (
            <Card title="Set up your AI phone line" sub="Your crew sends confirmations, reminders, and follow-ups via SMS.">
              <Field label="Business Phone for SMS">
                <input className={INPUT} type="tel" value={form.twilio_phone}
                  onChange={(e) => upd("twilio_phone", e.target.value)}
                  placeholder="+1 (555) 000-0000" />
              </Field>
              <p className="text-xs text-slate-500 -mt-2">
                Enter the number your AI crew uses for outbound SMS. Provision a Twilio number in Settings after setup.
              </p>

              <div className="border-t border-white/[0.07] pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notification Preferences</p>
                {([
                  { key: "sms_alerts",     label: "SMS alerts",          sub: "HIL approvals, urgent items" },
                  { key: "daily_briefing", label: "6 am daily briefing", sub: "Revenue, jobs, top opportunities" },
                  { key: "email_digest",   label: "Email digest",        sub: "Weekly performance report" },
                ] as const).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.sub}</p>
                    </div>
                    <button
                      onClick={() => upd(item.key, !(form as any)[item.key])}
                      role="switch"
                      aria-checked={(form as any)[item.key]}
                      className="relative flex-shrink-0 rounded-full transition-colors"
                      style={{ width: 40, height: 22, background: (form as any)[item.key] ? "#FF6B00" : "rgba(255,255,255,0.15)" }}
                    >
                      <span className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200"
                        style={{ transform: (form as any)[item.key] ? "translateX(20px)" : "translateX(2px)" }} />
                    </button>
                  </div>
                ))}
              </div>
              <SkipBtn onClick={handleNext} label="Skip — set up phone later in Settings" />
            </Card>
          )}

          {/* ═══ STEP 9 — Deploy Crew ═════════════════════════ */}
          {step === 9 && (
            <Card
              title={deployDone ? "🎉 Your crew is live!" : "Ready to deploy your AI crew?"}
              sub={deployDone ? "Taking you to Mission Control…" : "6 AI agents standing by. Takes about 30 seconds."}
            >
              {!deployDone ? (
                <div className="space-y-4">
                  <div className="rounded-xl p-4 space-y-3"
                    style={{ background: "rgba(26,39,68,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {[
                      { emoji: "🧠", name: "Foreman AI",   desc: "Daily briefing & oversight"    },
                      { emoji: "📅", name: "Scheduler AI", desc: "Fills your calendar 24/7"       },
                      { emoji: "💬", name: "Customer AI",  desc: "Confirmations & 5-star reviews" },
                      { emoji: "💰", name: "Finance AI",   desc: "Auto-invoicing & follow-ups"    },
                      { emoji: "🔩", name: "Parts AI",     desc: "Reorder before you run out"     },
                      { emoji: "📈", name: "Growth AI",    desc: "Marketing & lead generation"    },
                    ].map((a) => (
                      <div key={a.name} className="flex items-center gap-3">
                        <span className="text-lg">{a.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-white">{a.name}</span>
                          <span className="text-xs text-slate-400 ml-2">{a.desc}</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                      </div>
                    ))}
                  </div>

                  {metaConn && (
                    <div className="rounded-xl px-4 py-3 text-sm"
                      style={{ background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.2)" }}>
                      <span className="text-[#FF9500] font-semibold">✨ Bonus: </span>
                      <span className="text-slate-300">Growth AI will post a welcome message to your Facebook page right after launch.</span>
                    </div>
                  )}

                  <button onClick={handleDeploy} disabled={deploying}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-white text-base transition-all duration-300 disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #FF6B00, #FF9500)",
                      boxShadow:  deploying ? "none" : "0 0 35px rgba(255,107,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
                    }}>
                    {deploying ? (
                      <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deploying your crew…</>
                    ) : (
                      <><Rocket className="w-5 h-5" />Launch TitanCrew</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", boxShadow: "0 0 30px rgba(16,185,129,0.2)" }}>
                    <Check className="w-10 h-10 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-xl">Crew deployed!</p>
                    <p className="text-slate-400 text-sm mt-1">Taking you to Mission Control…</p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Navigation — hidden on ROI step (has its own CTA) */}
          {step < TOTAL && step !== 4 && (
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white disabled:opacity-25 transition-colors">
                <ChevronLeft className="w-4 h-4" />Back
              </button>

              <button onClick={handleNext} disabled={!canProceed()}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  canProceed()
                    ? "bg-[#FF6B00] text-white shadow-[0_0_16px_rgba(255,107,0,0.35)] hover:bg-[#E55A00]"
                    : "bg-white/[0.07] text-slate-500 border border-white/10 cursor-not-allowed"
                }`}>
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6 space-y-5 shadow-2xl"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <div>
        <h2 className="text-xl font-extrabold text-white leading-tight">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function ConnBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl"
      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)" }}>
        <Check className="w-4 h-4 text-emerald-400" />
      </div>
      <span className="text-sm font-semibold text-emerald-400">{label}</span>
    </div>
  );
}

function SkipBtn({ onClick, label = "Skip for now — connect later in Settings" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="w-full text-xs text-slate-600 hover:text-slate-400 py-1.5 transition-colors">
      {label}
    </button>
  );
}

function Benefits({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function FbIcon() {
  return (
    <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
