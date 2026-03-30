/**
 * TitanCrew · MetaSwarm — OnboarderAgent
 *
 * The end-to-end automated customer onboarding engine.
 * Triggered by: Stripe checkout.session.completed webhook
 *
 * Responsibility chain:
 *   1. Provision Supabase account record (plan, owner, timestamps)
 *   2. Send personalized welcome SMS + email
 *   3. Create initial agent instances for the account's plan tier
 *   4. Pre-seed agent memory with business context from onboarding form
 *   5. Schedule the first CustomerCrewOrchestrator run
 *   6. Guide owner through any remaining setup steps (HIL if needed)
 *   7. Send "Your crew is live" celebration message
 *   8. Notify MetaSwarm that onboarding is complete (triggers review request at day 7)
 *
 * Also handles: dashboard onboarding wizard final step
 * (POST /api/agents/trigger { event: "onboard_deploy" })
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../apps/dashboard/lib/supabase/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

interface OnboardingContext {
  accountId?: string;
  stripeCustomerId?: string;
  stripeSessionId?: string;
  ownerEmail?: string;
  ownerName?: string;
  businessName?: string;
  tradeType?: string;
  teamSize?: string;
  phone?: string;
  plan?: "basic" | "pro";
  timezone?: string;
  googleCalendarConnected?: boolean;
  quickbooksConnected?: boolean;
  notificationsEnabled?: boolean;
  smsOptIn?: boolean;
  city?: string;
  state?: string;
}

// ─── Agent Configurations by Plan ─────────────────────────

const AGENTS_BY_PLAN = {
  basic: [
    "scheduler",
    "customer_comm",
    "finance_invoice",
    "foreman_predictor",
    "parts_inventory",
  ],
  pro: [
    "scheduler",
    "customer_comm",
    "finance_invoice",
    "foreman_predictor",
    "parts_inventory",
    "tech_dispatch",
  ],
};

// ─── Tool Definitions ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "get_account_by_stripe_customer",
    description: "Look up a TitanCrew account by Stripe customer ID or session ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        stripeCustomerId: { type: "string" },
        stripeSessionId: { type: "string" },
        ownerEmail: { type: "string" },
      },
    },
  },
  {
    name: "provision_account",
    description:
      "Create or update the account record in Supabase. Sets plan, status, timestamps, and links to Stripe customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        stripeCustomerId: { type: "string" },
        ownerEmail: { type: "string", description: "Used to find the auth user" },
        businessName: { type: "string" },
        tradeType: { type: "string" },
        teamSize: { type: "string" },
        phone: { type: "string" },
        plan: { type: "string", enum: ["basic", "pro"] },
        timezone: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
      },
      required: ["ownerEmail", "plan"],
    },
  },
  {
    name: "create_agent_instances",
    description:
      "Instantiate all AI agents for the account's plan. Creates records in agent_instances table with status 'active'.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        plan: { type: "string", enum: ["basic", "pro"] },
        agentTypes: {
          type: "array",
          items: { type: "string" },
          description: "Override default agent list for this plan",
        },
      },
      required: ["accountId", "plan"],
    },
  },
  {
    name: "seed_agent_memory",
    description:
      "Pre-populate the agent memory (pgvector) with business context so agents are immediately useful from day 1.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        businessName: { type: "string" },
        tradeType: { type: "string" },
        teamSize: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        plan: { type: "string" },
        ownerName: { type: "string" },
        phone: { type: "string" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "send_welcome_sms",
    description:
      "Send a personalized welcome SMS to the owner. Tone: excited, human, celebrates their decision.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        plan: { type: "string" },
        tradeType: { type: "string" },
        dashboardUrl: { type: "string" },
      },
      required: ["phone", "ownerName"],
    },
  },
  {
    name: "send_welcome_email",
    description:
      "Send a branded welcome email with onboarding checklist, dashboard link, and what happens next.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        plan: { type: "string" },
        tradeType: { type: "string" },
        dashboardUrl: { type: "string" },
        agentList: { type: "array", items: { type: "string" } },
        googleCalendarConnected: { type: "boolean" },
        quickbooksConnected: { type: "boolean" },
      },
      required: ["email", "ownerName"],
    },
  },
  {
    name: "schedule_first_crew_run",
    description:
      "Schedule the first CustomerCrewOrchestrator run for 6:00 AM tomorrow in the owner's timezone.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        timezone: { type: "string", description: "IANA timezone, e.g. 'America/Chicago'" },
        triggerEvent: { type: "string", default: "daily_morning_sweep" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "create_sample_data",
    description:
      "Create 2–3 sample jobs and 1 sample customer for the account so the dashboard isn't empty on first login.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        tradeType: { type: "string" },
        businessName: { type: "string" },
      },
      required: ["accountId", "tradeType"],
    },
  },
  {
    name: "mark_onboarding_complete",
    description:
      "Update account record: set onboarded_at timestamp, status = active. Notify MetaSwarm for day-7 check-in scheduling.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        completedSteps: {
          type: "array",
          items: { type: "string" },
          description: "Steps that were successfully completed",
        },
        skippedSteps: {
          type: "array",
          items: { type: "string" },
          description: "Optional steps that were skipped",
        },
      },
      required: ["accountId"],
    },
  },
  {
    name: "send_crew_live_notification",
    description:
      "Send the final 'Your TitanCrew is LIVE!' SMS. This is the celebration message — make it exciting.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        agentCount: { type: "number" },
        dashboardUrl: { type: "string" },
        firstRunTime: { type: "string", description: "e.g. 'tomorrow at 6:00 AM'" },
      },
      required: ["phone", "ownerName"],
    },
  },
  {
    name: "schedule_day7_checkin",
    description:
      "Schedule a day-7 check-in for the account — MetaSwarmOrchestrator will assess engagement and handle churn risk.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        onboardedAt: { type: "string", description: "ISO timestamp of onboarding completion" },
        ownerEmail: { type: "string" },
        ownerPhone: { type: "string" },
      },
      required: ["accountId", "onboardedAt"],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "get_account_by_stripe_customer": {
      const { stripeCustomerId, ownerEmail } = toolInput as {
        stripeCustomerId?: string;
        ownerEmail?: string;
      };

      const query = supabase.from("accounts").select("*");
      if (stripeCustomerId) query.eq("stripe_customer_id", stripeCustomerId);
      else if (ownerEmail) query.eq("email", ownerEmail);

      const { data } = await query.single();
      return { account: data };
    }

    case "provision_account": {
      const {
        stripeCustomerId,
        ownerEmail,
        businessName,
        tradeType,
        teamSize,
        phone,
        plan,
        timezone,
        city,
        state,
      } = toolInput as Record<string, string>;

      // Find the auth user by email
      const { data: authUser } = await supabase.auth.admin.getUserByEmail(ownerEmail);
      if (!authUser?.user) {
        return { success: false, reason: `Auth user not found for email: ${ownerEmail}` };
      }

      const userId = authUser.user.id;

      // Upsert account
      const { data, error } = await supabase
        .from("accounts")
        .upsert(
          {
            owner_user_id: userId,
            email: ownerEmail,
            business_name: businessName,
            trade_type: tradeType,
            team_size: teamSize,
            phone,
            plan: plan as "basic" | "pro",
            subscription_status: "active",
            stripe_customer_id: stripeCustomerId,
            timezone: timezone ?? "America/Chicago",
            city,
            state,
            health_score: 100,
            mrr: plan === "pro" ? 799 : 399,
            created_at: new Date().toISOString(),
          },
          { onConflict: "owner_user_id" }
        )
        .select("id")
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, accountId: data?.id };
    }

    case "create_agent_instances": {
      const { accountId, plan, agentTypes } = toolInput as {
        accountId: string;
        plan: "basic" | "pro";
        agentTypes?: string[];
      };

      const agents = agentTypes ?? AGENTS_BY_PLAN[plan];
      const inserts = agents.map((agentType) => ({
        account_id: accountId,
        agent_type: agentType,
        status: "active" as const,
        enabled: true,
        config: {},
        created_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from("agent_instances")
        .upsert(inserts, { onConflict: "account_id,agent_type" })
        .select("id, agent_type");

      if (error) return { success: false, error: error.message };
      return { success: true, created: data?.length ?? 0, agents: data?.map((a) => a.agent_type) };
    }

    case "seed_agent_memory": {
      const { accountId, businessName, tradeType, teamSize, city, state, plan, ownerName } =
        toolInput as Record<string, string>;

      // Generate embedding via OpenAI
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) return { seeded: false, reason: "OPENAI_API_KEY not set" };

      const businessContext = `Business: ${businessName ?? "Unknown"}. Trade: ${tradeType}. Team size: ${teamSize ?? "unknown"}. Location: ${city ?? ""}, ${state ?? ""}. Plan: ${plan}. Owner: ${ownerName ?? "unknown"}. This is a ${tradeType} company using TitanCrew's AI crew for scheduling, invoicing, customer communications, parts inventory management, and business analytics.`;

      const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: businessContext,
        }),
      });

      const embedData = await embedResp.json();
      const embedding = embedData.data?.[0]?.embedding;

      if (!embedding) return { seeded: false, reason: "Embedding failed" };

      // Store in agent_memory
      const { error } = await supabase.from("agent_memory").insert({
        account_id: accountId,
        content: businessContext,
        memory_type: "business_context",
        embedding,
        source_agent: "onboarder",
        metadata: { seeded: true, onboarded_at: new Date().toISOString() },
        created_at: new Date().toISOString(),
      });

      return { seeded: !error, error: error?.message };
    }

    case "send_welcome_sms": {
      const { phone, ownerName, businessName, plan, tradeType, dashboardUrl } = toolInput as Record<string, string>;
      const firstName = ownerName.split(" ")[0];
      const agentCount = plan === "pro" ? 6 : 5;

      const message = `🎉 Welcome to TitanCrew, ${firstName}! Your ${agentCount}-agent AI crew for ${businessName ?? `your ${tradeType} business`} is being set up right now. Dashboard: ${dashboardUrl ?? "https://app.titancrew.ai"} — Reply STOP to opt out`;

      return await sendSMS(phone, message);
    }

    case "send_welcome_email": {
      const {
        email,
        ownerName,
        businessName,
        plan,
        tradeType,
        dashboardUrl,
        agentList,
        googleCalendarConnected,
        quickbooksConnected,
      } = toolInput as {
        email: string;
        ownerName: string;
        businessName?: string;
        plan?: string;
        tradeType?: string;
        dashboardUrl?: string;
        agentList?: string[];
        googleCalendarConnected?: boolean;
        quickbooksConnected?: boolean;
      };

      const firstName = ownerName.split(" ")[0];
      const appUrl = dashboardUrl ?? "https://app.titancrew.ai";
      const agents = agentList ?? AGENTS_BY_PLAN[plan as "basic" | "pro" ?? "basic"];

      const agentListHtml = agents
        .map(
          (a) =>
            `<li style="padding: 8px 0; border-bottom: 1px solid #F1F5F9;">✅ <strong>${a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</strong></li>`
        )
        .join("");

      const pendingSteps = [
        !googleCalendarConnected && "• <a href='${appUrl}/settings/integrations'>Connect Google Calendar</a> for automatic scheduling",
        !quickbooksConnected && "• <a href='${appUrl}/settings/integrations'>Connect QuickBooks</a> for automatic invoicing",
      ]
        .filter(Boolean)
        .join("<br>");

      const sendgridKey = process.env.SENDGRID_API_KEY;
      if (!sendgridKey) return { sent: false, reason: "SENDGRID_API_KEY not set" };

      const emailResp = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sendgridKey}`,
        },
        body: JSON.stringify({
          to: [{ email, name: ownerName }],
          from: { email: "crew@titancrew.ai", name: "TitanCrew" },
          subject: `${firstName}, your AI crew is ready 🚀`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #F8FAFF;">
              <div style="background: #1A2744; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: #FF6B00; margin: 0; font-size: 28px; font-weight: 800;">TitanCrew</h1>
                <p style="color: #9FADC9; margin: 8px 0 0;">Your AI Business Crew is Live</p>
              </div>
              <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #E2E8F0;">
                <p style="font-size: 18px; color: #1A2744;">Hey ${firstName}! 🎉</p>
                <p style="color: #374151;">Welcome to TitanCrew. Your ${agents.length}-agent AI crew is set up and ready to go for <strong>${businessName ?? `your ${tradeType} business`}</strong>.</p>

                <h3 style="color: #1A2744; margin-top: 24px;">Your Active Crew:</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${agentListHtml}
                </ul>

                <h3 style="color: #1A2744; margin-top: 24px;">What happens next:</h3>
                <p style="color: #374151;">Your crew runs its <strong>first morning sweep at 6:00 AM tomorrow</strong>. You'll get an SMS briefing on:</p>
                <ul style="color: #374151;">
                  <li>Jobs scheduled for the day</li>
                  <li>Outstanding invoices and payments</li>
                  <li>Parts that need reordering</li>
                  <li>Customer follow-ups queued</li>
                </ul>

                ${pendingSteps ? `<div style="background: #FFF7ED; border-left: 4px solid #FF6B00; padding: 16px; margin: 24px 0; border-radius: 4px;"><strong>📋 Finish setup (optional but recommended):</strong><br><br>${pendingSteps}</div>` : ""}

                <div style="text-align: center; margin: 32px 0;">
                  <a href="${appUrl}" style="display: inline-block; background: #FF6B00; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;">Go to Dashboard →</a>
                </div>

                <p style="color: #6B7280; font-size: 13px; border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 24px;">Questions? Reply to this email — a real person from our team will respond within 4 hours. You can also text us at ${process.env.SUPPORT_PHONE ?? "(512) 555-TITAN"}.</p>
              </div>
            </div>
          `,
        }),
      });

      return { sent: emailResp.ok, status: emailResp.status };
    }

    case "schedule_first_crew_run": {
      const { accountId, timezone = "America/Chicago", triggerEvent = "daily_morning_sweep" } =
        toolInput as { accountId: string; timezone?: string; triggerEvent?: string };

      // Calculate 6:00 AM tomorrow in the owner's timezone
      const now = new Date();
      const tomorrow6am = new Date();
      tomorrow6am.setDate(tomorrow6am.getDate() + 1);
      tomorrow6am.setHours(6, 0, 0, 0);

      // Schedule via n8n webhook
      const n8nWebhookUrl = process.env.N8N_SCHEDULE_WEBHOOK;
      if (n8nWebhookUrl) {
        await fetch(n8nWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            triggerEvent,
            scheduledFor: tomorrow6am.toISOString(),
            timezone,
            recurring: true,
            cronExpression: "0 6 * * *",
          }),
        }).catch(console.error);
      }

      return {
        scheduled: true,
        firstRun: tomorrow6am.toISOString(),
        timezone,
        recurringCron: "0 6 * * *",
      };
    }

    case "create_sample_data": {
      const { accountId, tradeType, businessName } = toolInput as {
        accountId: string;
        tradeType: string;
        businessName?: string;
      };

      // Sample customer
      const { data: customer } = await supabase
        .from("trade_customers")
        .insert({
          account_id: accountId,
          name: "John Anderson",
          phone: "+15125550100",
          email: "john.anderson@example.com",
          address: "1234 Maple Street, Austin, TX 78701",
          notes: "Sample customer — added during onboarding",
          comms_opt_out: false,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      // Sample jobs based on trade type
      const sampleJobs: Record<string, Array<{ title: string; description: string; amount: number }>> = {
        plumber: [
          { title: "Water heater replacement", description: "Replace 40-gal gas water heater", amount: 1200 },
          { title: "Bathroom faucet repair", description: "Fix dripping faucet in master bath", amount: 175 },
        ],
        electrician: [
          { title: "Panel upgrade 100A→200A", description: "Main service panel upgrade", amount: 2800 },
          { title: "GFCI outlet installation", description: "Install 4x GFCI outlets in kitchen", amount: 350 },
        ],
        hvac: [
          { title: "AC tune-up", description: "Annual AC maintenance and check", amount: 125 },
          { title: "Furnace installation", description: "Replace aging furnace with new 96% AFUE unit", amount: 3200 },
        ],
        general_contractor: [
          { title: "Bathroom remodel", description: "Full master bathroom renovation", amount: 8500 },
          { title: "Deck repair", description: "Replace rotted deck boards and posts", amount: 2100 },
        ],
        snow_plow: [
          { title: "Residential driveway snow clearing", description: "Remove 6+ inches of snow from driveway and walkway after storm", amount: 150 },
          { title: "Commercial lot snow plowing", description: "Full parking lot plow + salt treatment, per visit", amount: 450 },
        ],
        junk_removal: [
          { title: "Old furniture haul-away", description: "Remove and dispose of couch, dresser, and misc furniture", amount: 275 },
          { title: "Construction debris cleanout", description: "Clear and haul renovation waste — drywall, wood, flooring", amount: 850 },
        ],
      };

      const jobs = sampleJobs[tradeType] ?? sampleJobs.plumber;

      for (const job of jobs) {
        await supabase.from("jobs").insert({
          account_id: accountId,
          customer_id: customer?.id,
          title: job.title,
          description: job.description,
          status: "lead",
          amount: job.amount,
          ai_booked: false,
          created_at: new Date().toISOString(),
        });
      }

      return { sampleDataCreated: true, customersCreated: 1, jobsCreated: jobs.length };
    }

    case "mark_onboarding_complete": {
      const { accountId, completedSteps, skippedSteps } = toolInput as {
        accountId: string;
        completedSteps?: string[];
        skippedSteps?: string[];
      };

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("accounts")
        .update({
          onboarded_at: now,
          subscription_status: "active",
          health_score: 100,
        })
        .eq("id", accountId);

      // Log to audit
      await supabase.from("audit_log").insert({
        account_id: accountId,
        event_type: "onboarding_complete",
        actor: "onboarder_agent",
        details: { completedSteps, skippedSteps, completedAt: now },
        created_at: now,
      });

      return { success: !error, onboardedAt: now };
    }

    case "send_crew_live_notification": {
      const { phone, ownerName, businessName, agentCount, dashboardUrl, firstRunTime } =
        toolInput as Record<string, string | number>;
      const firstName = (ownerName as string).split(" ")[0];

      const message = `🚀 ${firstName}, your TitanCrew is LIVE! ${agentCount ?? 5} AI agents are ready to run ${businessName ?? "your business"} for you. Your crew runs its first morning sweep ${firstRunTime ?? "tomorrow at 6:00 AM"}. Dashboard: ${dashboardUrl ?? "https://app.titancrew.ai"}`;

      return await sendSMS(phone as string, message);
    }

    case "schedule_day7_checkin": {
      const { accountId, onboardedAt, ownerEmail, ownerPhone } = toolInput as Record<string, string>;

      const checkinDate = new Date(onboardedAt);
      checkinDate.setDate(checkinDate.getDate() + 7);

      const n8nWebhookUrl = process.env.N8N_CHECKIN_WEBHOOK;
      if (n8nWebhookUrl) {
        await fetch(n8nWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            checkinType: "day_7",
            scheduledFor: checkinDate.toISOString(),
            ownerEmail,
            ownerPhone,
          }),
        }).catch(console.error);
      }

      return { scheduled: true, checkinDate: checkinDate.toISOString() };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── SMS Helper ───────────────────────────────────────────

async function sendSMS(phone: string, message: string): Promise<Record<string, unknown>> {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFrom) {
    console.warn("[Onboarder] Twilio not configured — SMS not sent");
    return { sent: false, reason: "Twilio not configured" };
  }

  const formData = new URLSearchParams({ To: phone, From: twilioFrom, Body: message });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
      },
      body: formData.toString(),
    }
  );
  const data = await resp.json();
  return { sent: resp.ok, sid: data.sid };
}

// ─── Main Agent Loop ──────────────────────────────────────

export async function runOnboarderAgent(ctx: OnboardingContext): Promise<{
  success: boolean;
  accountId?: string;
  agentsCreated: number;
  onboardedAt?: string;
}> {
  const systemPrompt = `You are OnboarderAgent — TitanCrew's automated customer onboarding engine.

YOUR MISSION: Take a new paying customer from "just signed up" to "crew is fully live and running" in under 10 minutes. This is the most critical moment in the customer lifecycle — nail it.

ONBOARDING CONTEXT:
${JSON.stringify(ctx, null, 2)}

SEQUENCE (execute in order):
1. get_account_by_stripe_customer — find or confirm account exists
2. provision_account — create/update account record with full business info
3. create_agent_instances — spin up all agents for their plan
4. seed_agent_memory — pre-load business context so agents are instantly useful
5. send_welcome_email — branded welcome with onboarding checklist
6. send_welcome_sms — personal, excited, human-feeling SMS (if phone available)
7. create_sample_data — so dashboard isn't empty on first login
8. schedule_first_crew_run — 6:00 AM tomorrow in their timezone
9. mark_onboarding_complete — update DB, fire audit log
10. send_crew_live_notification — THE celebration SMS (make it exciting!)
11. schedule_day7_checkin — queue the 7-day engagement check

RULES:
- If any step fails, log the error and continue — never abort the whole flow
- Skip SMS steps if no phone number is provided
- Basic plan = 5 agents, Pro plan = 6 agents (includes TechDispatchAgent)
- The welcome messages MUST feel personal and human, not like a mass email
- Always complete mark_onboarding_complete even if some steps were skipped

Be efficient. Execute each step, handle any errors gracefully, and make this customer feel amazing about their decision to sign up.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Onboard this new customer. Stripe session: ${ctx.stripeSessionId ?? "N/A"}. Email: ${ctx.ownerEmail}. Plan: ${ctx.plan ?? "basic"}. Business: ${ctx.businessName ?? "unknown"}. Trade: ${ctx.tradeType ?? "unknown"}. Phone: ${ctx.phone ?? "not provided"}. Proceed with full onboarding sequence.`,
    },
  ];

  let accountId: string | undefined;
  let agentsCreated = 0;
  let onboardedAt: string | undefined;

  for (let turn = 0; turn < 25; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        // Track key outcomes
        const r = result as Record<string, unknown>;
        if (block.name === "provision_account" && r.accountId) {
          accountId = r.accountId as string;
        }
        if (block.name === "create_agent_instances" && r.created) {
          agentsCreated = r.created as number;
        }
        if (block.name === "mark_onboarding_complete" && r.onboardedAt) {
          onboardedAt = r.onboardedAt as string;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return {
    success: !!onboardedAt,
    accountId,
    agentsCreated,
    onboardedAt,
  };
}
