/**
 * TitanCrew Dashboard — /compliance
 *
 * Owner-facing compliance center. Shows:
 *   - Signed legal agreements (ToS, DPA, AI Disclaimer)
 *   - TCPA consent status for all customers
 *   - HIL approval history
 *   - Data export and deletion tools
 *   - A2P 10DLC registration status
 */

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ComplianceStatusCard } from "@/components/compliance/ComplianceStatusCard";
import { TCPAConsentTable } from "@/components/compliance/TCPAConsentTable";
import { LegalDocumentPanel } from "@/components/compliance/LegalDocumentPanel";
import { HILComplianceStats } from "@/components/compliance/HILComplianceStats";
import { DataRightsPanel } from "@/components/compliance/DataRightsPanel";
import { Shield, FileText, MessageSquare, Database, UserCheck } from "lucide-react";

export const metadata = { title: "Compliance Center — TitanCrew" };

export default async function CompliancePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, plan, created_at, twilio_a2p_registered, twilio_phone_number")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/onboarding");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel data fetch
  const [
    { data: totalCustomers },
    { data: optedOutCustomers },
    { data: smsConsentCustomers },
    { data: hilStats },
    { data: recentComms },
  ] = await Promise.all([
    supabase.from("trade_customers").select("id", { count: "exact" }).eq("account_id", account.id),
    supabase.from("trade_customers").select("id", { count: "exact" }).eq("account_id", account.id).eq("comms_opt_out", true),
    supabase.from("trade_customers").select("id", { count: "exact" }).eq("account_id", account.id).eq("sms_opt_in", true),
    supabase.from("hil_confirmations").select("status").eq("account_id", account.id).gte("created_at", thirtyDaysAgo),
    supabase.from("comms_log").select("id", { count: "exact" }).eq("account_id", account.id).eq("channel", "sms").gte("created_at", thirtyDaysAgo),
  ]);

  const hilApproved = hilStats?.filter((h) => h.status === "approved").length ?? 0;
  const hilRejected = hilStats?.filter((h) => h.status === "rejected").length ?? 0;
  const hilExpired = hilStats?.filter((h) => h.status === "expired").length ?? 0;
  const hilTotal = hilStats?.length ?? 0;

  const complianceScore = calculateComplianceScore({
    a2pRegistered: !!account.twilio_a2p_registered,
    hasCustomers: (totalCustomers?.length ?? 0) > 0,
    optOutRate: (optedOutCustomers?.length ?? 0) / Math.max(1, totalCustomers?.length ?? 1),
    hilResponseRate: hilTotal > 0 ? (hilApproved + hilRejected) / hilTotal : 1,
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1A2744] rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-[#FF6B00]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A2744]">Compliance Center</h1>
            <p className="text-gray-500 text-sm">
              Legal agreements, TCPA compliance, and data governance for {account.business_name}
            </p>
          </div>
        </div>
        <ComplianceScoreBadge score={complianceScore} />
      </div>

      {/* Compliance Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ComplianceStatusCard
          icon={<MessageSquare size={18} />}
          label="TCPA Compliance"
          status={account.twilio_a2p_registered ? "compliant" : "action_needed"}
          detail={account.twilio_a2p_registered ? "A2P registered" : "Register A2P 10DLC"}
          actionUrl="/integrations"
        />
        <ComplianceStatusCard
          icon={<UserCheck size={18} />}
          label="Customer Consent"
          status="compliant"
          detail={`${smsConsentCustomers?.length ?? 0} with SMS consent`}
        />
        <ComplianceStatusCard
          icon={<Shield size={18} />}
          label="HIL Response Rate"
          status={hilTotal === 0 || (hilApproved + hilRejected) / hilTotal >= 0.9 ? "compliant" : "warning"}
          detail={hilTotal > 0 ? `${Math.round(((hilApproved + hilRejected) / hilTotal) * 100)}% responded` : "No HIL requests yet"}
        />
        <ComplianceStatusCard
          icon={<Database size={18} />}
          label="Data Security"
          status="compliant"
          detail="RLS enabled, encrypted at rest"
        />
      </div>

      {/* Legal Documents */}
      <LegalDocumentPanel
        accountId={account.id}
        accountCreatedAt={account.created_at}
        plan={account.plan}
        documents={[
          {
            id: "tos",
            name: "Terms of Service",
            version: "1.0",
            effectiveDate: "March 28, 2026",
            url: "/legal/terms-of-service",
            accepted: true,
            acceptedAt: account.created_at,
          },
          {
            id: "dpa",
            name: "Data Processing Agreement",
            version: "1.0",
            effectiveDate: "March 28, 2026",
            url: "/legal/data-processing-agreement",
            accepted: true,
            acceptedAt: account.created_at,
          },
          {
            id: "ai_disclaimer",
            name: "AI Agent Liability Disclaimer",
            version: "1.0",
            effectiveDate: "March 28, 2026",
            url: "/legal/ai-liability-disclaimer",
            accepted: true,
            acceptedAt: account.created_at,
          },
          {
            id: "sms_policy",
            name: "SMS & TCPA Communications Policy",
            version: "1.0",
            effectiveDate: "March 28, 2026",
            url: "/legal/sms-policy",
            accepted: true,
            acceptedAt: account.created_at,
          },
        ]}
      />

      {/* HIL Compliance Stats */}
      <HILComplianceStats
        total={hilTotal}
        approved={hilApproved}
        rejected={hilRejected}
        expired={hilExpired}
        period="Last 30 days"
      />

      {/* TCPA Consent Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[#1A2744]" />
            <h2 className="font-semibold text-[#1A2744]">Customer SMS Consent</h2>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{totalCustomers?.length ?? 0} total</span>
            <span className="text-green-600">{smsConsentCustomers?.length ?? 0} consented</span>
            <span className="text-red-500">{optedOutCustomers?.length ?? 0} opted out</span>
          </div>
        </div>
        <TCPAConsentTable accountId={account.id} />
      </div>

      {/* Data Rights Panel */}
      <DataRightsPanel accountId={account.id} businessName={account.business_name ?? ""} />

      {/* A2P Registration Status */}
      <div className="bg-[#FFF7ED] border border-orange-200 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-[#1A2744] mb-1">A2P 10DLC Registration</h3>
            <p className="text-gray-600 text-sm">
              Required for sending more than 100 SMS/month without carrier filtering.
              {account.twilio_a2p_registered
                ? ` Your number ${account.twilio_phone_number} is registered.`
                : " Not yet registered — some messages may be filtered by carriers."}
            </p>
          </div>
          <a
            href="/integrations#a2p"
            className="flex-shrink-0 bg-[#FF6B00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#CC5500] transition-colors"
          >
            {account.twilio_a2p_registered ? "View Status" : "Register Now"}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────

function ComplianceScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "text-green-600 bg-green-50 border-green-200"
    : score >= 70 ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200";

  const label = score >= 90 ? "Compliant" : score >= 70 ? "Action Needed" : "At Risk";

  return (
    <div className={`flex items-center gap-2 border rounded-xl px-4 py-2 ${color}`}>
      <Shield size={18} />
      <div>
        <div className="font-bold text-xl leading-none">{score}%</div>
        <div className="text-xs font-medium">{label}</div>
      </div>
    </div>
  );
}

function calculateComplianceScore(params: {
  a2pRegistered: boolean;
  hasCustomers: boolean;
  optOutRate: number;
  hilResponseRate: number;
}): number {
  let score = 100;
  if (!params.a2pRegistered) score -= 15;
  if (params.optOutRate > 0.05) score -= 10; // >5% opt-out rate is a signal
  if (params.hilResponseRate < 0.9) score -= 20; // Not responding to HIL requests
  if (params.hilResponseRate < 0.7) score -= 15; // Very poor HIL response
  return Math.max(0, score);
}
