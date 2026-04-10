/**
 * TitanCrew — Stripe Checkout Session Creator
 *
 * POST /api/billing/checkout
 * Body: { planKey: "lite" | "growth" | "scale" }
 *
 * Creates a Stripe Checkout Session for the given plan and returns the
 * checkout URL. The client redirects the user to that URL.
 *
 * On success Stripe redirects to: /billing/success?session_id={id}
 * On cancel  Stripe redirects to: /pricing
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("billing-checkout");

interface Account {
  id: string;
  stripe_customer_id?: string;
  business_name?: string;
}

const APP_URL          = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY  ?? "";

// Stripe Price IDs — set these in your Vercel env vars after creating products in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  lite:   process.env.STRIPE_LITE_PRICE_ID   ?? process.env.STRIPE_PRICE_LITE   ?? "",
  growth: process.env.STRIPE_GROWTH_PRICE_ID ?? process.env.STRIPE_PRICE_GROWTH ?? "",
  scale:  process.env.STRIPE_SCALE_PRICE_ID  ?? process.env.STRIPE_PRICE_SCALE  ?? "",
};

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured", hint: "Set STRIPE_SECRET_KEY in environment variables" },
      { status: 503 }
    );
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let planKey = "lite";
  try {
    const body = await req.json();
    planKey = body.planKey ?? "lite";
  } catch { /* use default */ }

  if (!["lite", "growth", "scale"].includes(planKey)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = PRICE_IDS[planKey];
  if (!priceId) {
    return NextResponse.json(
      {
        error: "Price ID not configured",
        hint: `Set STRIPE_PRICE_${planKey.toUpperCase()} in environment variables`,
      },
      { status: 503 }
    );
  }

  // Get or look up Stripe customer ID
  const { data: account } = await supabase
    .from("accounts")
    .select("id, stripe_customer_id, business_name")
    .eq("owner_user_id", user.id)
    .single() as { data: Account | null };

  try {
    // Create Stripe Checkout Session via REST API (no Stripe SDK dependency needed)
    const accountTyped = account as Account | null;
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: user.email ?? "",
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`,
      cancel_url:  `${APP_URL}/pricing?cancelled=1`,
      "subscription_data[metadata][account_id]": accountTyped?.id ?? "",
      "subscription_data[metadata][plan]":       planKey,
      "metadata[account_id]": accountTyped?.id ?? "",
      "metadata[plan]":       planKey,
      allow_promotion_codes: "true",
    });

    // If we already have a Stripe customer ID, attach it
    if (accountTyped?.stripe_customer_id) {
      body.set("customer", accountTyped.stripe_customer_id);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json();
      log.error({ event: "stripe_error", err: String(err) }, "Stripe error");
      return NextResponse.json({ error: "Stripe error", detail: err?.error?.message }, { status: 502 });
    }

    const session = await stripeRes.json();
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    log.error({ event: "unhandled_error", err: String(err) }, "Unhandled error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
