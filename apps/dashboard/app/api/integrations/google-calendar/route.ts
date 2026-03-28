/**
 * TitanCrew — Google Calendar OAuth Callback Routes
 *
 * GET /api/integrations/google-calendar/start    → redirect to Google OAuth
 * GET /api/integrations/google-calendar/callback → exchange code, save tokens
 * POST /api/integrations/google-calendar/disconnect → revoke + clear tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl, exchangeGoogleCode } from "@titancrew/agents/src/tools/integrations/GoogleCalendarAdapter";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`;

// ─── Start OAuth Flow ─────────────────────────────────────

export async function GET(req: NextRequest) {
  const { pathname, searchParams } = new URL(req.url);

  // /start — redirect to Google
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

    const authUrl = getGoogleAuthUrl(account.id, REDIRECT_URI);
    return NextResponse.redirect(authUrl);
  }

  // /callback — exchange code, save tokens
  if (pathname.endsWith("/callback")) {
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // accountId
    const error = searchParams.get("error");

    if (error || !code || !state) {
      return NextResponse.redirect(
        new URL(`/integrations?error=google_calendar&msg=${error ?? "cancelled"}`, req.url)
      );
    }

    try {
      const result = await exchangeGoogleCode(code, state, REDIRECT_URI);
      if (!result.success) {
        return NextResponse.redirect(new URL("/integrations?error=google_calendar&msg=token_exchange_failed", req.url));
      }

      // Register webhook for real-time updates
      // (async — don't block the redirect)
      import("@titancrew/agents/src/tools/integrations/GoogleCalendarAdapter").then(
        ({ GoogleCalendarAdapter }) => {
          const adapter = new GoogleCalendarAdapter(state);
          adapter.registerWebhook(state).catch(console.error);
        }
      );

      return NextResponse.redirect(
        new URL("/integrations?success=google_calendar", req.url)
      );
    } catch (err) {
      console.error("[Google Calendar OAuth]", err);
      return NextResponse.redirect(new URL("/integrations?error=google_calendar&msg=unexpected", req.url));
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ─── Disconnect ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id, google_calendar_token, google_calendar_webhook_channel, google_calendar_webhook_resource")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Revoke token with Google
  if (account.google_calendar_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${account.google_calendar_token}`, {
      method: "POST",
    }).catch(() => {}); // Best effort
  }

  // Stop webhook channel
  if (account.google_calendar_webhook_channel && account.google_calendar_webhook_resource) {
    // Would call calendar.channels.stop() here
  }

  // Clear tokens from DB
  await supabase.from("accounts").update({
    google_calendar_token: null,
    google_refresh_token: null,
    google_calendar_id: null,
    google_connected_at: null,
    google_calendar_webhook_channel: null,
    google_calendar_webhook_resource: null,
  }).eq("id", account.id);

  return NextResponse.json({ success: true });
}
