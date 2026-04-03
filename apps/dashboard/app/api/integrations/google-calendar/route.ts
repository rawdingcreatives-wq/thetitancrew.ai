// @ts-nocheck
/**
 * TitanCrew — Google Calendar OAuth Route
 *
 * GET /api/integrations/google-calendar?action=start    → redirect to Google OAuth
 * GET /api/integrations/google-calendar?action=callback → exchange code, save tokens, return to caller
 * POST /api/integrations/google-calendar                → disconnect (revoke + clear tokens)
 *
 * FIX: Switched from pathname.endsWith("/start|callback") to ?action= params so the
 * single route.ts file handles all flows without needing sub-route files.
 * REDIRECT_URI now uses ?action=callback so Google routes back to this same file.
 * State encodes: { accountId, returnTo } so we can send the user back to wherever
 * they started the flow (onboarding or integrations page).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/integrations/google-calendar?action=callback`;

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar",
    access_type:   "offline",
    prompt:        "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
} | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action   = searchParams.get("action");

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

    // Encode accountId + return destination into state
    const returnTo = searchParams.get("returnTo") ?? "/onboarding";
    const state = Buffer.from(JSON.stringify({ accountId: account.id, returnTo })).toString("base64url");

    if (!GOOGLE_CLIENT_ID) {
      // Env var not set — bounce back with a helpful message
      return NextResponse.redirect(
        new URL(`${returnTo}?calendar=error&msg=not_configured`, req.url)
      );
    }

    return NextResponse.redirect(buildGoogleAuthUrl(state));
  }

  // ── action=callback ────────────────────────────────────────────────────────
  if (action === "callback") {
    const code  = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Decode state
    let accountId = "";
    let returnTo  = "/onboarding";
    try {
      const decoded = JSON.parse(Buffer.from(state ?? "", "base64url").toString());
      accountId = decoded.accountId ?? "";
      returnTo  = decoded.returnTo  ?? "/onboarding";
    } catch { /* ignore — malformed state */ }

    if (error || !code || !accountId) {
      return NextResponse.redirect(
        new URL(`${returnTo}?calendar=error&msg=${error ?? "cancelled"}`, req.url)
      );
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      if (!tokens?.access_token) {
        return NextResponse.redirect(new URL(`${returnTo}?calendar=error&msg=token_failed`, req.url));
      }

      // Save tokens into accounts table
      const supabase = await createServerClient();
      await supabase.from("accounts").update({
        google_calendar_token:    tokens.access_token,
        google_refresh_token:     tokens.refresh_token ?? null,
        google_connected_at:      new Date().toISOString(),
      }).eq("id", accountId);

      // Return user to wherever they came from
      return NextResponse.redirect(new URL(`${returnTo}?calendar=connected`, req.url));
    } catch (err) {
      console.error("[Google Calendar OAuth callback]", err);
      return NextResponse.redirect(new URL(`${returnTo}?calendar=error&msg=unexpected`, req.url));
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
    .select("id, google_calendar_token")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Best-effort token revocation
  if (account.google_calendar_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${account.google_calendar_token}`, {
      method: "POST",
    }).catch((err) => console.error("[Google Calendar] Token revocation failed:", err));
  }

  // Clear all Google fields
  await supabase.from("accounts").update({
    google_calendar_token:              null,
    google_refresh_token:               null,
    google_calendar_id:                 null,
    google_connected_at:                null,
    google_calendar_webhook_channel:    null,
    google_calendar_webhook_resource:   null,
  }).eq("id", account.id);

  return NextResponse.json({ success: true });
}
