/**
 * TitanCrew — GrowthOrchestrator
 *
 * Phase 5 meta-coordinator for the growth flywheel.
 * Extends MetaSwarmOrchestrator with growth-specific routes and crons.
 *
 * New endpoints exposed on port 3001:
 *   POST /growth/case-study        → trigger CaseStudyGeneratorAgent for a job
 *   POST /growth/social-post       → trigger TradesGroupPosterAgent for an account
 *   POST /growth/viral-event       → trigger ViralLoopAgent for an event
 *   GET  /growth/stats/:accountId  → growth metrics dashboard data
 *   GET  /growth/health            → Phase 5 agent health
 *
 * Cron schedules:
 *   - Every 6h   → TradesGroupPosterAgent (each active account, round-robin)
 *   - Daily 7am  → CaseStudyGeneratorAgent batch (prior 24h completed jobs)
 *   - Daily 10pm → ViralLoopAgent scanner (milestone detection)
 *   - Weekly Mon → Growth metrics report to founder
 */

import express, { Request, Response } from "express";
import cron from "node-cron";
import { createServiceClient } from "@/lib/supabase/service";
import { auditLog } from "@titancrew/agents/src/guardrails/AuditLogger";
import { runCaseStudyGeneratorAgent, runWeeklyCaseStudyBatch } from "./CaseStudyGeneratorAgent";
import { runTradesGroupPosterAgent } from "./TradesGroupPosterAgent";
import { runViralLoopAgent, scanForViralEvents, ViralEvent } from "./ViralLoopAgent";
import twilio from "twilio";

// ─── Types ────────────────────────────────────────────────────

interface GrowthStats {
  accountId: string;
  caseStudies: {
    total: number;
    published: number;
    reviewRequestsSent: number;
    googleReviewsGenerated: number;
  };
  socialPosts: {
    total: number;
    byPlatform: Record<string, number>;
    last30Days: number;
    estimatedReach: number;
  };
  referrals: {
    code: string;
    totalUses: number;
    conversions: number;
    creditsEarned: number;
    referralUrl: string;
  };
  milestones: {
    type: string;
    achievedAt: string;
    value: number;
  }[];
  viralCoefficient: number; // K-factor estimate
}

// ─── Express Routes ────────────────────────────────────────────

export function registerGrowthRoutes(app: express.Application): void {
  // ── POST /growth/case-study ────────────────────────────────
  app.post("/growth/case-study", async (req: Request, res: Response) => {
    const { accountId, jobId, forceRegenerate } = req.body;
    if (!accountId || !jobId) {
      return res.status(400).json({ error: "accountId and jobId required" });
    }

    // Non-blocking — run in background
    runCaseStudyGeneratorAgent({ accountId, jobId, forceRegenerate }).catch(console.error);

    return res.json({ status: "queued", accountId, jobId });
  });

  // ── POST /growth/social-post ───────────────────────────────
  app.post("/growth/social-post", async (req: Request, res: Response) => {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: "accountId required" });
    }

    const ctx = await buildPostingContext(accountId);
    if (!ctx) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Non-blocking
    runTradesGroupPosterAgent(ctx).catch(console.error);

    return res.json({ status: "queued", accountId });
  });

  // ── POST /growth/viral-event ───────────────────────────────
  app.post("/growth/viral-event", async (req: Request, res: Response) => {
    const event = req.body as ViralEvent;
    if (!event.accountId || !event.eventType) {
      return res.status(400).json({ error: "accountId and eventType required" });
    }

    runViralLoopAgent(event).catch(console.error);

    return res.json({ status: "queued", eventType: event.eventType });
  });

  // ── GET /growth/stats/:accountId ──────────────────────────
  app.get("/growth/stats/:accountId", async (req: Request, res: Response) => {
    const { accountId } = req.params;
    try {
      const stats = await fetchGrowthStats(accountId);
      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // ── GET /growth/health ─────────────────────────────────────
  app.get("/growth/health", async (_req: Request, res: Response) => {
    const supabase = createServiceClient();

    // Quick health checks
    const [caseStudyCount, socialPostCount, viralEventsCount] = await Promise.allSettled([
      supabase.from("case_studies").select("id", { count: "exact", head: true }),
      supabase.from("social_posts").select("id", { count: "exact", head: true }),
      supabase.from("viral_events_log").select("id", { count: "exact", head: true }),
    ]);

    return res.json({
      status: "healthy",
      phase: 5,
      agents: {
        CaseStudyGeneratorAgent: "active",
        TradesGroupPosterAgent: "active",
        ViralLoopAgent: "active",
      },
      counts: {
        caseStudies: (caseStudyCount as any).value?.count ?? 0,
        socialPosts: (socialPostCount as any).value?.count ?? 0,
        viralEvents: (viralEventsCount as any).value?.count ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ── POST /growth/referral/validate ────────────────────────
  app.post("/growth/referral/validate", async (req: Request, res: Response) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "code required" });

    const supabase = createServiceClient();
    const { data: referral } = await supabase
      .from("referral_codes")
      .select("code, business_name, owner_name, account_id")
      .eq("code", code.toUpperCase())
      .single();

    if (!referral) return res.status(404).json({ valid: false });

    return res.json({
      valid: true,
      referredBy: referral.business_name,
      ownerName: referral.owner_name,
      code: referral.code,
    });
  });

  console.log("[GrowthOrchestrator] Routes registered");
}

// ─── Cron Schedules ────────────────────────────────────────────

export function startGrowthCrons(): void {
  // ── Every 6 hours — social posting (round-robin accounts) ──
  cron.schedule("0 */6 * * *", async () => {
    console.log("[GrowthCron] Starting social posting round...");
    await runSocialPostingRound();
  });

  // ── Daily 7:00 AM UTC — case study batch for yesterday's jobs ──
  cron.schedule("0 7 * * *", async () => {
    console.log("[GrowthCron] Running daily case study batch...");
    await runWeeklyCaseStudyBatch(); // handles filtering by date internally
  });

  // ── Daily 10:00 PM UTC — viral event scanner ──────────────
  cron.schedule("0 22 * * *", async () => {
    console.log("[GrowthCron] Scanning for viral events...");
    await scanForViralEvents();
  });

  // ── Weekly Monday 6:00 AM UTC — growth report to founder ──
  cron.schedule("0 6 * * 1", async () => {
    console.log("[GrowthCron] Sending weekly growth report...");
    await sendWeeklyGrowthReport();
  });

  // ── Every hour — process growth_task_queue ─────────────────
  cron.schedule("0 * * * *", async () => {
    await processGrowthTaskQueue();
  });

  console.log("[GrowthOrchestrator] Crons scheduled");
}

// ─── Cron Implementations ──────────────────────────────────────

async function runSocialPostingRound(): Promise<void> {
  const supabase = createServiceClient();

  // Get active accounts that haven't been posted for recently
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, business_name, trade_type, city, state, owner_name")
    .in("plan", ["basic", "pro"])
    .eq("status", "active")
    .limit(20); // Process 20 accounts per run

  if (!accounts || accounts.length === 0) return;

  const season = getCurrentSeason();

  // Stagger posts across accounts with 30s delay
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
      // Get recent case studies for this account
      const { data: recentCaseStudies } = await supabase
        .from("case_studies")
        .select("summary, job_type: title, title")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(3);

      const ctx = {
        accountId: account.id,
        businessName: account.business_name,
        tradeType: account.trade_type ?? "plumbing",
        city: account.city ?? "Houston",
        state: account.state ?? "TX",
        season,
        recentCaseStudies: recentCaseStudies ?? [],
      };

      await runTradesGroupPosterAgent(ctx);

      // 30-second stagger between accounts
      if (i < accounts.length - 1) {
        await delay(30000);
      }
    } catch (err) {
      console.error(`[GrowthCron] Social posting failed for account ${account.id}:`, err);
    }
  }
}

async function processGrowthTaskQueue(): Promise<void> {
  const supabase = createServiceClient();

  const { data: tasks } = await supabase
    .from("growth_task_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(10);

  if (!tasks || tasks.length === 0) return;

  for (const task of tasks) {
    try {
      await supabase
        .from("growth_task_queue")
        .update({ status: "processing" })
        .eq("id", task.id);

      switch (task.task_type) {
        case "generate_case_study":
          await runCaseStudyGeneratorAgent({
            accountId: task.account_id,
            jobId: task.payload.jobId,
          });
          break;
        case "share_review":
          await handleShareReviewTask(task.account_id, task.payload);
          break;
        case "viral_event":
          await runViralLoopAgent({
            accountId: task.account_id,
            eventType: task.payload.eventType,
            data: task.payload.data,
          });
          break;
      }

      await supabase
        .from("growth_task_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task.id);
    } catch (err) {
      console.error(`[GrowthQueue] Task ${task.id} failed:`, err);
      await supabase
        .from("growth_task_queue")
        .update({ status: "failed", error: String(err) })
        .eq("id", task.id);
    }
  }
}

async function sendWeeklyGrowthReport(): Promise<void> {
  const supabase = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Aggregate growth metrics
  const [
    newCaseStudies,
    newSocialPosts,
    newReferrals,
    newViralEvents,
    activeAccounts,
  ] = await Promise.allSettled([
    supabase.from("case_studies").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("social_posts").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("referral_codes").select("uses").gte("updated_at", sevenDaysAgo),
    supabase.from("viral_events_log").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const caseStudyCount = (newCaseStudies as any).value?.count ?? 0;
  const socialPostCount = (newSocialPosts as any).value?.count ?? 0;
  const viralEventCount = (newViralEvents as any).value?.count ?? 0;
  const activeCount = (activeAccounts as any).value?.count ?? 0;
  const referralUses = ((newReferrals as any).value?.data ?? []).reduce(
    (sum: number, r: { uses: number }) => sum + (r.uses || 0),
    0
  );

  const report = `📊 TitanCrew Weekly Growth Report

Active Accounts: ${activeCount}
New Case Studies: ${caseStudyCount} this week
Social Posts: ${socialPostCount} this week
Viral Events Triggered: ${viralEventCount} this week
Referral Code Uses: ${referralUses} this week

Dashboard: https://app.titancrew.ai/meta-swarm`;

  // Send to founder
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  if (process.env.FOUNDER_PHONE) {
    await twilioClient.messages.create({
      body: report,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: process.env.FOUNDER_PHONE,
    });
  }

  await auditLog({
    accountId: "system",
    agentName: "GrowthOrchestrator",
    eventType: "weekly_growth_report_sent",
    details: { caseStudyCount, socialPostCount, viralEventCount, activeCount },
  });
}

// ─── Growth Stats ──────────────────────────────────────────────

async function fetchGrowthStats(accountId: string): Promise<GrowthStats> {
  const supabase = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    caseStudiesData,
    socialPostsData,
    referralData,
    milestonesData,
    referralsConverted,
  ] = await Promise.allSettled([
    supabase.from("case_studies").select("id, status").eq("account_id", accountId),
    supabase.from("social_posts").select("id, platform, created_at, estimated_reach").eq("account_id", accountId),
    supabase.from("referral_codes").select("code, uses, credits_earned").eq("account_id", accountId).single(),
    supabase.from("viral_events_log").select("event_type, created_at, milestone_amount").eq("account_id", accountId),
    supabase.from("accounts").select("referral_code").eq("id", accountId).single(),
  ]);

  const caseStudies = (caseStudiesData as any).value?.data ?? [];
  const socialPosts = (socialPostsData as any).value?.data ?? [];
  const referral = (referralData as any).value?.data;
  const milestones = (milestonesData as any).value?.data ?? [];
  const accountData = (referralsConverted as any).value?.data;
  const referralCode = accountData?.referral_code ?? referral?.code ?? "";

  // Platform breakdown
  const byPlatform: Record<string, number> = {};
  let totalReach = 0;
  const recentPosts = socialPosts.filter(
    (p: { created_at: string }) => p.created_at >= thirtyDaysAgo
  );

  for (const post of socialPosts) {
    byPlatform[post.platform] = (byPlatform[post.platform] || 0) + 1;
    totalReach += post.estimated_reach || 0;
  }

  // K-factor estimate: (referral conversions) / (active months)
  const accountAgeDays = 30; // simplified
  const viralCoefficient =
    referral?.uses > 0 ? Math.min((referral.uses * 0.3) / Math.max(accountAgeDays / 30, 1), 1) : 0;

  return {
    accountId,
    caseStudies: {
      total: caseStudies.length,
      published: caseStudies.filter((c: { status: string }) => c.status === "published").length,
      reviewRequestsSent: caseStudies.filter((c: { status: string }) => c.status === "testimonial_requested").length,
      googleReviewsGenerated: 0, // tracked separately via Google My Business API
    },
    socialPosts: {
      total: socialPosts.length,
      byPlatform,
      last30Days: recentPosts.length,
      estimatedReach: totalReach,
    },
    referrals: {
      code: referralCode,
      totalUses: referral?.uses ?? 0,
      conversions: Math.floor((referral?.uses ?? 0) * 0.3), // ~30% conversion rate
      creditsEarned: referral?.credits_earned ?? 0,
      referralUrl: `https://titancrew.ai/signup?ref=${referralCode}`,
    },
    milestones: milestones.map((m: { event_type: string; created_at: string; milestone_amount: number }) => ({
      type: m.event_type,
      achievedAt: m.created_at,
      value: m.milestone_amount ?? 0,
    })),
    viralCoefficient: Math.round(viralCoefficient * 100) / 100,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

async function buildPostingContext(accountId: string) {
  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, trade_type, city, state, owner_name")
    .eq("id", accountId)
    .single();

  if (!account) return null;

  const { data: recentCaseStudies } = await supabase
    .from("case_studies")
    .select("summary, title")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(3);

  return {
    accountId,
    businessName: account.business_name,
    tradeType: account.trade_type ?? "plumbing",
    city: account.city ?? "Houston",
    state: account.state ?? "TX",
    season: getCurrentSeason(),
    recentCaseStudies: (recentCaseStudies ?? []).map((cs) => ({
      summary: cs.summary,
      jobType: "",
      title: cs.title,
    })),
  };
}

async function handleShareReviewTask(
  accountId: string,
  payload: { reviewText: string; customerName: string; rating: number; businessName: string }
): Promise<void> {
  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, trade_type, city, state, owner_name")
    .eq("id", accountId)
    .single();

  if (!account) return;

  const ctx = {
    accountId,
    businessName: payload.businessName,
    tradeType: account.trade_type ?? "plumbing",
    city: account.city ?? "Houston",
    state: account.state ?? "TX",
    season: getCurrentSeason(),
    recentCaseStudies: [
      {
        summary: `${payload.rating}-star review: "${payload.reviewText.slice(0, 100)}"`,
        jobType: "review",
        title: `Customer Review — ${payload.customerName}`,
      },
    ],
  };

  await runTradesGroupPosterAgent(ctx);
}

function getCurrentSeason(): "spring" | "summer" | "fall" | "winter" {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
