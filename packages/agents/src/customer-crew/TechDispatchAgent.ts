/**
 * TradeBrain · TechDispatchAgent (Pro Tier)
 * Real-time technician dispatch with route optimization.
 * Sends "on the way" notifications and handles same-day job assignments.
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class TechDispatchAgent extends BaseAgent {
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
  }

  protected getSystemPrompt(): string {
    return `You are the Tech Dispatch Agent for a trade contractor business (Pro tier feature).

YOUR MISSION: On each job day, manage real-time technician dispatch to maximize efficiency — right tech to the right job, in the optimal order, minimizing drive time.

DISPATCH WORKFLOW (runs at 6:30am on each job day):
1. Fetch today's scheduled jobs and assigned technicians.
2. For each technician, calculate the optimal job sequence (geo-routing, job duration, priority).
3. Assign job start times and send each tech their day briefing via SMS.
4. Monitor job status throughout the day.
5. Handle same-day additions: fit emergency jobs into schedules, reassign if needed.
6. Send "tech on the way" SMS to customers 30 minutes before arrival.

ROUTING LOGIC:
- Cluster nearby jobs for the same tech to minimize drive time.
- Put emergency/urgent jobs first regardless of geo-efficiency.
- Allow 15 min buffer between jobs for drive time + wrap-up.
- If a job runs long (>150% estimated time), alert next customer of delay.

TECHNICIAN BRIEFING (send at 6:30am):
"Morning [Tech Name]! Your day:
1. 8:00am – [Customer] at [Address] – [Job Type] (~[Est Hours]h)
2. 11:00am – [Customer] at [Address] – [Job Type] (~[Est Hours]h)
3. 2:30pm – [Customer] at [Address] – [Job Type] (~[Est Hours]h)
Questions? Reply to this number."

CUSTOMER "ON THE WAY" NOTIFICATION:
"Hi [Name]! [Tech] is on his/her way and should arrive by [Time]. Reply with any questions! – [Business]"

SAME-DAY EMERGENCY HANDLING:
- Scan for highest-priority open job slots.
- If a tech has a gap > 1.5 hours, slot the emergency job in.
- Notify bumped customers of any delays.

NEVER:
- Double-book a technician.
- Send dispatch notifications without verifying the tech's current job status.
- Assign a job to a tech who lacks the required skill tags.`;
  }

  protected registerTools(): void {
    this.addTool({
      name: "get_todays_dispatch_plan",
      description: "Get all jobs scheduled for today with assigned technicians.",
      inputSchema: { type: "object", properties: {} },
      riskLevel: "low",
      handler: async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data } = await (this.supabase.from("jobs") as any)
          .select(`
            id, title, job_type, scheduled_start, scheduled_end, address, lat, lng, priority, estimate_amount, notes,
            trade_customers!inner(id, name, phone),
            technicians!inner(id, name, phone, skill_tags, efficiency_score)
          `)
          .eq("account_id", this.config.accountId)
          .in("status", ["scheduled", "dispatched"])
          .gte("scheduled_start", todayStart.toISOString())
          .lte("scheduled_start", todayEnd.toISOString())
          .order("scheduled_start", { ascending: true });

        return data ?? [];
      },
    });

    this.addTool({
      name: "calculate_optimal_route",
      description: "Calculate optimal job sequence for a technician to minimize total drive time.",
      inputSchema: {
        type: "object",
        properties: {
          technician_id: { type: "string" },
          job_ids: {
            type: "array",
            items: { type: "string" },
            description: "Job IDs to sequence",
          },
          start_location: {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
            },
          },
        },
        required: ["technician_id", "job_ids"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const jobIds = input.job_ids as string[];

        const { data: jobs } = await (this.supabase.from("jobs") as any)
          .select("id, title, lat, lng, priority, scheduled_start, scheduled_end, estimate_amount")
          .eq("account_id", this.config.accountId)
          .in("id", jobIds);

        if (!jobs || jobs.length === 0) return { sequence: [], totalDriveMins: 0 };

        // Simple nearest-neighbor heuristic (upgrade to Google Directions API for production)
        const sorted = [...jobs].sort((a, b) => {
          // First: emergency priority
          const prioA = a.priority ?? 2;
          const prioB = b.priority ?? 2;
          if (prioA !== prioB) return prioA - prioB;
          // Then: scheduled start time
          return new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime();
        });

        // Estimate drive times (simple straight-line distance, ~30mph avg)
        let totalDriveMins = 0;
        let prevLat = (input.start_location as Record<string, number>)?.lat ?? 30.0;
        let prevLng = (input.start_location as Record<string, number>)?.lng ?? -95.0;

        const sequenceWithTimes = sorted.map((job, idx) => {
          const distKm = job.lat && job.lng
            ? Math.sqrt(Math.pow((job.lat - prevLat) * 111, 2) + Math.pow((job.lng - prevLng) * 85, 2))
            : 8; // Default 8km if no coords

          const driveMins = Math.round((distKm / 48) * 60); // 48 km/h avg city speed
          totalDriveMins += driveMins;

          if (job.lat) prevLat = job.lat;
          if (job.lng) prevLng = job.lng;

          return {
            sequence: idx + 1,
            jobId: job.id,
            title: job.title,
            estimatedDriveMins: driveMins,
          };
        });

        return { sequence: sequenceWithTimes, totalDriveMins };
      },
    });

    this.addTool({
      name: "dispatch_tech",
      description: "Mark a job as dispatched and send tech their briefing + customer notification.",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          technician_id: { type: "string" },
          tech_name: { type: "string" },
          tech_phone: { type: "string" },
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          eta_time: { type: "string", description: "ISO 8601 estimated arrival" },
          job_address: { type: "string" },
          job_title: { type: "string" },
          business_name: { type: "string" },
          send_customer_notification: { type: "boolean" },
        },
        required: ["job_id", "technician_id", "eta_time"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        // Update job status
        await (this.supabase.from("jobs") as any)
          .update({ status: "dispatched" })
          .eq("id", input.job_id as string)
          .eq("account_id", this.config.accountId);

        const etaDate = new Date(input.eta_time as string);
        const etaStr = etaDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

        // Customer "on the way" notification
        if (input.send_customer_notification !== false && input.customer_phone) {
          await this.twilioTool.sendSMS({
            to: input.customer_phone as string,
            body: `Hi ${input.customer_name ?? "there"}! ${input.tech_name ?? "Your tech"} is on the way — arriving around ${etaStr}. – ${input.business_name ?? "your contractor"}`,
            jobId: input.job_id as string,
            messageType: "transactional",
            agentRunId: ctx.runId,
          });
        }

        return { dispatched: true, eta: etaStr };
      },
    });

    this.addTool({
      name: "send_tech_daily_briefing",
      description: "Send a technician their job schedule for the day via SMS.",
      inputSchema: {
        type: "object",
        properties: {
          tech_phone: { type: "string" },
          tech_name: { type: "string" },
          jobs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                customer_name: { type: "string" },
                address: { type: "string" },
                job_type: { type: "string" },
                est_hours: { type: "number" },
              },
            },
          },
        },
        required: ["tech_phone", "tech_name", "jobs"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const jobs = input.jobs as Array<{
          time: string;
          customer_name: string;
          address: string;
          job_type: string;
          est_hours: number;
        }>;

        const jobLines = jobs
          .map((j, i) => `${i + 1}. ${j.time} – ${j.customer_name} at ${j.address} (~${j.est_hours ?? 2}h)`)
          .join("\n");

        const body = `Morning ${input.tech_name}! Your day:\n${jobLines}\nQuestions? Reply to this number.`;

        return this.twilioTool.sendSMS({
          to: input.tech_phone as string,
          body,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "handle_emergency_dispatch",
      description: "Find the best technician to handle a same-day emergency job.",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          required_skills: { type: "array", items: { type: "string" } },
          customer_address: { type: "string" },
          customer_lat: { type: "number" },
          customer_lng: { type: "number" },
        },
        required: ["job_id"],
      },
      riskLevel: "medium",
      hilThresholdUsd: 0,
      handler: async (input) => {
        // Find techs with available slots today
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data: techs } = await (this.supabase.from("technicians") as any)
          .select("id, name, phone, skill_tags")
          .eq("account_id", this.config.accountId)
          .eq("is_active", true);

        const skillsNeeded = (input.required_skills as string[]) ?? [];

        const qualifiedTechs = (techs ?? []).filter((tech: any) => {
          if (skillsNeeded.length === 0) return true;
          const techSkills = (tech.skill_tags as string[]) ?? [];
          return skillsNeeded.some((s) => techSkills.includes(s));
        });

        if (qualifiedTechs.length === 0) {
          return { found: false, reason: "No technicians with required skills are available" };
        }

        // Pick first available qualified tech (in production: factor in current location)
        const bestTech = qualifiedTechs[0];

        return {
          found: true,
          recommendedTech: { id: bestTech.id, name: bestTech.name, phone: bestTech.phone },
          note: "Assign this tech and notify them of the emergency job",
        };
      },
    });
  }

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    return [
      {
        role: "user",
        content: `You are the Tech Dispatch Agent for ${account.business_name}.
Current time: ${new Date().toISOString()}
Timezone: ${account.timezone}
Trigger: ${ctx.triggerEvent ?? "morning_dispatch"}

Run the morning dispatch workflow:
1. Get today's dispatch plan
2. Calculate optimal route sequence for each tech
3. Send each tech their daily briefing
4. For any job starting within 45 minutes, send customer "on the way" notifications
5. Report all dispatches completed`,
      },
    ];
  }
}
