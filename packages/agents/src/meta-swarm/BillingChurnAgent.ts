/**
 * TitanCrew · MetaSwarm — BillingChurnAgent (BillingChurnPreventer)
 *
 * Autonomous revenue retention engine. Fights churn before it happens.
 *
 * Triggered by:
 *   - Stripe webhook: invoice.payment_failed
 *   - Stripe webhook: customer.subscription.deleted
 *   - Stripe webhook: customer.subscription.trial_will_end
 *   - n8n cron: daily at 9:00 AM (checks accounts at risk)
 *   - MetaSwarmOrchestrator: health score drops below 40
 *
 * Intervention playbooks:
 *   PAYMENT FAILURE:
 *     - Hour 0: Friendly SMS "card issue, here's the link"
 *     - Day 2: Email with value reminder + payment link
 *     - Day 4: SMS from "founder" with personal offer
 *     - Day 7: Final notice — offer pause instead of cancel
 *
 *   TRIAL ENDING (3 days before):
 *     - Day -3: "What your crew did this week" value recap SMS
 *     - Day -1: Upgrade offer with 20% off first month
 *
 *   POST-CANCEL WIN-BACK:
 *     - Day 1: Personal "what went wrong?" SMS
 *     - Day 7: Feature update + comeback offer
 *     - Day 30: Final win-back attempt
 *
 *   LOW ENGAGEMENT (health score <40, no runs in 5+ days):
 *     - Immediate: Proactive check-in SMS
 *     - HIL if no response in 24h: escalate to founder
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

interface ChurnIntervention {
  accountId: string;
  triggerType:
    | "payment_failed"
    | "subscription_deleted"
    | "trial_ending"
    | "low_engagement"
    | "health_score_drop";
  stripeCustomerId?: string;
  invoiceId?: string;
  trialEnd?: number;
  daysIntoIntervention?: number;
}

interface AccountChurnRisk {
  accountId: string;
  businessName: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  plan: string;
  healthScore: number;
  mrr: number;
  daysSinceLastRun: number;
  subscriptionStatus: string;
  paymentFailures: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  riskReasons: string[];
}

// ─── Tool Definitions ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "get_account_churn_risk",
    description:
      "Get detailed churn risk profile for an account. Returns health score, last activity, payment history, and risk reasons.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        stripeCustomerId: { type: "string" },
      },
    },
  },
  {
    name: "scan_at_risk_accounts",
    description:
      "Scan all active accounts for churn risk signals: no agent runs in 5+ days, low health score, payment issues, trial ending soon.",
    input_schema: {
      type: "object" as const,
      properties: {
        riskThreshold: {
          type: "string",
          enum: ["critical", "high", "medium", "all"],
          description: "Minimum risk level to return",
        },
        limit: { type: "number", description: "Max accounts to return (default: 20)" },
      },
    },
  },
  {
    name: "get_account_value_summary",
    description:
      "Get a personalized value summary for an account: total jobs scheduled, invoices sent, revenue recovered, customers retained.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        periodDays: { type: "number", description: "Look back period (default: 30)" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "send_payment_recovery_sms",
    description:
      "Send a payment recovery SMS to an account owner. Tone: friendly and understanding, not threatening. Include direct Stripe payment link.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        phone: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        failureReason: { type: "string", description: "Card declined, expired, etc." },
        paymentLink: { type: "string" },
        attemptNumber: { type: "number", description: "1 = first attempt, 2 = follow-up, 3 = final" },
      },
      required: ["accountId", "phone", "ownerName"],
    },
  },
  {
    name: "send_value_recap_sms",
    description:
      "Send a personalized SMS showing what TitanCrew accomplished for this account — designed to remind them of the value before trial ends or as win-back.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        phone: { type: "string" },
        ownerName: { type: "string" },
        valueSummary: {
          type: "object",
          description: "Result from get_account_value_summary",
        },
        context: {
          type: "string",
          enum: ["trial_ending", "win_back", "re_engagement", "upsell"],
        },
      },
      required: ["accountId", "phone", "ownerName", "context"],
    },
  },
  {
    name: "send_win_back_offer",
    description:
      "Send a personalized win-back offer to a cancelled customer. Includes a limited-time discount or special offer.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        offerType: {
          type: "string",
          enum: ["20_percent_off", "free_month", "extended_trial", "pause_option"],
        },
        offerExpiresInDays: { type: "number" },
        cancelReason: { type: "string" },
      },
      required: ["accountId", "ownerName", "offerType"],
    },
  },
  {
    name: "send_proactive_checkin",
    description:
      "Send a proactive check-in to a low-engagement account. Asks if everything is okay and offers help.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        phone: { type: "string" },
        ownerName: { type: "string" },
        daysSinceLastRun: { type: "number" },
        businessName: { type: "string" },
      },
      required: ["accountId", "phone", "ownerName"],
    },
  },
  {
    name: "create_stripe_payment_link",
    description:
      "Create or retrieve a Stripe payment link for a failed subscription payment.",
    input_schema: {
      type: "object" as const,
      properties: {
        stripeCustomerId: { type: "string" },
        invoiceId: { type: "string" },
        offerDiscount: {
          type: "boolean",
          description: "Include a one-time discount coupon (for win-back scenarios)",
        },
        discountPercent: { type: "number" },
      },
      required: ["stripeCustomerId"],
    },
  },
  {
    name: "apply_stripe_discount",
    description:
      "Apply a one-time discount coupon to a Stripe subscription (for win-back or save offers).",
    input_schema: {
      type: "object" as const,
      properties: {
        stripeCustomerId: { type: "string" },
        discountPercent: { type: "number" },
        durationMonths: { type: "number" },
        couponCode: { type: "string" },
      },
      required: ["stripeCustomerId", "discountPercent"],
    },
  },
  {
    name: "pause_subscription",
    description:
      "Offer to pause (not cancel) a subscription for 1–3 months. Better than losing the customer entirely.",
    input_schema: {
      type: "object" as const,
      properties: {
        stripeCustomerId: { type: "string" },
        pauseMonths: { type: "number", description: "1, 2, or 3 months" },
        reason: { type: "string" },
      },
      required: ["stripeCustomerId", "pauseMonths"],
    },
  },
  {
    name: "log_churn_intervention",
    description:
      "Log this churn intervention attempt to the billing_events table for tracking and future analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        interventionType: { type: "string" },
        channel: { type: "string" },
        outcome: { type: "string", enum: ["sent", "failed", "converted", "no_response"] },
        details: { type: "object" },
      },
      required: ["accountId", "interventionType", "channel"],
    },
  },
  {
    name: "update_account_health_score",
    description:
      "Update the account health_score based on engagement, payments, and usage.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        newScore: { type: "number" },
        reason: { type: "string" },
      },
      required: ["accountId", "newScore"],
    },
  },
  {
    name: "escalate_to_founder",
    description:
      "Escalate a high-value at-risk account to the founder (Stephen) via SMS. Used for MRR >$500 accounts or critical churns.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string" },
        businessName: { type: "string" },
        mrr: { type: "number" },
        riskReason: { type: "string" },
        ownerPhone: { type: "string" },
        recommendedAction: { type: "string" },
      },
      required: ["accountId", "riskReason"],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "get_account_churn_risk": {
      const { accountId, stripeCustomerId } = toolInput as {
        accountId?: string;
        stripeCustomerId?: string;
      };

      const query = supabase.from("accounts").select(`
        id, business_name, phone, email, plan, health_score, mrr,
        subscription_status, stripe_customer_id, onboarded_at,
        owner_user_id, city, state
      `);

      if (accountId) query.eq("id", accountId);
      else if (stripeCustomerId) query.eq("stripe_customer_id", stripeCustomerId);

      const { data: account } = await query.single();
      if (!account) return { found: false };

      // Get last agent run
      const { data: lastRun } = await (supabase.from("agent_runs") as any)
        .select("created_at")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const daysSinceLastRun = lastRun
        ? Math.floor((Date.now() - new Date(lastRun.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Get payment failure count
      const { data: paymentFailures } = await (supabase.from("billing_events") as any)
        .select("id")
        .eq("account_id", account.id)
        .eq("event_type", "invoice.payment_failed")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const failureCount = paymentFailures?.length ?? 0;

      // Calculate risk
      const riskReasons: string[] = [];
      if (daysSinceLastRun > 7) riskReasons.push(`No activity in ${daysSinceLastRun} days`);
      if ((account.health_score ?? 100) < 50) riskReasons.push(`Low health score: ${account.health_score}`);
      if (failureCount > 0) riskReasons.push(`${failureCount} payment failure(s) in past 30 days`);
      if (account.subscription_status === "past_due") riskReasons.push("Subscription past due");
      if (account.subscription_status === "trialing" && daysSinceLastRun > 3) riskReasons.push("Trial with low engagement");

      const riskScore =
        (daysSinceLastRun > 14 ? 40 : daysSinceLastRun > 7 ? 20 : 0) +
        (failureCount * 25) +
        ((100 - (account.health_score ?? 100)) / 2);

      const riskLevel: AccountChurnRisk["riskLevel"] =
        riskScore >= 70 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : "low";

      return {
        found: true,
        accountId: account.id,
        businessName: account.business_name,
        phone: account.phone,
        email: account.email,
        plan: account.plan,
        healthScore: account.health_score,
        mrr: account.mrr,
        daysSinceLastRun,
        subscriptionStatus: account.subscription_status,
        paymentFailures: failureCount,
        riskLevel,
        riskReasons,
        riskScore: Math.round(riskScore),
      } as AccountChurnRisk;
    }

    case "scan_at_risk_accounts": {
      const { riskThreshold = "high", limit = 20 } = toolInput as {
        riskThreshold?: string;
        limit?: number;
      };

      // Find accounts with indicators of churn risk
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const trialEndingSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      const { data: accounts } = await (supabase.from("accounts") as any)
        .select("id, business_name, phone, email, plan, health_score, mrr, subscription_status")
        .in("subscription_status", ["active", "trialing", "past_due"])
        .or(`health_score.lt.50,subscription_status.eq.past_due`)
        .limit(limit);

      return { accounts: accounts ?? [], count: accounts?.length ?? 0 };
    }

    case "get_account_value_summary": {
      const { accountId, periodDays = 30 } = toolInput as {
        accountId: string;
        periodDays?: number;
      };

      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

      const [jobsResult, runsResult, commsResult] = await Promise.all([
        (supabase.from("jobs") as any)
          .select("id, amount, status, ai_booked")
          .eq("account_id", accountId)
          .gte("created_at", since),
        (supabase.from("agent_runs") as any)
          .select("id, agent_type, status")
          .eq("account_id", accountId)
          .gte("created_at", since),
        (supabase.from("comms_log") as any)
          .select("id, direction")
          .eq("account_id", accountId)
          .eq("direction", "outbound")
          .gte("created_at", since),
      ]);

      const jobs = jobsResult.data ?? [];
      const runs = runsResult.data ?? [];
      const comms = commsResult.data ?? [];

      const aiBookedJobs = jobs.filter((j: any) => j.ai_booked);
      const completedJobs = jobs.filter((j: any) => j.status === "completed" || j.status === "paid");
      const totalRevenue = completedJobs.reduce((s: number, j: any) => s + (j.amount ?? 0), 0);
      const aiRevenue = aiBookedJobs.filter((j: any) => j.status === "completed" || j.status === "paid")
        .reduce((s: number, j: any) => s + (j.amount ?? 0), 0);

      return {
        periodDays,
        totalJobs: jobs.length,
        aiBookedJobs: aiBookedJobs.length,
        completedJobs: completedJobs.length,
        totalRevenue,
        aiRevenue,
        agentRuns: runs.length,
        successfulRuns: runs.filter((r: any) => r.status === "completed").length,
        customerMessages: comms.length,
        estimatedTimeSaved: `~${Math.round(runs.length * 12)} minutes`,
      };
    }

    case "send_payment_recovery_sms": {
      const { accountId, phone, ownerName, businessName, paymentLink, attemptNumber = 1 } = toolInput as {
        accountId: string;
        phone: string;
        ownerName: string;
        businessName?: string;
        failureReason?: string;
        paymentLink?: string;
        attemptNumber?: number;
      };

      const firstName = ownerName.split(" ")[0];
      const link = paymentLink ?? `https://app.titancrew.ai/billing`;

      const messages: Record<number, string> = {
        1: `Hey ${firstName}, looks like your TitanCrew payment didn't go through — no worries, happens to everyone! Quick fix here: ${link}\nYour crew will be back online as soon as it's sorted. Reply STOP to opt out`,
        2: `${firstName}, just a reminder — your TitanCrew subscription is still on hold. Your crew is waiting to get back to work for ${businessName ?? "your business"}. Update your card here: ${link}`,
        3: `${firstName}, last notice — your TitanCrew access will end in 24 hours unless we sort out the payment. We'd hate to lose you! ${link} — Or reply PAUSE if you need a break instead.`,
      };

      const message = messages[attemptNumber] ?? messages[1];
      return await sendSMS(phone, message, accountId);
    }

    case "send_value_recap_sms": {
      const { accountId, phone, ownerName, valueSummary, context } = toolInput as {
        accountId: string;
        phone: string;
        ownerName: string;
        valueSummary?: {
          totalJobs?: number;
          aiBookedJobs?: number;
          aiRevenue?: number;
          customerMessages?: number;
          estimatedTimeSaved?: string;
        };
        context: string;
      };

      const firstName = ownerName.split(" ")[0];
      const vs = valueSummary ?? {};

      const contextMessages: Record<string, string> = {
        trial_ending: `${firstName}, your TitanCrew trial ends in 3 days. This month your crew: booked ${vs.aiBookedJobs ?? 0} jobs, sent ${vs.customerMessages ?? 0} follow-ups, saved you ~${vs.estimatedTimeSaved ?? "0 minutes"}. Keep your crew? https://app.titancrew.ai/upgrade`,
        win_back: `Hey ${firstName}! While you were with TitanCrew, your crew processed $${vs.aiRevenue ?? 0} in AI-booked revenue. We've made it even better since. Want to see? https://app.titancrew.ai/rejoin`,
        re_engagement: `${firstName}, your TitanCrew crew hasn't run in a few days. Everything okay? Your last month: ${vs.totalJobs ?? 0} jobs, ${vs.customerMessages ?? 0} customer messages. Need help? https://app.titancrew.ai`,
        upsell: `${firstName}, your crew has booked $${vs.aiRevenue ?? 0} in revenue this month! The Pro plan unlocks TechDispatch AI routing — could add 20% more jobs. Upgrade: https://app.titancrew.ai/upgrade`,
      };

      const message = contextMessages[context] ?? contextMessages.re_engagement;
      return await sendSMS(phone, message, accountId);
    }

    case "send_win_back_offer": {
      const { accountId, phone, email, ownerName, businessName, offerType, offerExpiresInDays = 7 } =
        toolInput as {
          accountId: string;
          phone?: string;
          email?: string;
          ownerName: string;
          businessName?: string;
          offerType: string;
          offerExpiresInDays?: number;
          cancelReason?: string;
        };

      const firstName = ownerName.split(" ")[0];
      const offerMessages: Record<string, string> = {
        "20_percent_off": `Hey ${firstName} — I've been thinking about ${businessName ?? "your business"}. We'd love to have you back. Here's 20% off your first 3 months: https://app.titancrew.ai/winback (expires in ${offerExpiresInDays} days)`,
        free_month: `${firstName}, miss your TitanCrew crew? I'm offering you a free month to come back — no strings attached. ${offerExpiresInDays} days left on this offer: https://app.titancrew.ai/winback`,
        pause_option: `${firstName}, what if instead of canceling you just paused for a month? We'll freeze your subscription and your crew is ready when you are. Reply PAUSE or: https://app.titancrew.ai/pause`,
      };

      const message = offerMessages[offerType] ?? offerMessages.free_month;
      const results: Record<string, unknown> = {};

      if (phone) results.sms = await sendSMS(phone, message, accountId);

      // Email win-back (more detailed)
      if (email) {
        const sendgridKey = process.env.SENDGRID_API_KEY;
        if (sendgridKey) {
          const emailResp = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sendgridKey}`,
            },
            body: JSON.stringify({
              to: [{ email, name: ownerName }],
              from: { email: "stephen@titancrew.ai", name: "Stephen from TitanCrew" },
              subject: `${firstName}, we'd love to have you back`,
              html: `<p>Hey ${firstName},</p><p>${message}</p><p>— Stephen</p>`,
            }),
          });
          results.email = { sent: emailResp.ok };
        }
      }

      return { sent: true, results, offerType };
    }

    case "send_proactive_checkin": {
      const { accountId, phone, ownerName, daysSinceLastRun, businessName } = toolInput as {
        accountId: string;
        phone: string;
        ownerName: string;
        daysSinceLastRun?: number;
        businessName?: string;
      };

      const firstName = ownerName.split(" ")[0];
      const message = `Hey ${firstName}, just checking in on ${businessName ?? "your business"} — noticed your TitanCrew hasn't run in ${daysSinceLastRun ?? "a few"} days. Everything okay? Need any help getting set up? Just reply here.`;

      return await sendSMS(phone, message, accountId);
    }

    case "create_stripe_payment_link": {
      const { stripeCustomerId, invoiceId, offerDiscount, discountPercent } = toolInput as {
        stripeCustomerId: string;
        invoiceId?: string;
        offerDiscount?: boolean;
        discountPercent?: number;
      };

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return { success: false, link: `https://app.titancrew.ai/billing` };

      // If we have an invoice ID, use the hosted invoice URL
      if (invoiceId) {
        const invoiceResp = await fetch(
          `https://api.stripe.com/v1/invoices/${invoiceId}`,
          { headers: { Authorization: `Bearer ${stripeKey}` } }
        );
        const invoice = (await invoiceResp.json()) as any;
        return { success: true, link: (invoice as any).hosted_invoice_url ?? `https://app.titancrew.ai/billing` };
      }

      // Otherwise, create a customer portal session
      const portalResp = await fetch(
        "https://api.stripe.com/v1/billing_portal/sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${stripeKey}`,
          },
          body: new URLSearchParams({
            customer: stripeCustomerId,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.titancrew.ai"}/billing`,
          }).toString(),
        }
      );
      const portal = (await portalResp.json()) as any;
      return { success: portalResp.ok, link: (portal as any).url ?? `https://app.titancrew.ai/billing` };
    }

    case "apply_stripe_discount": {
      const { stripeCustomerId, discountPercent, durationMonths = 3 } = toolInput as {
        stripeCustomerId: string;
        discountPercent: number;
        durationMonths?: number;
        couponCode?: string;
      };

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return { success: false, reason: "STRIPE_SECRET_KEY not set" };

      // Create a coupon
      const couponResp = await fetch("https://api.stripe.com/v1/coupons", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${stripeKey}`,
        },
        body: new URLSearchParams({
          percent_off: discountPercent.toString(),
          duration: "repeating",
          duration_in_months: durationMonths.toString(),
          name: `TitanCrew Win-Back ${discountPercent}%`,
        }).toString(),
      });
      const coupon = (await couponResp.json()) as any;

      if (!coupon.id) return { success: false, error: (coupon.error as any)?.message };

      // Apply to customer
      const custResp = await fetch(`https://api.stripe.com/v1/customers/${stripeCustomerId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${stripeKey}`,
        },
        body: new URLSearchParams({ coupon: (coupon as any).id }).toString(),
      });

      return { success: custResp.ok, couponId: (coupon as any).id, discountPercent, durationMonths };
    }

    case "pause_subscription": {
      const { stripeCustomerId, pauseMonths, reason } = toolInput as {
        stripeCustomerId: string;
        pauseMonths: number;
        reason?: string;
      };

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return { success: false };

      // Get active subscription
      const subsResp = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${stripeCustomerId}&status=active&limit=1`,
        { headers: { Authorization: `Bearer ${stripeKey}` } }
      );
      const subs = (await subsResp.json()) as any;
      const subId = (subs as any).data?.[0]?.id;

      if (!subId) return { success: false, reason: "No active subscription found" };

      const resumesAt = Math.floor(Date.now() / 1000) + pauseMonths * 30 * 24 * 60 * 60;

      const pauseResp = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${stripeKey}`,
        },
        body: new URLSearchParams({
          "pause_collection[behavior]": "void",
          "pause_collection[resumes_at]": resumesAt.toString(),
        }).toString(),
      });

      return { success: pauseResp.ok, resumesAt: new Date(resumesAt * 1000).toISOString() };
    }

    case "log_churn_intervention": {
      const { accountId, interventionType, channel, outcome, details } = toolInput as {
        accountId: string;
        interventionType: string;
        channel: string;
        outcome: string;
        details?: Record<string, unknown>;
      };

      const { error } = await supabase.from("billing_events").insert({
        account_id: accountId,
        event_type: `churn_intervention.${interventionType}`,
        payload: { channel, outcome, ...details } as never,
        agent_action: `churn_${interventionType}_${outcome}`,
        processed: true,
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      return { logged: !error };
    }

    case "update_account_health_score": {
      const { accountId, newScore, reason } = toolInput as {
        accountId: string;
        newScore: number;
        reason: string;
      };

      const clampedScore = Math.max(0, Math.min(100, newScore));
      const { error } = await (supabase.from("accounts") as any)
        .update({ health_score: clampedScore })
        .eq("id", accountId);

      await supabase.from("audit_log").insert({
        account_id: accountId,
        event_type: "health_score_updated",
        actor: "billing_churn_agent",
        details: { oldScore: null, newScore: clampedScore, reason },
        created_at: new Date().toISOString(),
      });

      return { updated: !error, newScore: clampedScore };
    }

    case "escalate_to_founder": {
      const { accountId, businessName, mrr, riskReason, ownerPhone, recommendedAction } = toolInput as {
        accountId: string;
        businessName: string;
        mrr?: number;
        riskReason: string;
        ownerPhone?: string;
        recommendedAction?: string;
      };

      const founderPhone = process.env.FOUNDER_PHONE;
      if (!founderPhone) return { escalated: false, reason: "FOUNDER_PHONE not set" };

      const message = `🚨 Churn Alert: ${businessName} (${accountId.slice(0, 8)}…) — $${mrr ?? 0}/mo at risk. Reason: ${riskReason}. ${ownerPhone ? `Their #: ${ownerPhone}` : ""} Recommended: ${recommendedAction ?? "Personal outreach"}`;

      const result = await sendSMS(founderPhone, message);
      return { escalated: true, result };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── SMS Helper ───────────────────────────────────────────

async function sendSMS(phone: string, message: string, accountId?: string): Promise<Record<string, unknown>> {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFrom) {
    return { sent: false, reason: "Twilio not configured" };
  }

  const formData = new URLSearchParams({ To: phone, From: twilioFrom, Body: message });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
      },
      body: formData.toString(),
    }
  );
  const data = await resp.json();

  // Log to comms_log
  if (accountId) {
    await supabase.from("comms_log").insert({
      account_id: accountId,
      direction: "outbound",
      channel: "sms",
      to_address: phone,
      from_address: twilioFrom,
      body: message,
      status: resp.ok ? "sent" : "failed",
      external_id: (data as any).sid,
      ai_generated: true,
      created_at: new Date().toISOString(),
    });
  }

  return { sent: resp.ok, sid: (data as any).sid };
}

// ─── Main Agent Loop ──────────────────────────────────────

export async function runBillingChurnAgent(ctx: ChurnIntervention): Promise<{
  interventionsSent: number;
  accountsSaved?: number;
  escalated: boolean;
}> {
  const systemPrompt = `You are BillingChurnAgent — TitanCrew's autonomous revenue retention engine.

YOUR MISSION: Fight churn before it happens. Every interaction must feel personal, empathetic, and valuable — never spammy or desperate.

TRIGGER CONTEXT:
${JSON.stringify(ctx, null, 2)}

PLAYBOOKS:

PAYMENT_FAILED:
  - Get account churn risk profile
  - Get account value summary (show them what they're keeping)
  - Create Stripe payment link
  - Send attempt-1 recovery SMS (friendly, "happens to everyone")
  - Log intervention
  - If MRR >$500 → escalate to founder too

SUBSCRIPTION_DELETED (win-back):
  - Get account churn risk profile
  - Get account value summary
  - Wait 4 hours (schedule via log), then:
  - Day 1: Send personal "what went wrong?" SMS
  - Day 7: Value recap + win-back offer (20% off)
  - Escalate to founder if MRR >$500

TRIAL_ENDING:
  - Get account value summary (what we've done during trial)
  - Send value recap SMS "here's what your crew did this week"
  - If low engagement during trial → send proactive checkin first
  - 24h before: send upgrade offer

LOW_ENGAGEMENT / HEALTH_SCORE_DROP:
  - Get account churn risk profile
  - Send proactive checkin SMS
  - Update health score in DB
  - If MRR >$300 → escalate to founder

CRITICAL RULES:
- NEVER send more than 3 SMS to any account in a 7-day period
- NEVER send SMS after 8 PM or before 8 AM in recipient's timezone
- Always log every intervention attempt
- Personalized hook ALWAYS > generic template
- Offer pause before cancel when possible

Be warm. Be human. Fight for every customer.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Handle this churn intervention. Trigger: ${ctx.triggerType}. Account: ${ctx.accountId ?? ctx.stripeCustomerId ?? "unknown"}. Execute the appropriate playbook now.`,
    },
  ];

  let interventionsSent = 0;
  let escalated = false;

  for (let turn = 0; turn < 20; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        const r = result as Record<string, unknown>;
        if (["send_payment_recovery_sms", "send_value_recap_sms", "send_win_back_offer", "send_proactive_checkin"].includes(block.name)) {
          if (r.sent) interventionsSent++;
        }
        if (block.name === "escalate_to_founder" && r.escalated) escalated = true;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return { interventionsSent, escalated };
}

// ─── Daily Scan Entry Point ───────────────────────────────

export async function runDailyChurnScan(): Promise<{
  accountsScanned: number;
  interventionsStarted: number;
}> {
  const { data: atRiskAccounts } = await (supabase.from("accounts") as any)
    .select("id, health_score, subscription_status, stripe_customer_id")
    .in("subscription_status", ["active", "trialing", "past_due"])
    .lt("health_score", 50)
    .limit(20);

  let interventionsStarted = 0;

  for (const account of atRiskAccounts ?? []) {
    const triggerType: ChurnIntervention["triggerType"] =
      account.subscription_status === "past_due" ? "payment_failed" : "low_engagement";

    await runBillingChurnAgent({
      accountId: account.id,
      triggerType,
      stripeCustomerId: account.stripe_customer_id ?? undefined,
    });
    interventionsStarted++;
  }

  return {
    accountsScanned: atRiskAccounts?.length ?? 0,
    interventionsStarted,
  };
}
