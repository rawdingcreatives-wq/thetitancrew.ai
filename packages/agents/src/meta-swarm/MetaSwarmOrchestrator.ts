/**
 * TitanCrew · MetaSwarmOrchestrator
 *
 * The supervisor for all 5 MetaTitanCrew meta-agents.
 * Manages scheduling, routing, error handling, and coordination
 * of the autonomous business growth engine.
 *
 * Meta-agents under supervision:
 *   1. LeadHunterAgent     — Social signal hunting + lead qualification
 *   2. DemoCreatorAgent    — Personalized video demo generation
 *   3. OnboarderAgent      — End-to-end customer onboarding
 *   4. PerformanceOptimizerAgent — Weekly A/B testing + prompt optimization
 *   5. BillingChurnAgent   — Payment recovery + churn prevention
 *
 * Trigger sources:
 *   - n8n cron workflows (scheduled)
 *   - Stripe webhooks (billing events)
 *   - Agent API events (inter-agent triggers)
 *   - Direct API calls from dashboard
 *
 * Architecture: Express.js server on Railway/Fly.io
 * Exposes: POST /meta-swarm/trigger
 */

import express from "express";
import { runLeadHunterAgent } from "./LeadHunterAgent";
import { runDemoCreatorAgent } from "./DemoCreatorAgent";
import { runOnboarderAgent } from "./OnboarderAgent";
import { runPerformanceOptimizerAgent } from "./PerformanceOptimizerAgent";
import { runBillingChurnAgent, runDailyChurnScan } from "./BillingChurnAgent";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../apps/dashboard/lib/supabase/types";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

type MetaSwarmEvent =
  | "lead_hunt"
  | "demo_create"
  | "onboard_deploy"
  | "weekly_optimization"
  | "daily_churn_scan"
  | "payment_failed"
  | "subscription_deleted"
  | "trial_ending"
  | "health_score_drop"
  | "low_engagement";

interface MetaSwarmTrigger {
  event: MetaSwarmEvent;
  payload?: Record<string, unknown>;
  priority?: "critical" | "high" | "normal" | "low";
  scheduleFor?: string; // ISO timestamp for delayed execution
  retryAttempt?: number;
}

interface MetaSwarmRun {
  runId: string;
  event: MetaSwarmEvent;
  status: "running" | "completed" | "failed" | "queued";
  startedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  retryAttempt: number;
}

// ─── Run Queue ────────────────────────────────────────────

const runQueue: MetaSwarmTrigger[] = [];
let isProcessing = false;

// ─── Core Dispatch ────────────────────────────────────────

async function dispatchMetaEvent(trigger: MetaSwarmTrigger): Promise<{
  success: boolean;
  runId: string;
  result?: Record<string, unknown>;
  error?: string;
}> {
  const runId = `meta_${trigger.event}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Log run start
  await supabase.from("agent_runs").insert({
    run_id: runId,
    agent_type: `meta_${trigger.event}`,
    account_id: (trigger.payload?.accountId as string) ?? "system",
    status: "running",
    trigger_event: trigger.event,
    input_payload: trigger.payload as never,
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  const startTime = Date.now();

  try {
    let result: Record<string, unknown> = {};

    switch (trigger.event) {
      // ── Lead Acquisition ─────────────────────────────────
      case "lead_hunt": {
        const huntResult = await runLeadHunterAgent({
          targetMarkets: (trigger.payload?.targetMarkets as string[]) ?? undefined,
          tradeTypes: (trigger.payload?.tradeTypes as string[]) ?? undefined,
          huntDepth: (trigger.payload?.huntDepth as "quick" | "standard" | "deep") ?? "standard",
        });
        result = huntResult;

        // Auto-trigger demos for any high-score leads not yet processed
        await scheduleHighScoreLeadDemos();
        break;
      }

      // ── Demo Creation ─────────────────────────────────────
      case "demo_create": {
        if (!trigger.payload?.leadId) {
          throw new Error("demo_create requires payload.leadId");
        }
        const demoResult = await runDemoCreatorAgent({
          leadId: trigger.payload.leadId as string,
          businessName: trigger.payload.businessName as string,
          ownerName: trigger.payload.ownerName as string,
          tradeType: trigger.payload.tradeType as string,
          painPoints: (trigger.payload.painPoints as string[]) ?? [],
          personalizedHook: trigger.payload.personalizedHook as string,
          phone: trigger.payload.phone as string,
          email: trigger.payload.email as string,
          location: trigger.payload.location as string,
        });
        result = demoResult;
        break;
      }

      // ── Customer Onboarding ───────────────────────────────
      case "onboard_deploy": {
        const onboardResult = await runOnboarderAgent({
          accountId: trigger.payload?.accountId as string,
          stripeCustomerId: trigger.payload?.stripeCustomerId as string,
          stripeSessionId: trigger.payload?.stripeSessionId as string,
          ownerEmail: trigger.payload?.ownerEmail as string,
          ownerName: trigger.payload?.ownerName as string,
          businessName: trigger.payload?.businessName as string,
          tradeType: trigger.payload?.tradeType as string,
          teamSize: trigger.payload?.teamSize as string,
          phone: trigger.payload?.phone as string,
          plan: (trigger.payload?.planTier as "basic" | "pro") ?? "basic",
          timezone: trigger.payload?.timezone as string,
          googleCalendarConnected: trigger.payload?.googleCalendarConnected as boolean,
          quickbooksConnected: trigger.payload?.quickbooksConnected as boolean,
          smsOptIn: trigger.payload?.smsOptIn as boolean,
          city: trigger.payload?.city as string,
          state: trigger.payload?.state as string,
        });
        result = onboardResult;
        break;
      }

      // ── Weekly Performance Optimization ───────────────────
      case "weekly_optimization": {
        const perfResult = await runPerformanceOptimizerAgent();
        result = perfResult;
        break;
      }

      // ── Daily Churn Prevention Scan ───────────────────────
      case "daily_churn_scan": {
        const scanResult = await runDailyChurnScan();
        result = scanResult;
        break;
      }

      // ── Billing/Churn Interventions (Stripe-triggered) ────
      case "payment_failed":
      case "subscription_deleted":
      case "trial_ending":
      case "health_score_drop":
      case "low_engagement": {
        const churnResult = await runBillingChurnAgent({
          accountId: trigger.payload?.accountId as string,
          triggerType: trigger.event as
            | "payment_failed"
            | "subscription_deleted"
            | "trial_ending"
            | "low_engagement"
            | "health_score_drop",
          stripeCustomerId: trigger.payload?.stripeCustomerId as string,
          invoiceId: trigger.payload?.invoiceId as string,
          trialEnd: trigger.payload?.trialEnd as number,
        });
        result = churnResult;
        break;
      }

      default:
        throw new Error(`Unknown meta event: ${trigger.event}`);
    }

    const durationMs = Date.now() - startTime;

    // Log success
    await supabase.from("agent_runs").update({
      status: "completed",
      output_summary: JSON.stringify(result).slice(0, 500),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    }).eq("run_id", runId);

    console.log(`[MetaSwarm] ✅ ${trigger.event} completed in ${durationMs}ms`, result);
    return { success: true, runId, result };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    // Log failure
    await supabase.from("agent_runs").update({
      status: "failed",
      error_message: error,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    }).eq("run_id", runId);

    console.error(`[MetaSwarm] ❌ ${trigger.event} failed:`, error);

    // Auto-retry for transient failures (max 3 attempts)
    const retryAttempt = (trigger.retryAttempt ?? 0) + 1;
    if (retryAttempt <= 3 && isTransientError(error)) {
      const delayMs = retryAttempt * 5000;
      console.log(`[MetaSwarm] Retrying ${trigger.event} in ${delayMs}ms (attempt ${retryAttempt})`);
      setTimeout(() => {
        runQueue.push({ ...trigger, retryAttempt });
        processQueue();
      }, delayMs);
    }

    return { success: false, runId, error };
  }
}

function isTransientError(error: string): boolean {
  const transientPatterns = ["ECONNRESET", "ETIMEDOUT", "503", "502", "network", "timeout", "fetch failed"];
  return transientPatterns.some((p) => error.toLowerCase().includes(p));
}

// ─── Queue Processing ─────────────────────────────────────

async function processQueue(): Promise<void> {
  if (isProcessing || runQueue.length === 0) return;

  isProcessing = true;
  while (runQueue.length > 0) {
    const trigger = runQueue.shift()!;

    // Handle scheduled triggers
    if (trigger.scheduleFor) {
      const delay = new Date(trigger.scheduleFor).getTime() - Date.now();
      if (delay > 0) {
        setTimeout(() => {
          runQueue.push({ ...trigger, scheduleFor: undefined });
          processQueue();
        }, delay);
        continue;
      }
    }

    await dispatchMetaEvent(trigger);
  }
  isProcessing = false;
}

// ─── Helper: Schedule demos for high-score unprocessed leads ─

async function scheduleHighScoreLeadDemos(): Promise<void> {
  const { data: leads } = await supabase
    .from("meta_leads")
    .select("id, business_name, owner_name, trade_type, pain_points, personalized_hook, phone, email, location")
    .eq("status", "new")
    .gte("lead_score", 70)
    .limit(10);

  for (const lead of leads ?? []) {
    runQueue.push({
      event: "demo_create",
      payload: {
        leadId: lead.id,
        businessName: lead.business_name,
        ownerName: lead.owner_name,
        tradeType: lead.trade_type,
        painPoints: lead.pain_points,
        personalizedHook: lead.personalized_hook,
        phone: lead.phone,
        email: lead.email,
        location: lead.location,
      },
      priority: "high",
    });
  }

  await processQueue();
}

// ─── Express Server ───────────────────────────────────────

const app = express();
app.use(express.json());

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.AGENT_API_SECRET;

  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// POST /meta-swarm/trigger — Main trigger endpoint
app.post("/meta-swarm/trigger", requireAuth, async (req, res) => {
  const body = req.body as MetaSwarmTrigger;

  if (!body.event) {
    return res.status(400).json({ error: "event is required" });
  }

  // High priority runs execute immediately; others go to queue
  if (body.priority === "critical" || body.priority === "high") {
    const result = await dispatchMetaEvent(body);
    return res.json(result);
  }

  // Queue normal priority
  const queueId = `q_${Date.now()}`;
  runQueue.push(body);
  processQueue().catch(console.error);

  return res.json({ queued: true, queueId, position: runQueue.length });
});

// POST /crews/trigger — Shared endpoint used by dashboard + Stripe webhooks
app.post("/crews/trigger", requireAuth, async (req, res) => {
  const { accountId, event, payload, planTier } = req.body as {
    accountId?: string;
    event: string;
    payload?: Record<string, unknown>;
    planTier?: string;
  };

  // Route meta-swarm events
  const metaEvents = new Set([
    "lead_hunt", "demo_create", "onboard_deploy", "weekly_optimization",
    "daily_churn_scan", "payment_failed", "subscription_deleted",
    "trial_ending", "health_score_drop", "low_engagement",
    "onboarder", "billing_churn_preventer",
  ]);

  if (metaEvents.has(event)) {
    const normalizedEvent = event === "onboarder" ? "onboard_deploy" :
      event === "billing_churn_preventer" ? (payload?.event as MetaSwarmEvent ?? "payment_failed") :
      event as MetaSwarmEvent;

    const result = await dispatchMetaEvent({
      event: normalizedEvent,
      payload: { accountId, planTier, ...payload },
      priority: ["payment_failed", "onboard_deploy"].includes(normalizedEvent) ? "high" : "normal",
    });

    return res.json(result);
  }

  // Route to CustomerCrewOrchestrator for customer-crew events
  // (handled by a separate service in the agent-api)
  return res.json({ routed: "customer_crew", event, accountId });
});

// GET /health — root health check (Railway proxy)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    queueDepth: runQueue.length,
    isProcessing,
    timestamp: new Date().toISOString(),
  });
});

// GET /meta-swarm/health
app.get("/meta-swarm/health", (req, res) => {
  res.json({
    status: "healthy",
    queueDepth: runQueue.length,
    isProcessing,
    timestamp: new Date().toISOString(),
  });
});

// GET /meta-swarm/runs — Recent run history
app.get("/meta-swarm/runs", requireAuth, async (req, res) => {
  const { data } = await supabase
    .from("agent_runs")
    .select("run_id, agent_type, status, started_at, completed_at, duration_ms, error_message")
    .like("agent_type", "meta_%")
    .order("started_at", { ascending: false })
    .limit(50);

  res.json({ runs: data ?? [] });
});

// ─── Scheduled Job Setup ──────────────────────────────────

function setupScheduledJobs(): void {
  // Lead hunt: every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    runQueue.push({ event: "lead_hunt", priority: "normal" });
    processQueue().catch(console.error);
  }, SIX_HOURS);

  // Daily churn scan: every 24 hours at 9 AM
  const now = new Date();
  const next9am = new Date(now);
  next9am.setHours(9, 0, 0, 0);
  if (next9am <= now) next9am.setDate(next9am.getDate() + 1);
  setTimeout(() => {
    runQueue.push({ event: "daily_churn_scan", priority: "normal" });
    processQueue().catch(console.error);
    // Then repeat every 24h
    setInterval(() => {
      runQueue.push({ event: "daily_churn_scan", priority: "normal" });
      processQueue().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, next9am.getTime() - now.getTime());

  // Weekly optimization: Sundays at 3 AM UTC
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const nextSunday3am = getNextSunday3am();
  setTimeout(() => {
    runQueue.push({ event: "weekly_optimization", priority: "low" });
    processQueue().catch(console.error);
    setInterval(() => {
      runQueue.push({ event: "weekly_optimization", priority: "low" });
      processQueue().catch(console.error);
    }, WEEK_MS);
  }, nextSunday3am.getTime() - now.getTime());

  console.log("[MetaSwarm] Scheduled jobs initialized");
  console.log(`  - Lead hunt: every 6 hours`);
  console.log(`  - Daily churn scan: daily at 9 AM`);
  console.log(`  - Weekly optimization: Sundays at 3 AM UTC`);
}

function getNextSunday3am(): Date {
  const d = new Date();
  const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setUTCHours(3, 0, 0, 0);
  return d;
}

// ─── Start Server ─────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? process.env.AGENT_API_PORT ?? "3001", 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[MetaSwarm] 🚀 TitanCrew MetaSwarm Orchestrator running on port ${PORT}`);
    setupScheduledJobs();

    // Initial lead hunt on startup (with 30s delay)
    setTimeout(() => {
      runQueue.push({ event: "lead_hunt", priority: "low", payload: { huntDepth: "quick" } });
      processQueue().catch(console.error);
    }, 30_000);
  });
}

export { app, dispatchMetaEvent };
export default app;
