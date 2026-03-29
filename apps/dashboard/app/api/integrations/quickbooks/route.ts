// @ts-nocheck
/**
 * TitanCrew — QuickBooks Online OAuth Routes
 *
 * GET /api/integrations/quickbooks/start     → redirect to Intuit OAuth
 * GET /api/integrations/quickbooks/callback  → exchange code + realmId
 * POST /api/integrations/quickbooks/disconnect → clear tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getQBOAuthUrl, exchangeQBOCode } from "@titancrew/agents/src/tools/integrations/QuickBooksAdapter";

export async function GET(req: NextRequest) {
  const { pathname, searchParams } = new URL(req.url);

  // /start
  if (pathname.endsWith("/start")) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) return NextResponse.redirect(new URL("/onboarding", req.url));

    const authUrl = getQBOAuthUrl(account.id);
    return NextResponse.redirect(authUrl);
  }

  // /callback
  if (pathname.endsWith("/callback")) {
    const code = searchParams.get("code");
    const realmId = searchParams.get("realmId");
    const state = searchParams.get("state"); // accountId
    const error = searchParams.get("error");

    if (error || !code || !realmId || !state) {
      return NextResponse.redirect(
        new URL(`/integrations?error=quickbooks&msg=${error ?? "cancelled"}`, req.url)
      );
    }

    try {
      const result = await exchangeQBOCode(code, realmId, state);
      if (!result.success) {
        return NextResponse.redirect(new URL("/integrations?error=quickbooks&msg=token_exchange_failed", req.url));
      }

      return NextResponse.redirect(new URL("/integrations?success=quickbooks", req.url));
    } catch (err) {
      console.error("[QBO OAuth]", err);
      return NextResponse.redirect(new URL("/integrations?error=quickbooks&msg=unexpected", req.url));
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id, qbo_access_token")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Revoke QBO token
  if (account.qbo_access_token) {
    const credentials = Buffer.from(
      `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
    ).toString("base64");

    await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({ token: account.qbo_access_token }).toString(),
    }).catch(() => {});
  }

  await supabase.from("accounts").update({
    qbo_access_token: null,
    qbo_refresh_token: null,
    qbo_realm_id: null,
    qbo_token_expires_at: null,
    qbo_connected_at: null,
  }).eq("id", account.id);

  return NextResponse.json({ success: true });
}
