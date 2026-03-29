// @ts-nocheck
/**
 * TitanCrew Dashboard — /integrations
 *
 * Connect and manage third-party integrations:
 *   - Google Calendar (OAuth2)
 *   - QuickBooks Online (OAuth2)
 *   - Ferguson + Grainger (API keys, set by admin)
 *   - Twilio A2P 10DLC registration
 *
 * Server component — reads integration status from DB.
 * Client components handle OAuth redirect flows.
 */

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { A2PRegistrationPanel } from "@/components/integrations/A2PRegistrationPanel";
import { IntegrationHealthBar } from "@/components/integrations/IntegrationHealthBar";
import { CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react";

export const metadata = { title: "Integrations — TitanCrew" };

// ─── Types ───────────────────────────────────────────────

interface IntegrationStatus {
  googleCalendar: { connected: boolean; connectedAt?: string; calendarId?: string };
  quickbooks: { connected: boolean; connectedAt?: string; realmId?: string };
  ferguson: { enabled: boolean };
  grainger: { enabled: boolean };
  twilio: { a2pRegistered: boolean; phoneNumber?: string };
}

// ─── Page ─────────────────────────────────────────────────

export default async function IntegrationsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: account } = await supabase
    .from("accounts")
    .select(`
      id, plan, trade_type,
      google_calendar_token, google_calendar_id, google_connected_at,
      qbo_access_token, qbo_realm_id, qbo_connected_at,
      twilio_a2p_registered, twilio_phone_number
    `)
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/onboarding");

  const status: IntegrationStatus = {
    googleCalendar: {
      connected: !!account.google_calendar_token,
      connectedAt: account.google_connected_at,
      calendarId: account.google_calendar_id,
    },
    quickbooks: {
      connected: !!account.qbo_access_token,
      connectedAt: account.qbo_connected_at,
      realmId: account.qbo_realm_id,
    },
    ferguson: { enabled: !!process.env.FERGUSON_API_KEY },
    grainger: { enabled: !!process.env.GRAINGER_API_KEY },
    twilio: {
      a2pRegistered: !!account.twilio_a2p_registered,
      phoneNumber: account.twilio_phone_number,
    },
  };

  const connectedCount = [
    status.googleCalendar.connected,
    status.quickbooks.connected,
    status.ferguson.enabled,
    status.grainger.enabled,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2744]">Integrations</h1>
          <p className="text-gray-500 mt-1">
            Connect your tools to unlock the full power of your TitanCrew
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#1A2744] text-white px-4 py-2 rounded-lg text-sm">
          <CheckCircle2 size={16} className="text-green-400" />
          <span>{connectedCount} of 4 connected</span>
        </div>
      </div>

      {/* Health Bar */}
      <IntegrationHealthBar status={status} />

      {/* Critical Missing Alert */}
      {(!status.googleCalendar.connected || !status.quickbooks.connected) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Incomplete setup — agents working at reduced capacity</p>
            <p className="text-amber-700 text-sm mt-1">
              {!status.googleCalendar.connected && "SchedulerAgent cannot book jobs without Google Calendar. "}
              {!status.quickbooks.connected && "FinanceInvoiceAgent cannot create invoices without QuickBooks."}
            </p>
          </div>
        </div>
      )}

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Calendar */}
        <IntegrationCard
          id="google_calendar"
          name="Google Calendar"
          description="Two-way sync for job scheduling. Agents read availability and book jobs directly to your calendar."
          logoSrc="/logos/google-calendar.svg"
          connected={status.googleCalendar.connected}
          connectedAt={status.googleCalendar.connectedAt}
          connectedDetail={status.googleCalendar.calendarId ? `Calendar: ${status.googleCalendar.calendarId}` : undefined}
          connectUrl={`/api/integrations/google-calendar/start?accountId=${account.id}`}
          disconnectUrl={`/api/integrations/google-calendar/disconnect`}
          features={[
            "Read technician availability (freebusy)",
            "Auto-create job events with customer details",
            "Send 24h + 1h reminder notifications",
            "Detect scheduling conflicts before booking",
            "Sync job status colors (green=done, red=cancelled)",
          ]}
          requiredFor={["SchedulerAgent", "ForemanPredictorAgent"]}
          docUrl="https://docs.titancrew.ai/integrations/google-calendar"
        />

        {/* QuickBooks Online */}
        <IntegrationCard
          id="quickbooks"
          name="QuickBooks Online"
          description="Create, send, and track invoices automatically. Sync customers and pull revenue reports."
          logoSrc="/logos/quickbooks.svg"
          connected={status.quickbooks.connected}
          connectedAt={status.quickbooks.connectedAt}
          connectedDetail={status.quickbooks.realmId ? `Company ID: ${status.quickbooks.realmId}` : undefined}
          connectUrl={`/api/integrations/quickbooks/start?accountId=${account.id}`}
          disconnectUrl={`/api/integrations/quickbooks/disconnect`}
          features={[
            "Auto-create invoices from completed jobs",
            "Send invoices directly to customers",
            "Track overdue payments and chase automatically",
            "Sync customer records bidirectionally",
            "Pull weekly/monthly revenue reports",
          ]}
          requiredFor={["FinanceInvoiceAgent", "ForemanPredictorAgent"]}
          docUrl="https://docs.titancrew.ai/integrations/quickbooks"
        />

        {/* Ferguson */}
        <IntegrationCard
          id="ferguson"
          name="Ferguson"
          description="Search parts, compare prices, and create purchase orders for plumbing, HVAC, and waterworks supplies."
          logoSrc="/logos/ferguson.svg"
          connected={status.ferguson.enabled}
          connectedDetail={status.ferguson.enabled ? "API configured by TitanCrew" : undefined}
          isAdminManaged
          features={[
            "Real-time part pricing and availability",
            "Automatic best-price comparison vs Grainger",
            "Create POs with delivery to your shop or job site",
            "Track order status and delivery ETAs",
            "Backorder detection with alternative suggestions",
          ]}
          requiredFor={["PartsInventoryAgent"]}
          docUrl="https://docs.titancrew.ai/integrations/suppliers"
        />

        {/* Grainger */}
        <IntegrationCard
          id="grainger"
          name="Grainger"
          description="Industrial MRO and HVAC/electrical supplies. Automatically compared against Ferguson for best pricing."
          logoSrc="/logos/grainger.svg"
          connected={status.grainger.enabled}
          connectedDetail={status.grainger.enabled ? "API configured by TitanCrew" : undefined}
          isAdminManaged
          features={[
            "Parallel search alongside Ferguson",
            "Value scoring: price + availability + speed",
            "Same-day delivery in select metro areas",
            "Commercial account pricing",
            "Alternative part suggestions for backordered items",
          ]}
          requiredFor={["PartsInventoryAgent"]}
          docUrl="https://docs.titancrew.ai/integrations/suppliers"
        />
      </div>

      {/* Twilio / A2P Section */}
      <A2PRegistrationPanel
        accountId={account.id}
        isRegistered={status.twilio.a2pRegistered}
        phoneNumber={status.twilio.phoneNumber}
        tradeType={account.trade_type}
      />

      {/* OAuth Callback Info */}
      <div className="bg-[#F8FAFF] border border-[#E2E8F0] rounded-xl p-6">
        <h3 className="font-semibold text-[#1A2744] mb-3">Integration Security</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
            <span>OAuth tokens encrypted at rest via Supabase Vault</span>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
            <span>Auto token refresh — no re-authentication needed</span>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
            <span>Revoke access any time from third-party dashboards</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          TitanCrew requests minimum required permissions for each integration.{" "}
          <a href="https://docs.titancrew.ai/security/integrations" className="text-[#FF6B00] hover:underline" target="_blank" rel="noopener">
            View permission details <ExternalLink size={10} className="inline" />
          </a>
        </p>
      </div>
    </div>
  );
}
