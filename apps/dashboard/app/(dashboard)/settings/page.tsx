// @ts-nocheck
/**
 * TitanCrew · Settings Page
 * Account info, integrations status, plan, and preferences.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Settings, Building2, Phone, Mail, Calendar, CreditCard,
  CheckCircle2, XCircle, ExternalLink, Shield, Bell, Zap
} from "lucide-react";

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

  const planConfig = {
    pro: { label: "Pro", price: "$799/mo", color: "text-[#FF6B00] bg-orange-50 border-orange-200" },
    basic: { label: "Basic", price: "$399/mo", color: "text-blue-700 bg-blue-50 border-blue-200" },
  };
  const plan = planConfig[account.plan] ?? planConfig.basic;

  const integrations = [
    {
      name: "Google Calendar",
      description: "Scheduler AI books jobs directly to your calendar",
      connected: !!account.google_calendar_token,
      icon: Calendar,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/onboarding",
    },
    {
      name: "QuickBooks Online",
      description: "Finance AI sends invoices and syncs payments",
      connected: !!account.qbo_access_token,
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50",
      href: "/onboarding",
    },
    {
      name: "Meta Business Suite",
      description: "Growth AI posts to your Facebook page",
      connected: !!account.meta_access_token,
      icon: Zap,
      color: "text-blue-700",
      bg: "bg-blue-50",
      href: "/onboarding",
      detail: account.meta_page_name,
    },
    {
      name: "Twilio (SMS / Calls)",
      description: "Customer AI sends confirmations and follow-ups",
      connected: !!account.twilio_phone_number,
      icon: Phone,
      color: "text-[#FF6B00]",
      bg: "bg-orange-50",
      href: "/onboarding",
      detail: account.twilio_phone_number,
    },
  ];

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const connectedCount = integrations.filter(i => i.connected).length;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A2744]">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Account, integrations, and preferences</p>
      </div>

      {/* Business profile */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-[#1A2744]" />
          <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Business Profile</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Business Name</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1">{account.business_name || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Owner</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1">{account.owner_name || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Trade Type</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1 capitalize">{account.trade_type || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Phone</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1">{account.phone || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Email</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1">{user.email || "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Member Since</label>
            <p className="text-sm font-semibold text-[#1A2744] mt-1">{account.created_at ? formatDate(account.created_at) : "—"}</p>
          </div>
        </div>
        <a
          href="/onboarding"
          className="inline-flex items-center gap-2 mt-2 text-xs font-semibold text-[#FF6B00] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Update business info in setup wizard
        </a>
      </div>

      {/* Plan */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[#1A2744]" />
          <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Plan & Billing</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${plan.color}`}>
              <Zap className="w-3.5 h-3.5" />
              TitanCrew {plan.label}
            </span>
            <p className="text-xs text-slate-400 mt-2">{plan.price} · Renews monthly</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Crew deployed</p>
            <p className="text-sm font-semibold text-[#1A2744]">
              {account.crew_deployed_at ? formatDate(account.crew_deployed_at) : "Not yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#1A2744]" />
            <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">Integrations</h2>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            {connectedCount}/{integrations.length} connected
          </span>
        </div>
        <div className="space-y-3">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex items-center gap-4 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors"
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
                {integration.connected ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <a
                    href={integration.href}
                    className="flex items-center gap-1 text-xs text-[#FF6B00] font-semibold bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200 hover:bg-orange-100 transition-colors flex-shrink-0"
                  >
                    Connect →
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
          Configure how your AI crew alerts you — SMS, email, or in-app. Full notification settings coming in the next release.
        </p>
      </div>
    </div>
  );
}
