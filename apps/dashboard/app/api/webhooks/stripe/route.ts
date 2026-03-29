// @ts-nocheck
/**
 * TitanCrew · Stripe Webhook Handler
 * Processes subscription events: payment success, failure, cancellation.
 * Triggers the Billing/Churn Agent on relevant events.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Events we handle
const HANDLED_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.trial_will_end",
  "checkout.session.completed",
]);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, action: "ignored" });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      // ── New customer subscribes ─────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId = session.customer as string;
        const subId = session.subscription as string;
        const customerEmail = session.customer_details?.email;

        if (customerEmail) {
          await supabase.from("accounts").update({
            stripe_customer_id: customerId,
            stripe_sub_id: subId,
            subscription_status: "active",
          }).eq("email", customerEmail);
        }

        // Trigger Onboarder Agent
        await triggerAgent("onboarder", { stripeCustomerId: customerId, sessionId: session.id });
        break;
      }

      // ── Subscription status changes ──────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const planNickname = (sub.items.data[0]?.price?.nickname ?? "").toLowerCase();
        const plan = planNickname.includes("pro") ? "pro" : "basic";

        await supabase.from("accounts").update({
          subscription_status: sub.status as "active" | "trialing" | "past_due" | "canceled" | "paused",
          plan,
          stripe_sub_id: sub.id,
          mrr: (sub.items.data[0]?.price?.unit_amount ?? 0) / 100,
        }).eq("stripe_customer_id", sub.customer as string);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("accounts").update({
          subscription_status: "canceled",
        }).eq("stripe_customer_id", sub.customer as string);

        // Trigger Churn Agent with win-back flow
        await triggerAgent("billing_churn_preventer", {
          event: "subscription.deleted",
          stripeCustomerId: sub.customer,
        });
        break;
      }

      // ── Invoice paid ────────────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        await supabase.from("billing_events").insert({
          stripe_event_id: event.id,
          event_type: event.type,
          amount: (invoice.amount_paid ?? 0) / 100,
          currency: invoice.currency,
          payload: event.data.object as never,
          processed: true,
          processed_at: new Date().toISOString(),
          agent_action: "invoice_paid_recorded",
        }).select("id").single().then(async ({ data }) => {
          if (data) {
            // Link to account
            const { data: acct } = await supabase
              .from("accounts")
              .select("id")
              .eq("stripe_customer_id", stripeCustomerId)
              .single();

            if (acct) {
              await supabase.from("billing_events").update({ account_id: acct.id }).eq("id", data.id);
            }
          }
        });
        break;
      }

      // ── Payment failed → churn intervention ─────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        const { data: account } = await supabase
          .from("accounts")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();

        if (account) {
          await supabase.from("accounts").update({
            subscription_status: "past_due",
          }).eq("id", account.id);

          await supabase.from("billing_events").insert({
            account_id: account.id,
            stripe_event_id: event.id,
            event_type: event.type,
            amount: (invoice.amount_due ?? 0) / 100,
            currency: invoice.currency,
            payload: event.data.object as never,
          });
        }

        // Trigger Churn Agent
        await triggerAgent("billing_churn_preventer", {
          event: "payment_failed",
          stripeCustomerId,
          invoiceId: invoice.id,
        });
        break;
      }

      // ── Trial ending soon ────────────────────────────────────
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        await triggerAgent("billing_churn_preventer", {
          event: "trial_ending",
          stripeCustomerId: sub.customer,
          trialEnd: (sub as Stripe.Subscription & { trial_end: number | null }).trial_end,
        });
        break;
      }
    }

    return NextResponse.json({ received: true, event: event.type });
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: "Processing error", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── Internal helper ────────────────────────────────────

async function triggerAgent(agentType: string, payload: Record<string, unknown>) {
  const agentApiUrl = process.env.AGENT_API_URL;
  if (!agentApiUrl) return;

  try {
    await fetch(`${agentApiUrl}/crews/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AGENT_API_SECRET}`,
      },
      body: JSON.stringify({ event: agentType, payload }),
    });
  } catch (err) {
    console.error(`[Stripe Webhook] Agent trigger failed for ${agentType}:`, err);
  }
}
