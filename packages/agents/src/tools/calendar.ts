/**
 * TradeBrain · Google Calendar Tool Adapter
 * Read/write calendar events for scheduling agents.
 * Uses OAuth tokens stored per-account in Supabase.
 */

import { google, calendar_v3 } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";

export interface CalendarSlot {
  start: string;     // ISO 8601
  end: string;
  available: boolean;
  technicianId?: string;
  technicianName?: string;
}

export interface JobEvent {
  id?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  address?: string;
  technicianId: string;
  jobId: string;
  customerName?: string;
  customerPhone?: string;
}

export class GoogleCalendarTool {
  private supabase: ReturnType<typeof createClient<Database>>;
  private accountId: string;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string
  ) {
    this.supabase = supabase;
    this.accountId = accountId;
  }

  /**
   * Get available slots for a technician within a date range.
   * Returns 1-hour blocks that are free on the calendar.
   */
  async getAvailableSlots(
    technicianId: string,
    dateFrom: string,
    dateTo: string,
    slotDurationHours = 1
  ): Promise<CalendarSlot[]> {
    const calendar = await this.getCalendarClient(technicianId);
    if (!calendar) return [];

    const tech = await this.fetchTechnician(technicianId);
    if (!tech) return [];

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dateFrom,
        timeMax: dateTo,
        items: [{ id: tech.calendar_id! }],
      },
    });

    const busySlots = freeBusy.data.calendars?.[tech.calendar_id!]?.busy ?? [];

    // Generate candidate slots (working hours: 7am–6pm)
    const available: CalendarSlot[] = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const tz = tech.timezone ?? "America/Chicago";

    const cursor = new Date(start);
    while (cursor < end) {
      const localHour = parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(cursor)
      );

      if (localHour >= 7 && localHour < 18) {
        const slotEnd = new Date(cursor.getTime() + slotDurationHours * 60 * 60 * 1000);
        const isBusy = busySlots.some(
          (b) =>
            new Date(b.start!!) < slotEnd && new Date(b.end!!) > cursor
        );

        available.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          available: !isBusy,
          technicianId,
          technicianName: tech.name,
        });
      }

      cursor.setMinutes(cursor.getMinutes() + 60); // 1-hour increments
    }

    return available.filter((s) => s.available);
  }

  /**
   * Book a job on a technician's calendar.
   */
  async bookJob(event: JobEvent): Promise<{ success: boolean; calendarEventId?: string; error?: string }> {
    const calendar = await this.getCalendarClient(event.technicianId);
    if (!calendar) return { success: false, error: "Calendar not connected for this technician" };

    const tech = await this.fetchTechnician(event.technicianId);
    if (!tech?.calendar_id) return { success: false, error: "No calendar ID on technician" };

    const calEvent: calendar_v3.Schema$Event = {
      summary: `[TradeBrain] ${event.title}`,
      description: [
        `Job ID: ${event.jobId}`,
        event.customerName ? `Customer: ${event.customerName}` : "",
        event.customerPhone ? `Phone: ${event.customerPhone}` : "",
        event.description ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: event.start, timeZone: tech.timezone ?? "America/Chicago" },
      end: { dateTime: event.end, timeZone: tech.timezone ?? "America/Chicago" },
      location: event.address,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
      extendedProperties: {
        private: {
          tradebrainJobId: event.jobId,
          tradebrainAccountId: this.accountId,
        },
      },
    };

    try {
      const resp = await calendar.events.insert({
        calendarId: tech.calendar_id,
        requestBody: calEvent,
        sendUpdates: "none",
      });
      return { success: true, calendarEventId: resp.data.id ?? undefined };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Update an existing calendar event (e.g., reschedule).
   */
  async updateJob(
    technicianId: string,
    calendarEventId: string,
    updates: Partial<JobEvent>
  ): Promise<{ success: boolean; error?: string }> {
    const calendar = await this.getCalendarClient(technicianId);
    if (!calendar) return { success: false, error: "Calendar not connected" };

    const tech = await this.fetchTechnician(technicianId);
    if (!tech?.calendar_id) return { success: false, error: "No calendar ID" };

    const patchBody: calendar_v3.Schema$Event = {};
    if (updates.start) patchBody.start = { dateTime: updates.start };
    if (updates.end) patchBody.end = { dateTime: updates.end };
    if (updates.title) patchBody.summary = `[TradeBrain] ${updates.title}`;
    if (updates.address) patchBody.location = updates.address;

    try {
      await calendar.events.patch({
        calendarId: tech.calendar_id,
        eventId: calendarEventId,
        requestBody: patchBody,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Cancel/delete a calendar event.
   */
  async cancelJob(
    technicianId: string,
    calendarEventId: string
  ): Promise<{ success: boolean; error?: string }> {
    const calendar = await this.getCalendarClient(technicianId);
    if (!calendar) return { success: false, error: "Calendar not connected" };

    const tech = await this.fetchTechnician(technicianId);
    if (!tech?.calendar_id) return { success: false, error: "No calendar ID" };

    try {
      await calendar.events.delete({
        calendarId: tech.calendar_id,
        eventId: calendarEventId,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── Private helpers ────────────────────────────────────────

  private async getCalendarClient(technicianId: string): Promise<calendar_v3.Calendar | null> {
    const { data: account } = await this.supabase
      .from("accounts")
      .select("integrations")
      .eq("id", this.accountId)
      .single();

    const integrations = (account?.integrations ?? {}) as Record<string, unknown>;
    const gcal = integrations.google_calendar as { access_token?: string; refresh_token?: string } | undefined;

    if (!gcal?.refresh_token) {
      console.warn(`[Calendar] No Google OAuth token for account ${this.accountId}`);
      return null;
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );
    auth.setCredentials({
      access_token: gcal.access_token,
      refresh_token: gcal.refresh_token,
    });

    return google.calendar({ version: "v3", auth });
  }

  private async fetchTechnician(
    technicianId: string
  ): Promise<{ calendar_id: string | null; name: string; timezone?: string } | null> {
    const { data } = await this.supabase
      .from("technicians")
      .select("calendar_id, name")
      .eq("id", technicianId)
      .single();

    if (!data) return null;

    const { data: account } = await this.supabase
      .from("accounts")
      .select("timezone")
      .eq("id", this.accountId)
      .single();

    return { ...data, timezone: account?.timezone };
  }
}
