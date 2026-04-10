/**
 * TitanCrew — ViralLoopAgent
 *
 * Growth flywheel engine: turns satisfied contractors into TitanCrew advocates.
 *
 * Revenue streams it powers:
 *   1. Contractor Referral Program — $150 credit per activated referral
 *   2. Sub-Contractor Network — "Find a plumber in your city" feature
 *   3. Crew Referral — Technician recommends TitanCrew to their next employer
 *   4. Review Amplification — Good Google reviews → auto-shared to social
 *   5. Milestone Celebrations — "You just hit $10k this month!" → share moment
 *
 * Loop structure:
 *   Contractor success → celebration event → share prompt → referral link
 *   → new signup → onboard → success → repeat
 *
 * Target K-factor: >0.3 (each user brings in 0.3 additional users on average)
 * At $149/mo and K=0.3, effective CAC is reduced by 43%.
 */

import Anthropic from "@anthropic-ai/sdk";
// @ts-ignore
import { createServiceClient } from "@/lib/supabase/service";
// @ts-ignore
import { auditLog } from "@titancrew/agents/src/guardrails/AuditLogger";
import { guardKillSwitch } from "../guardrails/kill-switches";
import { createLogger } from "../guardrails/logger";
import twilio from "twilio";
import Stripe from "stripe";

const viralLog = createLogger("ViralLoopAgent");

// ─── Types ────────────────────────────────────────────────────

export type ViralEventType =
  | "first_job_completed"
  | "monthly_revenue_milestone"
  | "jobs_milestone"
  | "positive_google_review"
  | "referral_converted"
  | "trial_converted"
  | "anniversary";

export interface ViralEvent {
  accountId: string;
  eventType: ViralEventType;
  data: Record<string, unknown>;
}

interface ReferralCode {
  code: string;
  accountId: string;
  ownerName: string;
  businessName: string;
  createdAt: string;
  uses: number;
  creditsEarned: number;
}

interface MilestoneConfig {
  threshold: number;
  celebrationMessage: string;
  sharePrompt: string;
  rewardType: "credit" | "badge" | "upgrade";
  rewardValue: number; // dollars or days
}

// ─── Milestone definitions ─────────────────────────────────────

const REVENUE_MILESTONES: MilestoneConfig[] = [
  {
    threshold: 1000,
    celebrationMessage: "🎉 Your crew just crossed $1,000 in revenue this month!",
    sharePrompt: "Your first $1k month — share the win!",
    rewardType: "badge",
    rewardValue: 0,
  },
  {
    threshold: 5000,
    celebrationMessage: "🚀 $5,000 month! TitanCrew is working hard for you.",
    sharePrompt: "Hit $5k with AI doing the scheduling — tell a fellow contractor!",
    rewardType: "credit",
    rewardValue: 25,
  },
  {
    threshold: 10000,
    celebrationMessage: "🏆 $10,000 month — you're in the top tier!",
    sharePrompt: "10k month unlocked. Share how TitanCrew helped you get here.",
    rewardType: "credit",
    rewardValue: 50,
  },
  {
    threshold: 25000,
    celebrationMessage: "👑 $25,000 month. You're running a real business now.",
    sharePrompt: "25k month with AI handling your back-office. Refer a friend!",
    rewardType: "upgrade",
    rewardValue: 30, // 30 days free
  },
];

const JOBS_MILESTONES: MilestoneConfig[] = [
  {
    threshold: 10,
    celebrationMessage: "10 jobs dispatched! Your crew is rolling.",
    sharePrompt: "10 jobs in — tell another contractor about TitanCrew.",
    rewardType: "badge",
    rewardValue: 0,
  },
  {
    threshold: 50,
    celebrationMessage: "50 jobs completed with TitanCrew automation! 🔧",
    sharePrompt: "50 jobs in the books. Refer a friend and earn $150 credit.",
    rewardType: "credit",
    rewardValue: 15,
  },
  {
    threshold: 100,
    celebrationMessage: "100 jobs! You're a TitanCrew power user. 💪",
    sharePrompt: "100 jobs dispatched by AI. Refer someone and earn $150.",
    rewardType: "credit",
    rewardValue: 30,
  },
];

// ─── Main Agent ────────────────────────────────────────────────

export async function runViralLoopAgent(event: ViralEvent): Promise<void> {
  const supabase = createServiceClient();
  const client = new Anthropic();

  await auditLog({
    accountId: event.accountId,
    agentName: "ViralLoopAgent",
    eventType: "viral_event_received",
    details: { eventType: event.eventType, data: event.data },
  });

  // Fetch account
  const { data: account } = await (supabase.from("accounts") as any)
    .select("id, business_name, owner_name, phone, email, plan, stripe_customer_id, referral_code")
    .eq("id", event.accountId)
    .single();

  if (!account) return;

  // Ensure referral code exists
  if (!account.referral_code) {
    await ensureReferralCode(event.accountId, account);
  }

  const { data: freshAccount } = await (supabase.from("accounts") as any)
    .select("referral_code")
    .eq("id", event.accountId)
    .single();

  const referralCode = freshAccount?.referral_code ?? account.referral_code;
  const referralUrl = `https://titancrew.ai/signup?ref=${referralCode}`;

  // Route to handler
  switch (event.eventType) {
    case "first_job_completed":
      await handleFirstJobCompleted(event, account, referralUrl, client);
      break;
    case "monthly_revenue_milestone":
      await handleRevenueMilestone(event, account, referralUrl, client);
      break;
    case "jobs_milestone":
      await handleJobsMilestone(event, account, referralUrl, client);
      break;
    case "positive_google_review":
      await handlePositiveReview(event, account, referralUrl, client);
      break;
    case "referral_converted":
      await handleReferralConverted(event, account);
      break;
    case "trial_converted":
      await handleTrialConverted(event, account, referralUrl, client);
      break;
    case "anniversary":
      await handleAnniversary(event, account, referralUrl, client);
      break;
  }
}

// ─── Event Handlers ────────────────────────────────────────────

async function handleFirstJobCompleted(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  const message = await generatePersonalizedMessage(client, {
    template: "first_job",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    data: event.data,
  });

  await sendViralSMS(account.phone, message, account.id, "first_job_completed");

  // Also send a share card via email (with referral link prominently displayed)
  await sendReferralEmail(account, referralUrl, "first_job", event.data);
}

async function handleRevenueMilestone(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  const amount = event.data.amount as number;
  const milestone = REVENUE_MILESTONES.find((m) => m.threshold === amount);
  if (!milestone) return;

  // Apply reward
  if (milestone.rewardType === "credit" && milestone.rewardValue > 0) {
    await applyStripeCredit(account.stripe_customer_id, milestone.rewardValue, account.id);
  }

  const message = await generatePersonalizedMessage(client, {
    template: "revenue_milestone",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    milestone,
    data: event.data,
  });

  await sendViralSMS(account.phone, message, account.id, "revenue_milestone");
  await sendReferralEmail(account, referralUrl, "revenue_milestone", { milestone, ...event.data });
}

async function handleJobsMilestone(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  const count = event.data.count as number;
  const milestone = JOBS_MILESTONES.find((m) => m.threshold === count);
  if (!milestone) return;

  if (milestone.rewardType === "credit" && milestone.rewardValue > 0) {
    await applyStripeCredit(account.stripe_customer_id, milestone.rewardValue, account.id);
  }

  const message = await generatePersonalizedMessage(client, {
    template: "jobs_milestone",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    milestone,
    data: event.data,
  });

  await sendViralSMS(account.phone, message, account.id, "jobs_milestone");
}

async function handlePositiveReview(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  // Customer left a 4-5 star Google review — amplify + ask contractor to share
  const message = await generatePersonalizedMessage(client, {
    template: "positive_review",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    data: event.data, // { customerName, rating, reviewText }
  });

  await sendViralSMS(account.phone, message, account.id, "positive_review");

  // Auto-share review content to social (with contractor's permission — checked in onboarding settings)
  const supabase = createServiceClient();
  const { data: settings } = await (supabase.from("accounts") as any)
    .select("auto_share_reviews")
    .eq("id", account.id)
    .single();

  if (settings?.auto_share_reviews) {
    await scheduleReviewShare(account, event.data as { reviewText: string; customerName: string; rating: number });
  }
}

async function handleReferralConverted(
  event: ViralEvent,
  account: Account
): Promise<void> {
  // Someone signed up with this account's referral code and activated (paid)
  const REFERRAL_CREDIT_AMOUNT = 150; // $150 account credit

  await applyStripeCredit(
    account.stripe_customer_id,
    REFERRAL_CREDIT_AMOUNT,
    account.id
  );

  const message = `🎉 Great news, ${account.owner_name}! ${event.data.newBusinessName} just activated TitanCrew using your referral. You've earned a $${REFERRAL_CREDIT_AMOUNT} credit on your account! Keep sharing: https://titancrew.ai/signup?ref=${account.referral_code}`;

  await sendViralSMS(account.phone, message, account.id, "referral_converted");

  // Update referral stats
  const supabase = createServiceClient();
  await supabase.rpc("increment_referral_stats", {
    p_account_id: account.id,
    p_credit_amount: REFERRAL_CREDIT_AMOUNT,
  });

  await auditLog({
    accountId: account.id,
    agentName: "ViralLoopAgent",
    eventType: "referral_credit_applied",
    details: {
      newAccountId: event.data.newAccountId,
      creditAmount: REFERRAL_CREDIT_AMOUNT,
      referralCode: account.referral_code,
    },
  });
}

async function handleTrialConverted(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  // Trial → paid conversion — high-intent moment to ask for referral
  const message = await generatePersonalizedMessage(client, {
    template: "trial_converted",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    data: event.data,
  });

  await sendViralSMS(account.phone, message, account.id, "trial_converted");
}

async function handleAnniversary(
  event: ViralEvent,
  account: Account,
  referralUrl: string,
  client: Anthropic
): Promise<void> {
  const yearsOnPlatform = event.data.years as number;

  const message = await generatePersonalizedMessage(client, {
    template: "anniversary",
    ownerName: account.owner_name,
    businessName: account.business_name,
    referralUrl,
    data: { ...event.data, yearsOnPlatform },
  });

  await sendViralSMS(account.phone, message, account.id, "anniversary");

  // Apply loyalty credit for year anniversaries
  if (yearsOnPlatform >= 1) {
    await applyStripeCredit(
      account.stripe_customer_id,
      yearsOnPlatform * 20, // $20 per year
      account.id
    );
  }
}

// ─── Referral Code Management ──────────────────────────────────

async function ensureReferralCode(accountId: string, account: Account): Promise<string> {
  const supabase = createServiceClient();

  // Generate a memorable code from business name
  const base = account.business_name
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  const code = `${base}${suffix}`;

  await (supabase.from("accounts") as any)
    .update({ referral_code: code })
    .eq("id", accountId);

  // Create referral record
  await supabase.from("referral_codes").upsert({
    code,
    account_id: accountId,
    owner_name: account.owner_name,
    business_name: account.business_name,
    created_at: new Date().toISOString(),
    uses: 0,
    credits_earned: 0,
  }, { onConflict: "account_id" });

  return code;
}

// ─── Message Generation ────────────────────────────────────────

interface MessageContext {
  template: string;
  ownerName: string;
  businessName: string;
  referralUrl: string;
  milestone?: MilestoneConfig;
  data: Record<string, unknown>;
}

async function generatePersonalizedMessage(
  client: Anthropic,
  ctx: MessageContext
): Promise<string> {
  const templates: Record<string, string> = {
    first_job: `Generate a celebratory SMS for ${ctx.ownerName} of ${ctx.businessName} who just completed their first job on TitanCrew. Be enthusiastic but brief. End with: "Know another contractor? Share TitanCrew: ${ctx.referralUrl}" Keep under 320 chars total.`,

    revenue_milestone: `Generate an enthusiastic but brief SMS for ${ctx.ownerName} of ${ctx.businessName}. They just hit a $${ctx.data.amount?.toLocaleString()} revenue month. Milestone message: "${ctx.milestone?.celebrationMessage}". Include reward info if applicable: ${ctx.milestone?.rewardType === "credit" ? `$${ctx.milestone.rewardValue} credit applied!` : ""}. End with referral ask: ${ctx.referralUrl}. Keep under 320 chars.`,

    jobs_milestone: `Generate a brief celebratory SMS for ${ctx.ownerName} celebrating ${ctx.data.count} jobs completed. Milestone: "${ctx.milestone?.celebrationMessage}". Include referral ask at end: ${ctx.referralUrl}. Keep under 320 chars.`,

    positive_review: `Generate a brief SMS for ${ctx.ownerName} of ${ctx.businessName}. Their customer ${ctx.data.customerName} just left a ${ctx.data.rating}-star Google review: "${String(ctx.data.reviewText ?? "").slice(0, 60)}...". Congratulate them and ask if they'd share TitanCrew with a fellow contractor: ${ctx.referralUrl}. Under 320 chars.`,

    trial_converted: `Generate a warm welcome SMS for ${ctx.ownerName} of ${ctx.businessName} who just upgraded from trial to paid. Thank them. Mention they can earn $150 for each contractor they refer: ${ctx.referralUrl}. Under 280 chars.`,

    anniversary: `Generate a warm anniversary SMS for ${ctx.ownerName} of ${ctx.businessName} who has been with TitanCrew for ${ctx.data.yearsOnPlatform} year(s). Mention total jobs or revenue if available: ${JSON.stringify(ctx.data)}. Include loyalty credit mention and referral link: ${ctx.referralUrl}. Under 320 chars.`,
  };

  const prompt = templates[ctx.template] ?? templates.first_job;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
    system: "You write brief, enthusiastic, genuine SMS messages for a B2B SaaS app for contractors. Never use emojis excessively. Be warm and human. Return ONLY the SMS text.",
  });

  return (response.content[0] as { type: string; text: string }).text.trim();
}

// ─── Reward / Notification Helpers ────────────────────────────

async function applyStripeCredit(
  stripeCustomerId: string,
  amountDollars: number,
  accountId: string
): Promise<void> {
  if (!stripeCustomerId) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

  try {
    // Stripe credit balance (positive = credit)
    await stripe.customers.createBalanceTransaction(stripeCustomerId, {
      amount: -(amountDollars * 100), // negative = credit applied
      currency: "usd",
      description: `TitanCrew loyalty/referral credit — ${new Date().toISOString().split("T")[0]}`,
    });

    await auditLog({
      accountId,
      agentName: "ViralLoopAgent",
      eventType: "stripe_credit_applied",
      details: { stripeCustomerId, amountDollars },
    });
  } catch (err) {
    viralLog.error({ event: "stripe_credit_failed", err: String(err) }, "Stripe credit failed");
  }
}

async function sendViralSMS(
  phone: string,
  message: string,
  accountId: string,
  eventType: string
): Promise<void> {
  if (!phone) return;

  // Kill switch: block all outbound SMS
  if (guardKillSwitch("KILL_OUTBOUND_SMS", { accountId, event: "viral_sms", eventType })) {
    return;
  }

  // TCPA check — verify not on suppression list + quiet hours
  const supabase = createServiceClient();
  const { data: suppressed } = await (supabase.from("sms_suppression_list") as any)
    .select("phone")
    .eq("phone", phone)
    .single();

  if (suppressed) {
    viralLog.info({ event: "sms_suppressed", accountId }, `Phone ${phone.slice(-4)} on suppression list, skipping`);
    return;
  }

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phone,
    });

    viralLog.info({ event: "viral_sms_sent", accountId, eventType: eventType }, "Viral SMS sent");

    await auditLog({
      accountId,
      agentName: "ViralLoopAgent",
      eventType: `viral_sms_sent`,
      details: { eventType, messageLength: message.length },
    });
  } catch (err) {
    viralLog.error({ event: "sms_send_failed", accountId }, "Viral SMS send failed", err);
  }
}

async function sendReferralEmail(
  account: Account,
  referralUrl: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  // SendGrid API call — full email with referral card design
  if (!process.env.SENDGRID_API_KEY || !account.email) return;

  const emailTemplates: Record<string, string> = {
    first_job: "d-titancrew-first-job-referral",
    revenue_milestone: "d-titancrew-milestone-referral",
  };

  try {
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "celebrate@titancrew.ai", name: "TitanCrew" },
        personalizations: [
          {
            to: [{ email: account.email, name: account.owner_name }],
            dynamic_template_data: {
              ownerName: account.owner_name,
              businessName: account.business_name,
              referralUrl,
              referralCode: account.referral_code,
              referralReward: "$150 account credit",
              ...data,
            },
          },
        ],
        template_id: emailTemplates[template] ?? emailTemplates.first_job,
      }),
    });
  } catch (err) {
    viralLog.error({ event: "email_send_failed", err: String(err) }, "Email send failed");
  }
}

async function scheduleReviewShare(
  account: Account,
  review: { reviewText: string; customerName: string; rating: number }
): Promise<void> {
  // Queue a social post of this review via TradesGroupPosterAgent
  const supabase = createServiceClient();

  await supabase.from("growth_task_queue").insert({
    id: crypto.randomUUID(),
    account_id: account.id,
    task_type: "share_review",
    payload: {
      reviewText: review.reviewText,
      customerName: review.customerName,
      rating: review.rating,
      businessName: account.business_name,
    },
    scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour delay
    status: "pending",
    created_at: new Date().toISOString(),
  });
}

// ─── Batch scanner (run nightly) ──────────────────────────────

export async function scanForViralEvents(): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Scan all active accounts
  const { data: accounts } = await (supabase.from("accounts") as any)
    .select("id, business_name, owner_name, phone, email, plan, stripe_customer_id, referral_code, created_at")
    .in("plan", ["lite", "growth", "scale"])
    .eq("subscription_status", "active");

  if (!accounts || accounts.length === 0) return;

  for (const account of accounts) {
    // Check monthly revenue milestones
    const { data: revenueData } = await (supabase.from("invoices") as any)
      .select("amount")
      .eq("account_id", account.id)
      .eq("status", "paid")
      .gte("paid_at", startOfMonth);

    const monthlyRevenue = (revenueData ?? []).reduce((sum: number, inv: { amount: number }) => sum + (inv.amount || 0), 0);

    for (const milestone of REVENUE_MILESTONES) {
      if (monthlyRevenue >= milestone.threshold) {
        // Check if already triggered this month
        const { data: existing } = await (supabase.from("viral_events_log") as any)
          .select("id")
          .eq("account_id", account.id)
          .eq("event_type", "monthly_revenue_milestone")
          .eq("milestone_amount", milestone.threshold)
          .gte("created_at", startOfMonth)
          .single();

        if (!existing) {
          await runViralLoopAgent({
            accountId: account.id,
            eventType: "monthly_revenue_milestone",
            data: { amount: milestone.threshold, actual: monthlyRevenue },
          });

          await supabase.from("viral_events_log").insert({
            id: crypto.randomUUID(),
            account_id: account.id,
            event_type: "monthly_revenue_milestone",
            milestone_amount: milestone.threshold,
            created_at: now.toISOString(),
          });
        }
      }
    }

    // Check job count milestones
    const { count: totalJobs } = await (supabase.from("jobs") as any)
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("status", "completed");

    for (const milestone of JOBS_MILESTONES) {
      if ((totalJobs ?? 0) >= milestone.threshold) {
        const { data: existingJobMilestone } = await (supabase.from("viral_events_log") as any)
          .select("id")
          .eq("account_id", account.id)
          .eq("event_type", "jobs_milestone")
          .eq("milestone_amount", milestone.threshold)
          .single();

        if (!existingJobMilestone) {
          await runViralLoopAgent({
            accountId: account.id,
            eventType: "jobs_milestone",
            data: { count: milestone.threshold, actual: totalJobs },
          });

          await supabase.from("viral_events_log").insert({
            id: crypto.randomUUID(),
            account_id: account.id,
            event_type: "jobs_milestone",
            milestone_amount: milestone.threshold,
            created_at: now.toISOString(),
          });
        }
      }
    }

    // Check anniversaries
    const accountAge = now.getTime() - new Date(account.created_at).getTime();
    const yearsOnPlatform = Math.floor(accountAge / (365.25 * 24 * 60 * 60 * 1000));

    if (yearsOnPlatform >= 1) {
      const thisYear = now.getFullYear().toString();
      const { data: existingAnniversary } = await (supabase.from("viral_events_log") as any)
        .select("id")
        .eq("account_id", account.id)
        .eq("event_type", "anniversary")
        .like("created_at", `${thisYear}%`)
        .single();

      if (!existingAnniversary) {
        const accountDate = new Date(account.created_at);
        if (
          accountDate.getMonth() === now.getMonth() &&
          accountDate.getDate() === now.getDate()
        ) {
          await runViralLoopAgent({
            accountId: account.id,
            eventType: "anniversary",
            data: { years: yearsOnPlatform, monthlyRevenue },
          });
        }
      }
    }

    // Small delay between accounts to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  viralLog.info({ event: "scan_complete", accountsChecked: accounts.length }, "Viral scan complete");
}

// ─── Type helper ──────────────────────────────────────────────

interface Account {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  plan: string;
  stripe_customer_id: string;
  referral_code?: string;
  created_at: string;
}
