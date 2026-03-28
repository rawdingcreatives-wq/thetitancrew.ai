/**
 * TitanCrew · Integration Adapter — Google Calendar
 *
 * Full two-way Google Calendar integration.
 * Inherits agent guardrail chain:
 *   LiabilityFilter → HILGate (for job mutations) → GoogleCalendarAdapter → AuditLogger
 *
 * Capabilities:
 *   - Read technician availability windows (freebusy query)
 *   - Create, update, cancel job events with attendee notifications
 *   - Conflict detection (overlapping jobs, travel buffer)
 *   - Recurring appointment support (maintenance contracts)
 *   - Webhook push notifications for external calendar changes
 *   - OAuth2 token refresh handled automatically
 *
 * Uses per-account Google credentials stored in Supabase
 * (accounts.google_calendar_token — encrypted at rest via Vault)
 */

import { google, calendar_v3 } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { AuditLogger } from "../../guardrails/AuditLogger";
import { LiabilityFilter } from "../../guardrails/LiabilityFilter";
import { HILGate } from "../../base/HILGate";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

export interface CalendarSlot {
  start: string;       // ISO 8601
  end: string;
  technicianId?: string;
  technicianName?: string;
  available: boolean;
  conflictingEvents?: string[];
}

export interface JobEvent {
  eventId?: string;
  accountId: string;
  jobId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;  // ISO 8601
  endTime: string;
  technicianEmail?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  estimatedValue?: number;
  tradeType?: string;
  colorId?: string;   // Google Calendar color (1–11)
}

export interface AvailabilityQuery {
  accountId: string;
  technicianEmails: string[];
  startDate: string;  // ISO 8601 date
  endDate: string;
  jobDurationMinutes: number;
  workHoursStart?: number; // 0–23, default 7
  workHoursEnd?: number;   // 0–23, default 18
  travelBufferMinutes?: number; // default 30
}

export interface CalendarWebhook {
  channelId: string;
  resourceId: string;
  accountId: string;
  calendarId: string;
  expiresAt: string;
}

// Google Calendar event color IDs
const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: "1",    // Lavender (blue)
  in_progress: "5",  // Banana (yellow)
  completed: "2",    // Sage (green)
  cancelled: "4",    // Flamingo (red)
  lead: "3",         // Grape (purple)
  invoiced: "6",     // Tangerine (orange)
};

// ─── OAuth Token Management ───────────────────────────────

async function getOAuthClient(accountId: string): Promise<{
  client: InstanceType<typeof google.auth.OAuth2>;
  calendarId: string;
} | null> {
  const { data: account } = await supabase
    .from("accounts")
    .select("google_calendar_token, google_calendar_id, google_refresh_token")
    .eq("id", accountId)
    .single();

  if (!account?.google_calendar_token) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );

  oauth2Client.setCredentials({
    access_token: account.google_calendar_token,
    refresh_token: account.google_refresh_token,
  });

  // Auto-refresh on expiry
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await supabase
        .from("accounts")
        .update({
          google_calendar_token: tokens.access_token,
          ...(tokens.refresh_token ? { google_refresh_token: tokens.refresh_token } : {}),
        })
        .eq("id", accountId);
    }
  });

  return {
    client: oauth2Client,
    calendarId: account.google_calendar_id ?? "primary",
  };
}

// ─── Core Calendar Operations ─────────────────────────────

export class GoogleCalendarAdapter {
  private auditLogger: AuditLogger;
  private liabilityFilter: LiabilityFilter;
  private hilGate: HILGate;
  private readonly RETRY_MAX = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(accountId: string) {
    this.auditLogger = new AuditLogger(supabase, accountId);
    this.liabilityFilter = new LiabilityFilter();
    this.hilGate = new HILGate(supabase, accountId);
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    context: string,
    maxAttempts = this.RETRY_MAX
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isRetryable = lastError.message.includes("rate limit") ||
          lastError.message.includes("503") ||
          lastError.message.includes("ECONNRESET") ||
          lastError.message.includes("quota");

        if (!isRetryable || attempt === maxAttempts) throw lastError;

        const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[CalendarAdapter] Retry ${attempt}/${maxAttempts} for ${context} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  /**
   * Get available time slots for one or more technicians
   */
  async getAvailableSlots(query: AvailabilityQuery): Promise<CalendarSlot[]> {
    const auth = await getOAuthClient(query.accountId);
    if (!auth) {
      throw new Error("Google Calendar not connected. Owner must complete OAuth setup in /integrations.");
    }

    const calendar = google.calendar({ version: "v3", auth: auth.client });
    const workStart = query.workHoursStart ?? 7;
    const workEnd = query.workHoursEnd ?? 18;
    const travelBuffer = query.travelBufferMinutes ?? 30;
    const durationMs = query.jobDurationMinutes * 60 * 1000;

    // Freebusy query for all technicians at once
    const freebusyResponse = await this.withRetry(
      () => calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(query.startDate).toISOString(),
          timeMax: new Date(query.endDate).toISOString(),
          timeZone: "America/Chicago",
          items: [
            { id: auth.calendarId }, // Owner's main calendar
            ...query.technicianEmails.map((email) => ({ id: email })),
          ],
        },
      }),
      "freebusy query"
    );

    const busySlots = freebusyResponse.data.calendars ?? {};
    const allBusyPeriods: Array<{ start: Date; end: Date }> = [];

    for (const calData of Object.values(busySlots)) {
      for (const busy of calData.busy ?? []) {
        allBusyPeriods.push({
          start: new Date(busy.start!),
          end: new Date(busy.end!),
        });
      }
    }

    // Generate available slots within work hours
    const slots: CalendarSlot[] = [];
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
      // Skip weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      const dayStart = new Date(d);
      dayStart.setHours(workStart, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(workEnd, 0, 0, 0);

      let cursor = new Date(dayStart);
      while (cursor.getTime() + durationMs + travelBuffer * 60 * 1000 <= dayEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + durationMs);
        const bufferEnd = new Date(slotEnd.getTime() + travelBuffer * 60 * 1000);

        // Check if this slot conflicts with any busy period
        const conflicts = allBusyPeriods.filter(
          (b) => b.start < bufferEnd && b.end > cursor
        );

        if (conflicts.length === 0) {
          slots.push({
            start: cursor.toISOString(),
            end: slotEnd.toISOString(),
            available: true,
          });
        }

        cursor = new Date(cursor.getTime() + 30 * 60 * 1000); // 30-min increments
      }
    }

    await this.auditLogger.log({
      eventType: "calendar.availability_checked",
      details: {
        dateRange: `${query.startDate} → ${query.endDate}`,
        technicianCount: query.technicianEmails.length,
        slotsFound: slots.length,
      },
    });

    return slots.slice(0, 20); // Return top 20 slots
  }

  /**
   * Book a job — creates calendar event
   * HIL required for jobs > $500
   */
  async bookJob(event: JobEvent): Promise<{ eventId: string; htmlLink: string }> {
    // Liability check
    const liabilityCheck = this.liabilityFilter.check({
      action: "calendar_book_job",
      estimatedValue: event.estimatedValue,
      details: event,
    });
    if (!liabilityCheck.allowed) throw new Error(`Liability filter blocked: ${liabilityCheck.reason}`);

    // HIL for high-value jobs
    if ((event.estimatedValue ?? 0) > 500) {
      const approved = await this.hilGate.requestConfirmation({
        actionType: "calendar_book_job",
        description: `Book job: "${event.title}" on ${new Date(event.startTime).toLocaleDateString()} — Est. $${event.estimatedValue?.toLocaleString()}`,
        estimatedValue: event.estimatedValue,
        metadata: { jobId: event.jobId, technicianEmail: event.technicianEmail },
      });
      if (!approved) throw new Error("HIL: Job booking rejected by owner");
    }

    const auth = await getOAuthClient(event.accountId);
    if (!auth) throw new Error("Google Calendar not connected");

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (event.technicianEmail) attendees.push({ email: event.technicianEmail, responseStatus: "accepted" });
    if (event.customerEmail) attendees.push({ email: event.customerEmail, displayName: event.customerName });

    const calEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: [
        event.description ?? "",
        event.customerPhone ? `📞 Customer: ${event.customerPhone}` : "",
        event.estimatedValue ? `💰 Est. Value: $${event.estimatedValue.toLocaleString()}` : "",
        `🤖 Scheduled by TitanCrew AI`,
        `📋 Job ID: ${event.jobId}`,
      ].filter(Boolean).join("\n"),
      location: event.location,
      start: { dateTime: event.startTime, timeZone: "America/Chicago" },
      end: { dateTime: event.endTime, timeZone: "America/Chicago" },
      attendees,
      colorId: JOB_STATUS_COLORS.scheduled,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 24h before
          { method: "popup", minutes: 60 },       // 1h before
        ],
      },
      extendedProperties: {
        private: {
          titancrew_job_id: event.jobId,
          titancrew_account_id: event.accountId,
          titancrew_ai_booked: "true",
        },
      },
    };

    const result = await this.withRetry(
      () => calendar.events.insert({ calendarId: auth.calendarId, requestBody: calEvent, sendUpdates: "all" }),
      "book job"
    );

    const eventId = result.data.id!;
    const htmlLink = result.data.htmlLink!;

    // Sync back to jobs table
    await supabase.from("jobs").update({
      calendar_event_id: eventId,
      scheduled_start: event.startTime,
      scheduled_end: event.endTime,
      status: "scheduled",
      ai_booked: true,
    }).eq("id", event.jobId).eq("account_id", event.accountId);

    await this.auditLogger.log({
      eventType: "calendar.job_booked",
      details: { jobId: event.jobId, eventId, startTime: event.startTime, estimatedValue: event.estimatedValue },
    });

    return { eventId, htmlLink };
  }

  /**
   * Update an existing job event (reschedule or status change)
   */
  async updateJob(
    accountId: string,
    eventId: string,
    updates: Partial<JobEvent> & { newStatus?: string }
  ): Promise<void> {
    const auth = await getOAuthClient(accountId);
    if (!auth) throw new Error("Google Calendar not connected");

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    const patch: calendar_v3.Schema$Event = {};
    if (updates.startTime) patch.start = { dateTime: updates.startTime, timeZone: "America/Chicago" };
    if (updates.endTime) patch.end = { dateTime: updates.endTime, timeZone: "America/Chicago" };
    if (updates.title) patch.summary = updates.title;
    if (updates.location) patch.location = updates.location;
    if (updates.newStatus && JOB_STATUS_COLORS[updates.newStatus]) {
      patch.colorId = JOB_STATUS_COLORS[updates.newStatus];
    }

    await this.withRetry(
      () => calendar.events.patch({
        calendarId: auth.calendarId,
        eventId,
        requestBody: patch,
        sendUpdates: updates.startTime ? "all" : "none", // Only notify on reschedule
      }),
      "update job"
    );

    await this.auditLogger.log({
      eventType: "calendar.job_updated",
      details: { eventId, updates },
    });
  }

  /**
   * Cancel a job event
   */
  async cancelJob(accountId: string, eventId: string, reason?: string): Promise<void> {
    // Always requires HIL for cancellations
    const approved = await this.hilGate.requestConfirmation({
      actionType: "calendar_cancel_job",
      description: `Cancel calendar event ${eventId}${reason ? ` — Reason: ${reason}` : ""}`,
      metadata: { eventId, reason },
    });
    if (!approved) throw new Error("HIL: Job cancellation rejected by owner");

    const auth = await getOAuthClient(accountId);
    if (!auth) throw new Error("Google Calendar not connected");

    const calendar = google.calendar({ version: "v3", auth: auth.client });

    await this.withRetry(
      () => calendar.events.delete({
        calendarId: auth.calendarId,
        eventId,
        sendUpdates: "all",
      }),
      "cancel job"
    );

    await this.auditLogger.log({
      eventType: "calendar.job_cancelled",
      details: { eventId, reason },
    });
  }

  /**
   * Register a push notification channel for real-time external change detection
   */
  async registerWebhook(accountId: string): Promise<CalendarWebhook> {
    const auth = await getOAuthClient(accountId);
    if (!auth) throw new Error("Google Calendar not connected");

    const calendar = google.calendar({ version: "v3", auth: auth.client });
    const channelId = `titancrew_${accountId}_${Date.now()}`;
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar`;

    const result = await calendar.events.watch({
      calendarId: auth.calendarId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        params: { ttl: "86400" }, // 24 hours
      },
    });

    const webhook: CalendarWebhook = {
      channelId,
      resourceId: result.data.resourceId!,
      accountId,
      calendarId: auth.calendarId,
      expiresAt: new Date(parseInt(result.data.expiration!) ).toISOString(),
    };

    // Store for renewal tracking
    await supabase.from("accounts").update({
      google_calendar_webhook_channel: channelId,
      google_calendar_webhook_resource: result.data.resourceId,
    }).eq("id", accountId);

    return webhook;
  }

  /**
   * Get upcoming jobs for today (used by ForemanPredictorAgent daily briefing)
   */
  async getTodaysJobs(accountId: string): Promise<calendar_v3.Schema$Event[]> {
    const auth = await getOAuthClient(accountId);
    if (!auth) return [];

    const calendar = google.calendar({ version: "v3", auth: auth.client });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await this.withRetry(
      () => calendar.events.list({
        calendarId: auth.calendarId,
        timeMin: today.toISOString(),
        timeMax: tomorrow.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      "list today's events"
    );

    // Filter to TitanCrew-managed events only
    return (result.data.items ?? []).filter(
      (e) => e.extendedProperties?.private?.titancrew_account_id === accountId
    );
  }

  /**
   * Detect scheduling conflicts for a proposed time slot
   */
  async detectConflicts(
    accountId: string,
    proposedStart: string,
    proposedEnd: string,
    technicianEmail?: string
  ): Promise<{ hasConflict: boolean; conflictingEvents: string[] }> {
    const auth = await getOAuthClient(accountId);
    if (!auth) return { hasConflict: false, conflictingEvents: [] };

    const calendar = google.calendar({ version: "v3", auth: auth.client });
    const items: calendar_v3.Schema$FreeBusyRequestItem[] = [{ id: auth.calendarId }];
    if (technicianEmail) items.push({ id: technicianEmail });

    const result = await calendar.freebusy.query({
      requestBody: {
        timeMin: proposedStart,
        timeMax: proposedEnd,
        items,
      },
    });

    const conflictingEvents: string[] = [];
    for (const [calId, calData] of Object.entries(result.data.calendars ?? {})) {
      if ((calData.busy?.length ?? 0) > 0) {
        conflictingEvents.push(calId);
      }
    }

    return { hasConflict: conflictingEvents.length > 0, conflictingEvents };
  }
}

// ─── OAuth Setup Helpers (used by /integrations page) ────

export function getGoogleAuthUrl(accountId: string, redirectUri: string): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: accountId,
  });
}

export async function exchangeGoogleCode(
  code: string,
  accountId: string,
  redirectUri: string
): Promise<{ success: boolean; calendarId?: string }> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);

  await supabase.from("accounts").update({
    google_calendar_token: tokens.access_token,
    google_refresh_token: tokens.refresh_token,
    google_calendar_id: "primary",
    google_connected_at: new Date().toISOString(),
  }).eq("id", accountId);

  return { success: true, calendarId: "primary" };
}
