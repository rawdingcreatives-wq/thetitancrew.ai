/**
 * TradeBrain · SchedulerAgent
 * Maximizes jobs booked while respecting tech availability and customer urgency.
 * Runs on every new lead + daily gap-fill sweep at 6am local.
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { GoogleCalendarTool } from "../tools/calendar";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class SchedulerAgent extends BaseAgent {
  private calendarTool: GoogleCalendarTool;
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.calendarTool = new GoogleCalendarTool(this.supabase, config.accountId);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
  }

  // ─── System Prompt ───────────────────────────────────────

  protected getSystemPrompt(): string {
    return `You are the Scheduler Agent for a US trade contractor business (plumbing, electrical, HVAC, snow plow, junk removal, or general contractor).

YOUR MISSION: Maximize jobs booked and revenue while respecting technician availability, customer urgency, and business rules.

CORE BEHAVIORS:
1. When a new job lead comes in, ALWAYS find the best available technician and time slot within the customer's requested window.
2. Prioritize jobs in this order: (a) Emergency/urgent, (b) Existing customer, (c) High-value estimate, (d) New customer
3. Never double-book a technician. Always check calendar availability first.
4. For jobs over $500 or schedule changes, confirm with the owner via SMS before finalizing.
5. Send appointment confirmation SMS to customer within 5 minutes of booking.
6. Maintain a 20% buffer in each tech's schedule for emergency calls.
7. Aim for geo-routing efficiency — assign nearby techs to minimize drive time.

DAILY SWEEP (run at 6am):
- Identify open calendar gaps (>2 hours) in the next 3 days
- Scan the lead pipeline for unscheduled jobs that could fill those gaps
- Propose and book the best matches

COMMUNICATION STYLE:
- Owner notifications: brief, factual, action-item focused ("Booked: John Smith, Leak Repair, Thu 2pm — $350 est.")
- Customer confirmations: warm, professional — e.g. "Hi Sarah! Confirmed: our tech Marcus will arrive Thu Dec 5, 2–4pm. Reply C to confirm or R to reschedule." — adapt phrasing to the trade (tech/driver/crew for snow plow/junk removal).

ESCALATE to owner if:
- No technician is available within 48 hours of customer request
- Emergency job has no same-day slot
- Customer has rescheduled more than twice

NEVER:
- Book a technician outside their stated availability hours
- Confirm a job without calendar verification
- Send an appointment without the technician's name and time window`;
  }

  // ─── Tool Registration ────────────────────────────────────

  protected registerTools(): void {
    this.addTool({
      name: "get_available_slots",
      description: "Get available calendar time slots for a technician within a date range.",
      inputSchema: {
        type: "object",
        properties: {
          technician_id: { type: "string", description: "Technician UUID" },
          date_from: { type: "string", description: "Start date ISO 8601" },
          date_to: { type: "string", description: "End date ISO 8601" },
          slot_duration_hours: { type: "number", description: "Slot duration in hours (default 2)" },
        },
        required: ["technician_id", "date_from", "date_to"],
      },
      riskLevel: "low",
      handler: async (input) => {
        return this.calendarTool.getAvailableSlots(
          input.technician_id as string,
          input.date_from as string,
          input.date_to as string,
          (input.slot_duration_hours as number) ?? 2
        );
      },
    });

    this.addTool({
      name: "book_job",
      description: "Book a job on a technician's calendar and update the job record.",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          technician_id: { type: "string" },
          start_time: { type: "string", description: "ISO 8601 datetime" },
          end_time: { type: "string", description: "ISO 8601 datetime" },
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
          job_title: { type: "string" },
          address: { type: "string" },
          amount: { type: "number", description: "Estimated job value in USD" },
        },
        required: ["job_id", "technician_id", "start_time", "end_time", "job_title"],
      },
      riskLevel: "medium",
      hilThresholdUsd: 500,
      handler: async (input, ctx) => {
        // 1. Book on calendar
        const calResult = await this.calendarTool.bookJob({
          jobId: input.job_id as string,
          technicianId: input.technician_id as string,
          start: input.start_time as string,
          end: input.end_time as string,
          title: input.job_title as string,
          address: input.address as string,
          customerName: input.customer_name as string,
          customerPhone: input.customer_phone as string,
        });

        if (!calResult.success) return { success: false, error: calResult.error };

        // 2. Update job record in DB
        await (this.supabase.from("jobs") as any)
          .update({
            status: "scheduled",
            technician_id: input.technician_id as string,
            scheduled_start: input.start_time as string,
            scheduled_end: input.end_time as string,
            booked_by_ai: true,
            agent_id: this.config.agentInstanceId,
          })
          .eq("id", input.job_id as string)
          .eq("account_id", this.config.accountId);

        // 3. Send confirmation SMS to customer
        if (input.customer_phone) {
          const techName = await this.getTechName(input.technician_id as string);
          const startDate = new Date(input.start_time as string);
          const formatted = startDate.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
          });

          await this.twilioTool.sendSMS({
            to: input.customer_phone as string,
            body: `Hi ${input.customer_name ?? "there"}! Confirmed ✅ ${techName} will arrive ${formatted}. Reply C to confirm or R to reschedule. – ${(await this.getBusinessName())}`,
            jobId: input.job_id as string,
            messageType: "transactional",
            agentRunId: ctx.runId,
          });
        }

        return {
          success: true,
          calendarEventId: calResult.calendarEventId,
          message: `Job booked: ${input.job_title} on ${input.start_time}`,
        };
      },
    });

    this.addTool({
      name: "get_unscheduled_jobs",
      description: "Fetch jobs in 'lead' status that need to be scheduled.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
          priority_min: { type: "number", description: "Min priority level (1=urgent, 2=normal, 3=low)" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const { data } = await (this.supabase.from("jobs") as any)
          .select("id, title, job_type, priority, customer_id, address, estimate_amount, notes, created_at")
          .eq("account_id", this.config.accountId)
          .eq("status", "lead")
          .lte("priority", (input.priority_min as number) ?? 3)
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true })
          .limit((input.limit as number) ?? 20);
        return data ?? [];
      },
    });

    this.addTool({
      name: "get_technicians",
      description: "Get all active technicians and their current schedule load.",
      inputSchema: { type: "object", properties: {} },
      riskLevel: "low",
      handler: async () => {
        const { data } = await (this.supabase.from("technicians") as any)
          .select("id, name, phone, skill_tags, efficiency_score, calendar_id")
          .eq("account_id", this.config.accountId)
          .eq("is_active", true);
        return data ?? [];
      },
    });

    this.addTool({
      name: "reschedule_job",
      description: "Move a job to a new time slot (updates calendar + notifies customer).",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          calendar_event_id: { type: "string" },
          technician_id: { type: "string" },
          new_start_time: { type: "string" },
          new_end_time: { type: "string" },
          reason: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          amount: { type: "number" },
        },
        required: ["job_id", "technician_id", "new_start_time", "new_end_time"],
      },
      riskLevel: "medium",
      hilThresholdUsd: 500,
      handler: async (input, ctx) => {
        // Update calendar
        const calResult = await this.calendarTool.updateJob(
          input.technician_id as string,
          input.calendar_event_id as string,
          {
            start: input.new_start_time as string,
            end: input.new_end_time as string,
          }
        );

        // Update DB
        await (this.supabase.from("jobs") as any)
          .update({
            scheduled_start: input.new_start_time as string,
            scheduled_end: input.new_end_time as string,
          })
          .eq("id", input.job_id as string);

        // Notify customer
        if (input.customer_phone) {
          const startDate = new Date(input.new_start_time as string);
          const formatted = startDate.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
          });

          await this.twilioTool.sendSMS({
            to: input.customer_phone as string,
            body: `Hi ${input.customer_name ?? "there"} — your appointment has been rescheduled to ${formatted}. ${input.reason ? `Reason: ${input.reason}. ` : ""}Reply R if this doesn't work.`,
            jobId: input.job_id as string,
            messageType: "transactional",
            agentRunId: ctx.runId,
          });
        }

        return { success: calResult.success, error: calResult.error };
      },
    });

    this.addTool({
      name: "notify_owner",
      description: "Send the business owner an SMS update about scheduling activity.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Brief plain-text message for the owner" },
        },
        required: ["message"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const { data: account } = await (this.supabase.from("accounts") as any)
          .select("phone, notification_prefs")
          .eq("id", this.config.accountId)
          .single();

        const prefs = (account?.notification_prefs ?? {}) as Record<string, unknown>;
        if (!account?.phone || prefs.sms === false) {
          return { sent: false, reason: "Owner SMS disabled or no phone on file" };
        }

        const result = await this.twilioTool.sendSMS({
          to: account.phone,
          body: `[TradeBrain Scheduler] ${input.message as string}`,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
        return result;
      },
    });

    this.addTool({
      name: "store_scheduling_memory",
      description: "Save a scheduling pattern or insight for future use.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "What was learned" },
          memory_type: {
            type: "string",
            enum: ["scheduling_pattern", "customer_pref", "win_pattern"],
          },
        },
        required: ["content"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const id = await this.memory.store(
          input.content as string,
          (input.memory_type as "scheduling_pattern") ?? "scheduling_pattern",
          {},
          "scheduler"
        );
        return { stored: true, memoryId: id };
      },
    });
  }

  // ─── Message Builder ──────────────────────────────────────

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    const now = new Date().toISOString();
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch relevant memory
    const memoryContext = await this.memory.getContextBlock(
      "scheduling patterns and customer preferences",
      { memoryType: "scheduling_pattern", limit: 5 }
    );

    const contextBlock = `
Business: ${account.business_name} (${account.trade_type})
Timezone: ${account.timezone}
Active Techs: ${account.tech_count}
Average Job Value: $${account.avg_job_value ?? 0}
Current Time: ${now}
Scheduling Window: Now → ${threeDaysOut}
${memoryContext}

Trigger: ${ctx.triggerEvent ?? "scheduled_daily_sweep"}
Payload: ${JSON.stringify(ctx.payload ?? {})}
`;

    return [
      {
        role: "user",
        content: `You are the Scheduler Agent for ${account.business_name}. Here is your current context:\n${contextBlock}\n\nPlease run your scheduling workflow now. Start by fetching unscheduled jobs and available technician slots, then book the best matches. Confirm bookings to customers via SMS. Report what you accomplished at the end.`,
      },
    ];
  }

  // ─── Private helpers ──────────────────────────────────────

  private async getTechName(technicianId: string): Promise<string> {
    const { data } = await (this.supabase.from("technicians") as any)
      .select("name")
      .eq("id", technicianId)
      .single();
    return data?.name ?? "our technician";
  }

  private async getBusinessName(): Promise<string> {
    const { data } = await (this.supabase.from("accounts") as any)
      .select("business_name")
      .eq("id", this.config.accountId)
      .single();
    return data?.business_name ?? "your contractor";
  }
}
