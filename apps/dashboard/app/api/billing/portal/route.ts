// @ts-nocheck
/**
 * TitanCrew Â· Stripe Customer Portal Route
 *
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session so customers can:
 *  - Upgrade / downgrade their plan
 *  - Update payment method
 *  - View invoice history
 *  - Cancel subscription
 *
 * Returns: { url: string } â redirect the customer to this URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  // ââ Auth âââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ââ Get account & Stripe customer ID âââââââââââââââââââââââââ
  const { data: account } = await supabase
    .from("accounts")
    .select("id, stripe_customer_id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe first." },
      { status: 400 }
    );
  }

  // ââ Create Stripe Billing Portal session âââââââââââââââââââââ
  try {
    const body = new URLSearchParams({
      customer: account.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    });

    const res = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("[Stripe Portal] Error:", err);
      return NextResponse.json(
        { error: "Failed to create billing portal session" },
        { status: 500 }
      );
    }

    const session = await res.json();
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe Portal] Exception:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
