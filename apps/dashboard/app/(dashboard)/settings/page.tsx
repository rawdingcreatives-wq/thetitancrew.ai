// @ts-nocheck
/**
 * TitanCrew Â· Settings Page
 * Account info, integrations status, plan & billing, notifications.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Settings, Building2, Phone, Mail, Calendar, CreditCard,
  CheckCircle2, XCircle, ExternalLink, Shield, Bell, Zap,
  ArrowUpRight, Lock
} from "lucide-react";
import ManageBillingButton from "@/components/billing/ManageBillingButton";
import ProfileEditForm from "@/components/settings/ProfileEditForm";

// âââ Trade label map ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const TRADE_LABELS: Record<string, string> = {
  plumbing:     "Plumbing",
  electrical:   "Electrical",
  hvac:         "HVAC",
  snow_plow:    "Snow Plow",
  junk_removal: "Junk Removal",
  general:      "General Contractor",
  roofing:      "Roofing",
  other:        "Other",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select(`
      id, business_name, owner_name, phone, trade_type, plan,
      google_calendar_token, qbo_access_token, meta_access_token,
      twilio_phone_number, crew_deployed_at, onboard_step,
      meta_page_name, created_at
    `)
    .eq("owner_user_id", user.id)
    .single();
  if (!account) redirect("/login");

  const planConfig: Record<string, { label: string; price: string; color: string; isBasic: boolean }> = {
    pro:   { label: "Pro",   price: "$799/mo",  color: "text-[#FF6B00] bg-orange-50 border-orange-200",  isBasic: false },
    basic: { label: "Basic", price: "$399/mo",  color: "text-blue-700 bg-blue-50 border-blue-200",       isBasic: true  },
  };
  const plan = planConfig[account.plan as string] ?? planConfig.basic;

  const tradeLabel = TRADE_LABELS[account.trade_type as string] ?? (account.trade_type ?? "â");

  const integrations = [
    {
      name: "Google Calendar",
      description: "Scheduler AI books jobs directly to your calendar",
      connected: !!account.google_calendar_token,
      icon: Calendar,
      color: "text-blue-600",
      bg: "bg-blue-50",
      connectHref: "/api/integrations/google-calendar?action=start&returnTo=/settings",
    },
    {
      name: "QuickBooks Online",
      description: "Finance AI sends invoices and syncs payments",
      connected: !!account.qbo_access_token,
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50",
      connectHref: "/api/integrations/quickbooks?action=start&returnTo=/settings",
    },
    {
      name: "Twilio (SMS / Calls)",
      description: "Customer AI sends confirmations and follow-ups",
      connected: !!account.twilio_phone_number,
      icon: Phone,
      color: "text-[#FF6B00]",
      bg: "bg-orange-50",
      connectHref: "/onboarding",
      detail: account.twilio_phone_number,
    },
    {
      name: "Social Media",
      description: "Growth AI auto-posts deals, reviews & promotions (coming April 2026)",
      connected: false,
      comingSoon: true,
      icon: Zap,
      color: "text-purple-600",
      bg: "bg-purple-50",
      connectHref: "#",
    },
  ];

  const connectedCount = integrations.filter(i => i.connected).length;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A2744]">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Account, integrations, and preferences</p>
      </div>

      <ProfileEditForm account={account} userEmail={user.email ?? ''} />

      {/* Plan & Billing */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[#1A2744]" />
          <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Plan & Billing</h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${plan.color}`}>
              <Zap className="w-3.5 h-3.5" />
              TitanCrew {plan.label}
            </span>
            <p className="text-xs text-slate-400">{plan.price} Â· Renews monthly</p>
            <p className="text-xs text-slate-500">
              Crew deployed: {account.crew_deployed_at ? formatDate(account.crew_deployed_at) : "Not yet"}
            </p>
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0">
            {plan.isBasic && (
              <a
                href="/pricing"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #FF6B00, #FF9500)", boxShadow: "0 0 16px rgba(255,107,0,0.35)" }}
              >
                <ArrowUpRight className="w-4 h-4" />
                Upgrade to Pro
              </a>
            )}
            <ManageBillingButton />
          </div>
        </div>

        {/* Basic vs Pro feature comparison (shown for Basic users) */}
        {plan.isBasic && (
          <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
            <p className="text-xs font-bold text-[#FF6B00] uppercase tracking-wide mb-3">Pro unlocks:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                "Tech Dispatch AI (route optimization)",
                "Multi-location support",
                "Priority onboarding call",
                "Custom AI agent workflows",
                "API access for integrations",
                "Advanced analytics & reporting",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-slate-600">
                  <Lock className="w-3 h-3 text-orange-400 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <a
              href="/pricing"
              className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-[#FF6B00] hover:underline"
            >
              See full comparison â <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#1A2744]" />
            <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Integrations</h2>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            {connectedCount}/{integrations.filter(i => !i.comingSoon).length} connected
          </span>
        </div>
        <div className="space-y-3">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                  integration.comingSoon ? "border-slate-100 opacity-60" : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg ${integration.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${integration.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A2744]">{integration.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {integration.connected && integration.detail
                      ? integration.detail
                      : integration.description}
                  </p>
                </div>
                {integration.comingSoon ? (
                  <span className="flex items-center gap-1 text-xs text-slate-400 font-semibold bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 flex-shrink-0">
                    Coming Soon
                  </span>
                ) : integration.connected ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <a
                    href={integration.connectHref}
                    className="flex items-center gap-1 text-xs text-[#FF6B00] font-semibold bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200 hover:bg-orange-100 transition-colors flex-shrink-0"
                  >
                    Connect â
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notifications placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-[#1A2744]" />
          <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Notifications</h2>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">Coming Soon</span>
        </div>
        <p className="text-sm text-slate-500">
          Configure how your AI crew alerts you â SMS, email, or in-app. Full notification settings available in the next release.
        </p>
      </div>
    </div>
  );
}
