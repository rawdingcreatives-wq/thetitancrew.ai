/**
 * TradeBrain · CustomerCommAgent
 * Handles all customer-facing communications: appointment confirmations,
 * estimate follow-ups, job completion messages, review requests, and re-engagement.
 * Every outbound message is TCPA-compliant.
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class CustomerCommAgent extends BaseAgent {
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
  }

  protected getSystemPrompt(): string {
    return `You are the Customer Communications Agent for a US trade contractor business.

YOUR MISSION: Build customer relationships through timely, professional, personalized communication — at every stage of the customer lifecycle — while keeping the business's calendar full.

COMMUNICATION TRIGGERS & TEMPLATES:

1. APPOINTMENT CONFIRMATION (send immediately after booking):
   "Hi [Name]! Confirmed ✅ [Tech Name] will arrive [Day] [Date], [Time Window]. Reply C to confirm or R to reschedule. Questions? Reply anytime. – [Business Name]"

2. DAY-BEFORE REMINDER (send at 5pm the day before):
   "Reminder 🔧 [Tech Name] arrives tomorrow, [Date] between [Time]. Address: [Address]. Reply to reschedule. – [Business Name]"

3. TECH ON THE WAY (send when tech dispatched, ~30 min out):
   "Your tech [Name] is on the way! ETA ~[Time]. – [Business Name]"

4. ESTIMATE FOLLOW-UP (send 24h after estimate sent, if no response):
   "Hi [Name], just checking in on your [service] estimate ($[Amount]). Happy to answer any questions or get you scheduled. – [Business Name]"

5. JOB COMPLETION + REVIEW REQUEST (send 2 hours after job marked complete):
   "Thanks for choosing [Business Name], [Name]! Hope [Tech] took great care of you. Would you mind leaving a quick review? [Google Review Link] Only takes 30 sec 🙏"

6. RE-ENGAGEMENT (send to customers who haven't called in 6+ months, seasonal):
   "Hi [Name]! It's been a while — [season] is a great time to [service reminder]. Book a checkup: [booking link] – [Business Name]"

7. UNPAID INVOICE REMINDER (7 days past due):
   "Hi [Name], a friendly reminder — invoice #[Number] for $[Amount] is due. Pay securely: [payment link] Questions? Just reply. – [Business Name]"

COMMUNICATION RULES:
- Keep ALL messages under 160 characters when possible (one SMS segment).
- Never mention pricing in re-engagement unless customer asked.
- Always identify the business by name in every message.
- If a customer replies with a question, flag for human review (don't try to answer complex questions).
- Never send more than 3 messages per customer per week.
- Honor STOP requests — the TCPA guard handles opt-outs automatically.

TONE: Warm, professional, brief. Like a trusted local business — not a corporate call center.

DO NOT:
- Make pricing guarantees in writing.
- Send to opted-out numbers.
- Send messages before 8am or after 9pm local time.
- Auto-respond to complaints or disputes — escalate to owner.`;
  }

  protected registerTools(): void {
    this.addTool({
      name: "send_appointment_confirmation",
      description: "Send appointment confirmation SMS to a customer after a job is booked.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          tech_name: { type: "string" },
          appointment_start: { type: "string", description: "ISO 8601" },
          appointment_end: { type: "string", description: "ISO 8601" },
          job_id: { type: "string" },
          business_name: { type: "string" },
        },
        required: ["customer_phone", "tech_name", "appointment_start", "job_id"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const start = new Date(input.appointment_start as string);
        const end = input.appointment_end ? new Date(input.appointment_end as string) : null;
        const timeStr = start.toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        });
        const endStr = end
          ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
          : "";
        const window = endStr ? `${timeStr}–${endStr}` : timeStr;

        const body = `Hi ${input.customer_name ?? "there"}! Confirmed ✅ ${input.tech_name} arrives ${window}. Reply C to confirm or R to reschedule. – ${input.business_name ?? "your contractor"}`;

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          jobId: input.job_id as string,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "send_day_before_reminder",
      description: "Send appointment reminder SMS the day before a scheduled job.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          tech_name: { type: "string" },
          appointment_start: { type: "string" },
          appointment_end: { type: "string" },
          job_id: { type: "string" },
          business_name: { type: "string" },
        },
        required: ["customer_phone", "tech_name", "appointment_start", "job_id"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const start = new Date(input.appointment_start as string);
        const dateStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        const endTime = input.appointment_end
          ? new Date(input.appointment_end as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
          : "";

        const body = `Reminder 🔧 ${input.tech_name} arrives tomorrow ${dateStr} ${startTime}${endTime ? `–${endTime}` : ""}. Reply to reschedule. – ${input.business_name ?? "your contractor"}`;

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          jobId: input.job_id as string,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "send_review_request",
      description: "Send a Google review request SMS 2 hours after job completion.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          tech_name: { type: "string" },
          job_id: { type: "string" },
          business_name: { type: "string" },
          google_review_url: { type: "string" },
        },
        required: ["customer_phone", "job_id"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const reviewUrl = (input.google_review_url as string) ?? await this.getGoogleReviewUrl();
        const body = `Thanks for choosing ${input.business_name ?? "us"}, ${input.customer_name ?? ""}! Hope ${input.tech_name ?? "our team"} did great. Mind leaving a quick review? ${reviewUrl} Takes 30 sec 🙏`;

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          jobId: input.job_id as string,
          messageType: "marketing",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "send_estimate_followup",
      description: "Send follow-up SMS 24h after an estimate was sent but not accepted.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          service_description: { type: "string" },
          estimate_amount: { type: "number" },
          job_id: { type: "string" },
          business_name: { type: "string" },
        },
        required: ["customer_phone", "job_id"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const amountStr = input.estimate_amount
          ? ` (~$${(input.estimate_amount as number).toLocaleString()})`
          : "";
        const body = `Hi ${input.customer_name ?? "there"}, checking in on your ${input.service_description ?? "service"}${amountStr} estimate. Questions? Happy to help or get you scheduled. – ${input.business_name ?? "your contractor"}`;

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          jobId: input.job_id as string,
          messageType: "marketing",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "send_reengagement",
      description: "Send re-engagement SMS to lapsed customers (6+ months since last service).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          service_type: { type: "string", description: "e.g., HVAC tune-up, plumbing inspection" },
          business_name: { type: "string" },
          booking_url: { type: "string" },
        },
        required: ["customer_phone", "customer_id"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const season = this.getCurrentSeason();
        const body = `Hi ${input.customer_name ?? "there"}! ${season} is great for ${input.service_type ?? "a checkup"}. Book in 60 sec: ${(input.booking_url as string) ?? ""} – ${input.business_name ?? "your contractor"}`;

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          messageType: "marketing",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "get_customers_needing_comms",
      description: "Get customers who need various types of communication right now.",
      inputSchema: {
        type: "object",
        properties: {
          comm_type: {
            type: "string",
            enum: ["day_before_reminder", "review_request", "estimate_followup", "reengagement"],
          },
        },
        required: ["comm_type"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const commType = input.comm_type as string;

        if (commType === "day_before_reminder") {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStart = new Date(tomorrow);
          tomorrowStart.setHours(0, 0, 0, 0);
          const tomorrowEnd = new Date(tomorrow);
          tomorrowEnd.setHours(23, 59, 59, 999);

          const { data } = await this.supabase
            .from("jobs")
            .select(`
              id, title, scheduled_start, scheduled_end,
              trade_customers!inner(id, name, phone, comms_opt_out),
              technicians(name)
            `)
            .eq("account_id", this.config.accountId)
            .eq("status", "scheduled")
            .gte("scheduled_start", tomorrowStart.toISOString())
            .lte("scheduled_start", tomorrowEnd.toISOString());
          return data ?? [];
        }

        if (commType === "review_request") {
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

          const { data } = await this.supabase
            .from("jobs")
            .select(`
              id, title, actual_end,
              trade_customers!inner(id, name, phone, comms_opt_out)
            `)
            .eq("account_id", this.config.accountId)
            .eq("status", "completed")
            .gte("actual_end", fourHoursAgo)
            .lte("actual_end", twoHoursAgo);
          return data ?? [];
        }

        if (commType === "reengagement") {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

          const { data } = await this.supabase
            .from("trade_customers")
            .select("id, name, phone, last_service_at, comms_opt_out, total_jobs")
            .eq("account_id", this.config.accountId)
            .eq("comms_opt_out", false)
            .lt("last_service_at", sixMonthsAgo.toISOString())
            .gte("total_jobs", 1)
            .limit(50);
          return data ?? [];
        }

        return [];
      },
    });

    this.addTool({
      name: "flag_for_human_review",
      description: "Flag an inbound customer message for owner review (complex question, complaint, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_phone: { type: "string" },
          message_content: { type: "string" },
          reason: { type: "string" },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["customer_phone", "message_content", "reason"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        // Notify owner via SMS about the flagged message
        const { data: account } = await this.supabase
          .from("accounts")
          .select("phone")
          .eq("id", this.config.accountId)
          .single();

        if (account?.phone) {
          await this.twilioTool.sendSMS({
            to: account.phone,
            body: `[TradeBrain] Customer ${input.customer_phone} needs your attention: "${(input.message_content as string).slice(0, 80)}..." Reason: ${input.reason}`,
            messageType: "transactional",
            agentRunId: ctx.runId,
          });
        }

        return { flagged: true, ownerNotified: !!account?.phone };
      },
    });
  }

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    const memContext = await this.memory.getContextBlock(
      "customer communication preferences and response patterns",
      { memoryType: "comm_preference", limit: 5 }
    );

    return [
      {
        role: "user",
        content: `You are the Customer Communications Agent for ${account.business_name} (${account.trade_type} business in ${account.timezone} timezone).

Context: ${memContext}
Trigger: ${ctx.triggerEvent ?? "scheduled_comm_sweep"}
Payload: ${JSON.stringify(ctx.payload ?? {})}

Run the communications workflow:
1. Check customers needing day-before reminders
2. Check completed jobs needing review requests
3. Check estimates needing follow-up
4. If trigger is reengagement sweep, send re-engagement messages to lapsed customers

Execute the appropriate communications and report what was sent.`,
      },
    ];
  }

  private async getGoogleReviewUrl(): Promise<string> {
    const { data } = await this.supabase
      .from("accounts")
      .select("integrations")
      .eq("id", this.config.accountId)
      .single();
    const integrations = (data?.integrations ?? {}) as Record<string, unknown>;
    return (integrations.google_review_url as string) ?? "https://g.page/r/review";
  }

  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return "Spring";
    if (month >= 5 && month <= 7) return "Summer";
    if (month >= 8 && month <= 10) return "Fall";
    return "Winter";
  }
}
