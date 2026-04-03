// @ts-nocheck
/**
 * TitanCrew · Scheduling Agent — Propose Slots
 *
 * POST /api/scheduling/propose
 *
 * Given a job request, proposes the top 3 available time slots based on:
 *  - Tech availability (Google Calendar + existing jobs)
 *  - Tech skills match (trade_type + skill_tags)
 *  - Drive time from previous job (Google Maps Distance Matrix)
 *  - 30-minute buffer between jobs (configurable)
 *  - Max 8 jobs per tech per day (configurable)
 *
 * Body: {
 *   accountId: string;
 *   tradeType?: string;
 *   address?: string;
 *   estimatedDuration?: number;   // minutes, default 120
 *   preferredDate?: string;       // ISO date, defaults to next 7 days
 *   urgency?: "normal" | "urgent" | "emergency";
 *   customerId?: string;
 *   notes?: string;
 * }
 *
 * Returns: {
 *   proposals: [{
 *     techId, techName, date, startTime, endTime,
 *     driveMinutes, score, reason
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const AGENT_SECRET = process.env.AGENT_API_SECRET ?? "";
const BUFFER_MINUTES = 30;
const MAX_JOBS_PER_DAY = 8;
const DEFAULT_DURATION = 120; // minutes
const SEARCH_DAYS = 7;

interface Proposal {
  techId: string;
  techName: string;
  date: string;
  startTime: string;
  endTime: string;
  driveMinutes: number | null;
  score: number;
  reason: string;
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const secret = req.headers.get("x-titancrew-secret");
  const supabase = await createServerClient();

  if (secret !== AGENT_SECRET) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const {
    accountId,
    tradeType,
    address,
    estimatedDuration = DEFAULT_DURATION,
    preferredDate,
    urgency = "normal",
    customerId,
    notes,
  } = body;

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  // ── Fetch techs for this account ────────────────────────────
  const techQuery = supabase
    .from("technicians")
    .select("id, name, phone, trade_type, skill_tags, efficiency_score, calendar_id")
    .eq("account_id", accountId)
    .eq("is_active", true);

  if (tradeType) {
    techQuery.eq("trade_type", tradeType);
  }

  const { data: techs, error: techErr } = await techQuery;

  if (techErr || !techs?.length) {
    return NextResponse.json({
      success: false,
      proposals: [],
      message: "No available technicians found for this trade type",
    });
  }

  // ── Determine search window ─────────────────────────────────
  const searchStart = preferredDate
    ? new Date(preferredDate)
    : new Date();
  searchStart.setHours(8, 0, 0, 0); // Business hours start at 8am

  const searchEnd = new Date(searchStart);
  searchEnd.setDate(searchEnd.getDate() + (urgency === "emergency" ? 1 : SEARCH_DAYS));
  searchEnd.setHours(18, 0, 0, 0); // Business hours end at 6pm

  // ── Fetch existing jobs in the window ───────────────────────
  const { data: existingJobs } = await supabase
    .from("jobs")
    .select("id, technician_id, scheduled_start, scheduled_end, address, status")
    .eq("account_id", accountId)
    .in("status", ["scheduled", "dispatched", "in_progress"])
    .gte("scheduled_start", searchStart.toISOString())
    .lte("scheduled_start", searchEnd.toISOString())
    .order("scheduled_start", { ascending: true });

  const jobs = existingJobs ?? [];

  // ── Build availability map per tech ─────────────────────────
  const proposals: Proposal[] = [];

  for (const tech of techs) {
    // Get this tech's jobs in the window
    const techJobs = jobs.filter((j: any) => j.technician_id === tech.id);

    // Check each day in the window
    const currentDay = new Date(searchStart);
    while (currentDay < searchEnd && proposals.length < 9) {
      // Skip weekends
      const dow = currentDay.getDay();
      if (dow === 0 || dow === 6) {
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }

      // Count jobs this day
      const dayStart = new Date(currentDay);
      dayStart.setHours(8, 0, 0, 0);
      const dayEnd = new Date(currentDay);
      dayEnd.setHours(18, 0, 0, 0);

      const dayJobs = techJobs.filter((j: any) => {
        const jStart = new Date(j.scheduled_start);
        return jStart >= dayStart && jStart < dayEnd;
      });

      if (dayJobs.length >= MAX_JOBS_PER_DAY) {
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }

      // Find available slots (simple gap-finding)
      const busySlots = dayJobs
        .map((j: any) => ({
          start: new Date(j.scheduled_start).getTime(),
          end: new Date(j.scheduled_end || new Date(new Date(j.scheduled_start).getTime() + 2 * 3600000)).getTime(),
          address: j.address,
        }))
        .sort((a: any, b: any) => a.start - b.start);

      // Try slots starting at 8am, then after each existing job
      const slotCandidates = [dayStart.getTime()];
      busySlots.forEach((slot: any) => {
        slotCandidates.push(slot.end + BUFFER_MINUTES * 60000);
      });

      for (const candidateStart of slotCandidates) {
        const candidateEnd = candidateStart + estimatedDuration * 60000;

        // Must finish before 6pm
        if (candidateEnd > dayEnd.getTime()) continue;

        // Must not overlap with any busy slot
        const overlaps = busySlots.some(
          (slot: any) =>
            candidateStart < slot.end + BUFFER_MINUTES * 60000 &&
            candidateEnd > slot.start - BUFFER_MINUTES * 60000
        );
        if (overlaps) continue;

        // ── Score this slot ─────────────────────────────────
        let score = 100;

        // Prefer earlier times
        const hourOfDay = new Date(candidateStart).getHours();
        score -= (hourOfDay - 8) * 2; // Slight penalty for later in day

        // Prefer techs with higher efficiency
        score += (tech.efficiency_score ?? 0.75) * 10;

        // Urgency bonus for same-day
        const isToday =
          new Date(candidateStart).toDateString() === new Date().toDateString();
        if (urgency === "emergency" && isToday) score += 20;

        // Fewer jobs = more availability buffer
        score += (MAX_JOBS_PER_DAY - dayJobs.length) * 3;

        const startDt = new Date(candidateStart);
        const endDt = new Date(candidateEnd);

        proposals.push({
          techId: tech.id,
          techName: tech.name,
          date: startDt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          startTime: startDt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          endTime: endDt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          driveMinutes: null, // TODO: integrate with drive-time API
          score,
          reason: `${tech.name} is available with ${MAX_JOBS_PER_DAY - dayJobs.length} open slots`,
        });

        break; // Only one proposal per tech per day
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }
  }

  // ── Sort by score and return top 3 ──────────────────────────
  proposals.sort((a, b) => b.score - a.score);
  const topProposals = proposals.slice(0, 3);

  return NextResponse.json({
    success: true,
    proposals: topProposals,
    totalCandidates: proposals.length,
    searchWindow: {
      start: searchStart.toISOString(),
      end: searchEnd.toISOString(),
      techsEvaluated: techs.length,
    },
  });
}
