/**
 * TitanCrew · Morning Briefing Email API Route
 *
 * POST /api/email/morning-briefing
 *
 * Called by the Foreman Agent (via n8n cron at 6am local) to send each
 * account owner their personalised daily briefing. Can also be triggered
 * manually from the admin panel for testing.
 *
 * Body: { accountId: string }
 * Auth: x-titancrew-secret header (agent) or authenticated user session
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sendgrid";
import {
  buildMorningBriefingHtml,
  buildMorningBriefingText,
  type MorningBriefingData,
} from "@/lib/email/templates/morning-briefing";

const AGENT_SECRET = process.env.AGENT_API_SECRET ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ─── Types for Supabase responses ────────────────────────────

interface AccountRow {
  id: string;
  email: string;
  business_name: string;
  owner_name: string;
}

interface JobRow {
  id: string;
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  estimate_amount: number | null;
  trade_type: string | null;
  invoice_amount: number | null;
}

interface AgentRunRow {
  id: string;
  trigger_event: string;
  output_summary: string | null;
  created_at: string;
  status: string;
}

export async function POST(req: NextRequest) {
  // ── Auth: agent secret or user session ──────────────────────
  const secret = req.headers.get("x-titancrew-secret");
  const supabase = await createServerClient();

  if (secret !== AGENT_SECRET) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { accountId } = await req.json();
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  // ── Fetch account ───────────────────────────────────────────
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  const typedAccount = account as AccountRow | null;
  if (accErr || !typedAccount) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // ── Gather data in parallel ─────────────────────────────────
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [jobsTodayRes, jobsWeekRes, invoicesRes, agentRunsRes, hilRes] =
    await Promise.all([
      // Jobs today
      (supabase as any)
        .from("jobs")
        .select("id, title, scheduled_start, scheduled_end, status, estimate_amount, trade_type")
        .eq("account_id", accountId)
        .gte("scheduled_start", startOfDay.toISOString())
        .lte("scheduled_start", endOfDay.toISOString())
        .order("scheduled_start", { ascending: true }),

      // Jobs this week
      (supabase as any)
        .from("jobs")
        .select("id, estimate_amount, status")
        .eq("account_id", accountId)
        .gte("scheduled_start", startOfWeek.toISOString())
        .lte("scheduled_start", endOfDay.toISOString()),

      // Outstanding invoices
      (supabase as any)
        .from("jobs")
        .select("id, invoice_amount")
        .eq("account_id", accountId)
        .eq("status", "invoiced"),

      // Agent runs last 24h
      (supabase as any)
        .from("agent_runs")
        .select("id, trigger_event, output_summary, created_at, status")
        .eq("account_id", accountId)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(8),

      // Pending HIL approvals
      (supabase as any)
        .from("hil_confirmations")
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "pending"),
    ]);

  // ── Build today's schedule (join with customers + techs) ────
  const todayJobs = (jobsTodayRes.data ?? []) as JobRow[];
  const todaySchedule = todayJobs.map((job) => ({
    time: new Date(job.scheduled_start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    customer: job.title?.split(" - ")[0] ?? "Customer",
    service: job.trade_type ?? "Service",
    tech: "Assigned",
    amount: job.estimate_amount ?? 0,
  }));

  // ── Calculate revenue this week ─────────────────────────────
  const weekJobs = (jobsWeekRes.data ?? []) as JobRow[];
  const revenueThisWeek = weekJobs.reduce(
    (sum: number, j: JobRow) => sum + (j.estimate_amount ?? 0),
    0
  );

  // ── Outstanding invoices ────────────────────────────────────
  const invoices = (invoicesRes.data ?? []) as JobRow[];
  const outstandingAmount = invoices.reduce(
    (sum: number, j: JobRow) => sum + (j.invoice_amount ?? 0),
    0
  );

  // ── Agent activity ──────────────────────────────────────────
  const agentIcons: Record<string, string> = {
    daily_morning_sweep: "📋",
    job_completed: "✅",
    new_job_lead: "📞",
    invoice_overdue: "💰",
    reengagement_sweep: "🔄",
    low_stock_alert: "📦",
    morning_dispatch: "🚛",
    default: "🤖",
  };

  const agentRuns = (agentRunsRes.data ?? []) as AgentRunRow[];
  const agentActions = agentRuns.map((run) => ({
    icon: agentIcons[run.trigger_event] ?? agentIcons.default,
    agent: (run.trigger_event ?? "agent").replace(/_/g, " "),
    action: "completed",
    detail: run.output_summary ?? "Action completed successfully",
  }));

  // ── Alerts ──────────────────────────────────────────────────
  const alerts: MorningBriefingData["alerts"] = [];

  if (outstandingAmount > 1000) {
    alerts.push({
      type: "warning",
      message: `$${outstandingAmount.toLocaleString()} in outstanding invoices — oldest is overdue`,
    });
  }

  if (todayJobs.length === 0) {
    alerts.push({
      type: "info",
      message: "No jobs scheduled today — your Scheduling Agent is looking for leads",
    });
  }

  if (todayJobs.length >= 8) {
    alerts.push({
      type: "success",
      message: "Full schedule today! All techs are booked.",
    });
  }

  // ── Build & send ────────────────────────────────────────────
  const pendingApprovals = hilRes.data?.length ?? 0;
  const firstName = typedAccount.owner_name?.split(" ")[0] ?? "Boss";

  const briefingData: MorningBriefingData = {
    ownerFirstName: firstName,
    businessName: typedAccount.business_name,
    date: today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    jobsToday: todayJobs.length,
    jobsThisWeek: weekJobs.length,
    revenueThisWeek,
    outstandingInvoices: invoices.length,
    outstandingAmount,
    agentActions,
    todaySchedule: todaySchedule.slice(0, 6), // max 6 in email
    alerts,
    pendingApprovals,
    approvalUrl: `${APP_URL}/crew`,
    dashboardUrl: APP_URL,
  };

  const html = buildMorningBriefingHtml(briefingData);
  const text = buildMorningBriefingText(briefingData);

  await sendEmail({
    to: typedAccount.email,
    subject: `☀️ ${firstName}'s Morning Briefing — ${briefingData.jobsToday} jobs today`,
    html,
    text,
    categories: ["morning_briefing"],
  });

  return NextResponse.json({
    success: true,
    briefing: {
      jobsToday: todayJobs.length,
      jobsThisWeek: weekJobs.length,
      revenueThisWeek,
      pendingApprovals,
      agentActions: agentActions.length,
    },
  });
}
