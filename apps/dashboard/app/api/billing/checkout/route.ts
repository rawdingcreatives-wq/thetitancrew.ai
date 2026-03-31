// @ts-nocheck
/**
 * TitanCrew — Stripe Checkout Session Creator
 *
 * POST /api/billing/checkout
 * Body: { planKey: "basic" | "pro" | "elite" }
 *
 * Creates a Stripe Checkout Session for the given plan and returns the
 * checkout URL. The client redirects the user to that URL.
 *
 * On success Stripe redirects to: /billing/success?session_id={id}
 * On cancel  Stripe redirects to: /pricing
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const APP_URL          = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY  ?? "";

// Stripe Price IDs — set these in your Vercel env vars after creating products in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  basic: process.env.STRIPE_BASIC_PRICE_ID ?? process.env.STRIPE_PRICE_BASIC ?? "",
  pro:   process.env.STRIPE_PRO_PRICE_ID   ?? process.env.STRIPE_PRICE_PRO   ?? "",
  elite: process.env.STRIPE_ELITE_PRICE_ID ?? process.env.STRIPE_PRICE_ELITE ?? "",
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

  let planKey = "basic";
  try {
    const body = await req.json();
    planKey = body.planKey ?? "basic";
  } catch { /* use default */ }

  if (!["basic", "pro", "elite"].includes(planKey)) {
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
    .single();

  try {
    // Create Stripe Checkout Session via REST API (no Stripe SDK dependency needed)
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: user.email ?? "",
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`,
      cancel_url:  `${APP_URL}/pricing?cancelled=1`,
      "subscription_data[metadata][account_id]": account?.id ?? "",
      "subscription_data[metadata][plan]":       planKey,
      "metadata[account_id]": account?.id ?? "",
      "metadata[plan]":       planKey,
      allow_promotion_codes: "true",
    });

    // If we already have a Stripe customer ID, attach it
    if (account?.stripe_customer_id) {
      body.set("customer", account.stripe_customer_id);
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
      console.error("[Stripe Checkout]", err);
      return NextResponse.json({ error: "Stripe error", detail: err?.error?.message }, { status: 502 });
    }

    const session = await stripeRes.json();
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[Billing Checkout]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
