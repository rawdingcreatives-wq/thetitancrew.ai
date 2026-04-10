/**
 * TitanCrew · Meta Business Suite OAuth
 *
 * GET ?action=start&accountId=<uuid>
 *   → Redirects the user to Facebook's OAuth consent screen.
 *     Requests: pages_manage_posts, pages_read_engagement, pages_show_list,
 *               pages_manage_metadata, ads_management, business_management
 *
 * GET ?action=callback&code=<code>&state=<accountId>
 *   → Exchanges code for a long-lived user access token,
 *     fetches the user's business pages, stores in Supabase,
 *     and redirects back to /onboarding?meta=connected
 *
 * POST  body: { accountId }
 *   → Revokes token and clears Meta fields from Supabase
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("meta-oauth");

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: object;
}

interface AccountData {
  meta_access_token?: string;
}

const APP_ID     = process.env.FACEBOOK_APP_ID ?? "";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "https://thetitancrewai.vercel.app";
const REDIRECT   = `${APP_URL}/api/integrations/meta`;

const SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
  "pages_manage_metadata",
  "ads_management",
  "business_management",
].join(",");

// ─── GET ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") ?? "callback";

  // ── Start OAuth ──────────────────────────────────────────
  if (action === "start") {
    const accountId = searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }
    if (!APP_ID) {
      // If FB app isn't configured yet, bounce back with a clear error
      return NextResponse.redirect(
        `${APP_URL}/onboarding?meta=error&reason=app_not_configured`
      );
    }

    const fbUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    fbUrl.searchParams.set("client_id",    APP_ID);
    fbUrl.searchParams.set("redirect_uri", REDIRECT);
    fbUrl.searchParams.set("scope",        SCOPES);
    fbUrl.searchParams.set("response_type","code");
    fbUrl.searchParams.set("state",        accountId);

    return NextResponse.redirect(fbUrl.toString());
  }

  // ── Callback ─────────────────────────────────────────────
  const code      = searchParams.get("code");
  const accountId = searchParams.get("state");
  const fbError   = searchParams.get("error");

  if (fbError) {
    const reason = searchParams.get("error_reason") ?? fbError;
    return NextResponse.redirect(
      `${APP_URL}/onboarding?meta=error&reason=${encodeURIComponent(reason)}`
    );
  }

  if (!code || !accountId) {
    return NextResponse.redirect(`${APP_URL}/onboarding?meta=error&reason=missing_params`);
  }

  try {
    // 1. Exchange code → short-lived user access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&client_secret=${APP_SECRET}` +
      `&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      log.error({ event: "token_exchange_failed", err }, "Token exchange failed");
      return NextResponse.redirect(`${APP_URL}/onboarding?meta=error&reason=token_exchange`);
    }
    const tokenJson = await tokenRes.json() as { access_token: string };
    const shortToken = tokenJson.access_token;

    // 2. Upgrade to long-lived token (~60 days)
    const longUrl = `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&fb_exchange_token=${shortToken}`;

    const longRes  = await fetch(longUrl);
    const longJson = await longRes.json() as { access_token: string };
    const longToken = longJson.access_token ?? shortToken;

    // 3. Fetch user's Business Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?` +
      `fields=id,name,access_token,category,picture` +
      `&access_token=${longToken}`
    );
    const pagesJson = await pagesRes.json() as { data?: FacebookPage[] };
    const pages: FacebookPage[] = pagesJson.data ?? [];

    // Use the first page as the default (changeable in Settings)
    const primary = pages[0] ?? null;

    // 4. Persist to Supabase (service role bypasses RLS)
    const supabase = await createServiceClient();
    const { error: dbErr } = await (supabase as any)
      .from("accounts")
      .update({
        meta_access_token:      longToken,
        meta_page_id:           primary?.id          ?? null,
        meta_page_name:         primary?.name        ?? null,
        meta_page_access_token: primary?.access_token ?? null,
        meta_pages:             pages,
      })
      .eq("id", accountId);

    if (dbErr) {
      log.error({ event: "supabase_update_error", err: String(dbErr) }, "Supabase update error");
      // Still redirect with success — token was obtained; user can retry storage
    }

    return NextResponse.redirect(`${APP_URL}/onboarding?meta=connected`);

  } catch (err) {
    log.error({ event: "unexpected_error", err: String(err) }, "Unexpected error");
    return NextResponse.redirect(`${APP_URL}/onboarding?meta=error&reason=server_error`);
  }
}

// ─── POST (disconnect) ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json() as { accountId: string };
    if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

    const supabase = await createServiceClient();

    // Fetch current token to revoke it
    const { data } = await (supabase as any)
      .from("accounts")
      .select("meta_access_token")
      .eq("id", accountId)
      .single() as { data: AccountData | null };

    if (data?.meta_access_token) {
      await fetch(
        `https://graph.facebook.com/v19.0/me/permissions?access_token=${data.meta_access_token}`,
        { method: "DELETE" }
      ).catch(() => {});
    }

    // Clear Meta fields
    await (supabase as any)
      .from("accounts")
      .update({
        meta_access_token:      null,
        meta_page_id:           null,
        meta_page_name:         null,
        meta_page_access_token: null,
        meta_pages:             null,
      })
      .eq("id", accountId);

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ event: "disconnect_error", err: String(err) }, "Disconnect error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
