/**
 * TitanCrew · Agent Trigger Route
 * Dashboard → trigger any crew event on-demand.
 * Also used by the onboarder to fire the initial crew deploy.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger, generateRequestId } from "@/lib/logger";
import { guardKillSwitch } from "@/lib/kill-switches";

const log = createLogger("agent-trigger");

interface AccountData {
  id: string;
  plan: "lite" | "growth" | "scale";
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  try {
    // Kill switch: block agent auto-triggering during incidents
    if (guardKillSwitch("KILL_AGENT_TRIGGERS", { event: "agent_trigger", requestId })) {
      return NextResponse.json({ blocked: true, reason: "kill-switch" }, { status: 503 });
    }

    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Allow internal calls (from agent API) with secret header
    const internalSecret = req.headers.get("x-titancrew-secret");
    const isInternalCall = internalSecret === process.env.AGENT_API_SECRET;

    if (!user && !isInternalCall) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { accountId: string; event: string; payload?: Record<string, unknown>; planTier?: "lite" | "growth" | "scale" };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.accountId || !body.event) {
      return NextResponse.json({ error: "accountId and event are required" }, { status: 400 });
    }

    // Verify the caller owns this account (if not internal)
    if (!isInternalCall) {
      const serviceSupabase = createServiceClient();
      const { data: account, error: accErr } = await (serviceSupabase as any)
        .from("accounts")
        .select("id, plan")
        .eq("id", body.accountId)
        .eq("owner_user_id", user!.id)
        .single();

      if (accErr || !account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      const accountTyped = account as AccountData;
      body.planTier = accountTyped.plan;
    }

    // Forward to Agent API (Railway/Fly.io)
    const agentApiUrl = process.env.AGENT_API_URL;
    if (!agentApiUrl) {
      log.error({ event: "api_url_missing", requestId, accountId: body.accountId }, "AGENT_API_URL not configured — agent trigger cannot proceed");
      return NextResponse.json(
        { error: "Agent API not configured", hint: "Set AGENT_API_URL in environment variables" },
        { status: 503 }
      );
    }

    const agentResponse = await fetch(`${agentApiUrl}/crews/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AGENT_API_SECRET}`,
      },
      body: JSON.stringify({
        accountId: body.accountId,
        event: body.event,
        payload: body.payload ?? {},
        planTier: body.planTier ?? "lite",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      log.error({ event: "agent_api_error", requestId, accountId: body.accountId, statusCode: agentResponse.status }, `Agent API error: ${errText}`);
      return NextResponse.json({ error: `Agent API error: ${errText}` }, { status: 502 });
    }

    const result = await agentResponse.json();
    return NextResponse.json({ success: true, runId: result.runId });

  } catch (err) {
    log.error({ event: "unhandled_error", requestId }, "Agent trigger unhandled error", err);
    return NextResponse.json(
      { error: "Agent API unavailable. Will retry automatically." },
      { status: 503 }
    );
  }
}
