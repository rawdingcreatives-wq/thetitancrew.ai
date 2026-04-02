// @ts-nocheck
/**
 * TitanCrew Â· Morning Briefing Email API Route
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

export async function POST(req: NextRequest) {
  // ââ Auth: agent secret or user session ââââââââââââââââââââââ
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

  // ââ Fetch account âââââââââââââââââââââââââââââââââââââââââââ
  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // ââ Gather data in parallel âââââââââââââââââââââââââââââââââ
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
      supabase
        .from("jobs")
        .select("id, title, scheduled_start, scheduled_end, status, estimate_amount, trade_type")
        .eq("account_id", accountId)
        .gte("scheduled_start", startOfDay.toISOString())
        .lte("scheduled_start", endOfDay.toISOString())
        .order("scheduled_start", { ascending: true }),

      // Jobs this week
      supabase
        .from("jobs")
        .select("id, estimate_amount, status")
        .eq("account_id", accountId)
        .gte("scheduled_start", startOfWeek.toISOString())
        .lte("scheduled_start", endOfDay.toISOString()),

      // Outstanding invoices
      supabase
        .from("jobs")
        .select("id, invoice_amount")
        .eq("account_id", accountId)
        .eq("status", "invoiced"),

      // Agent runs last 24h
      supabase
        .from("agent_runs")
        .select("id, trigger_event, output_summary, created_at, status")
        .eq("account_id", accountId)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(8),

      // Pending HIL approvals
      supabase
        .from("hil_confirmations")
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "pending"),
    ]);

  // ââ Build today's schedule (join with customers + techs) ââââ
  const todayJobs = jobsTodayRes.data ?? [];
  const todaySchedule = todayJobs.map((job: any) => ({
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

  // ââ Calculate revenue this week âââââââââââââââââââââââââââââ
  const weekJobs = jobsWeekRes.data ?? [];
  const revenueThisWeek = weekJobs.reduce(
    (sum: number, j: any) => sum + (j.estimate_amount ?? 0),
    0
  );

  // ââ Outstanding invoices ââââââââââââââââââââââââââââââââââââ
  const invoices = invoicesRes.data ?? [];
  const outstandingAmount = invoices.reduce(
    (sum: number, j: any) => sum + (j.invoice_amount ?? 0),
    0
  );

  // ââ Agent activity ââââââââââââââââââââââââââââââââââââââââââ
  const agentIcons: Record<string, string> = {
    daily_morning_sweep: "ð",
    job_completed: "â",
    new_job_lead: "ð",
    invoice_overdue: "ð°",
    reengagement_sweep: "ðä",
    low_stock_alert: "ð¦",
    morning_dispatch: "ð",
    default: "ð¤",
  };

  const agentRuns = agentRunsRes.data ?? [];
  const agentActions = agentRuns.map((run: any) => ({
    icon: agentIcons[run.trigger_event] ?? agentIcons.default,
    agent: (run.trigger_event ?? "agent").replace(/_/g, " "),
    action: "completed",
    detail: run.output_summary ?? "Action completed successfully",
  }));

  // ââ Alerts ââââââââââââââââââââââââââââââââââââââââââââââââââ
  const alerts: MorningBriefingData["alerts"] = [];

  if (outstandingAmount > 1000) {
    alerts.push({
      type: "warning",
      message: `$${outstandingAmount.toLocaleString()} in outstanding invoices â oldest is overdue`,
    });
  }

  if (todayJobs.length === 0) {
    alerts.push({
      type: "info",
      message: "No jobs scheduled today â your Scheduling Agent is looking for leads",
    });
  }

  if (todayJobs.length >= 8) {
    alerts.push({
      type: "success",
      message: "Full schedule today! All techs are booked.",
    });
  }

  // ââ Build & send ââââââââââââââââââââââââââââââââââââââââââââ
  const pendingApprovals = hilRes.data?.length ?? 0;
  const firstName = account.owner_name?.split(" ")[0] ?? "Boss";

  const briefingData: MorningBriefingData = {
    ownerFirstName: firstName,
    businessName: account.business_name,
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
    to: account.email,
    subject: `âï¸ ${firstName}'s Morning Briefing â ${briefingData.jobsToday} jobs today`,
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
