// @ts-nocheck
/**
 * TitanCrew — QuickBooks Online OAuth Route
 *
 * GET /api/integrations/quickbooks?action=start    → redirect to Intuit OAuth
 * GET /api/integrations/quickbooks?action=callback → exchange code + realmId, save tokens
 * POST /api/integrations/quickbooks                → disconnect (revoke + clear tokens)
 *
 * FIX: Same fix as Google Calendar — switched to ?action= params from pathname checks.
 * State encodes { accountId, returnTo } so user lands back in the right place.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI    = `${APP_URL}/api/integrations/quickbooks?action=callback`;
const QBO_CLIENT_ID   = process.env.QBO_CLIENT_ID     ?? "";
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET ?? "";
const QBO_ENV         = process.env.QBO_ENV ?? "production"; // "sandbox" | "production"

const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_AUTH_URL  = "https://appcenter.intuit.com/connect/oauth2";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildQBOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     QBO_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "com.intuit.quickbooks.accounting",
    state,
  });
  return `${QBO_AUTH_URL}?${params}`;
}

async function exchangeQBOCode(code: string, realmId: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
} | null> {
  try {
    const credentials = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(QBO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
        "Accept":        "application/json",
      },
      body: new URLSearchParams({
        code,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, realmId };
  } catch {
    return null;
  }
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // ── action=start ───────────────────────────────────────────────────────────
  if (action === "start") {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) return NextResponse.redirect(new URL("/onboarding", req.url));

    const returnTo = searchParams.get("returnTo") ?? "/onboarding";
    const state = Buffer.from(JSON.stringify({ accountId: account.id, returnTo })).toString("base64url");

    if (!QBO_CLIENT_ID) {
      return NextResponse.redirect(
        new URL(`${returnTo}?qbo=error&msg=not_configured`, req.url)
      );
    }

    return NextResponse.redirect(buildQBOAuthUrl(state));
  }

  // ── action=callback ────────────────────────────────────────────────────────
  if (action === "callback") {
    const code    = searchParams.get("code");
    const realmId = searchParams.get("realmId");
    const state   = searchParams.get("state");
    const error   = searchParams.get("error");

    let accountId = "";
    let returnTo  = "/onboarding";
    try {
      const decoded = JSON.parse(Buffer.from(state ?? "", "base64url").toString());
      accountId = decoded.accountId ?? "";
      returnTo  = decoded.returnTo  ?? "/onboarding";
    } catch { /* ignore */ }

    if (error || !code || !realmId || !accountId) {
      return NextResponse.redirect(
        new URL(`${returnTo}?qbo=error&msg=${error ?? "cancelled"}`, req.url)
      );
    }

    try {
      const tokens = await exchangeQBOCode(code, realmId);
      if (!tokens?.access_token) {
        return NextResponse.redirect(new URL(`${returnTo}?qbo=error&msg=token_failed`, req.url));
      }

      const supabase = await createServerClient();
      await supabase.from("accounts").update({
        qbo_access_token:    tokens.access_token,
        qbo_refresh_token:   tokens.refresh_token,
        qbo_realm_id:        realmId,
        qbo_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        qbo_connected_at:    new Date().toISOString(),
      }).eq("id", accountId);

      return NextResponse.redirect(new URL(`${returnTo}?qbo=connected`, req.url));
    } catch (err) {
      console.error("[QBO OAuth callback]", err);
      return NextResponse.redirect(new URL(`${returnTo}?qbo=error&msg=unexpected`, req.url));
    }
  }

  return NextResponse.json({ error: "Missing or invalid action param" }, { status: 400 });
}

// ─── POST handler — disconnect ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id, qbo_access_token, qbo_refresh_token")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Best-effort QBO token revocation
  const tokenToRevoke = account.qbo_refresh_token ?? account.qbo_access_token;
  if (tokenToRevoke && QBO_CLIENT_ID && QBO_CLIENT_SECRET) {
    const credentials = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString("base64");
    await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({ token: tokenToRevoke }),
    }).catch(() => {});
  }

  await supabase.from("accounts").update({
    qbo_access_token:    null,
    qbo_refresh_token:   null,
    qbo_realm_id:        null,
    qbo_token_expires_at: null,
    qbo_connected_at:    null,
  }).eq("id", account.id);

  return NextResponse.json({ success: true });
}
