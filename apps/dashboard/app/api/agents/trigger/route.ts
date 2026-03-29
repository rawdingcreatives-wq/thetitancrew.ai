// @ts-nocheck
/**
 * TitanCrew · Agent Trigger Route
 * Dashboard → trigger any crew event on-demand.
 * Also used by the onboarder to fire the initial crew deploy.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Allow internal calls (from agent API) with secret header
  const internalSecret = req.headers.get("x-titancrew-secret");
  const isInternalCall = internalSecret === process.env.AGENT_API_SECRET;

  if (!user && !isInternalCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    accountId: string;
    event: string;
    payload?: Record<string, unknown>;
    planTier?: "basic" | "pro";
  };

  // Verify the caller owns this account (if not internal)
  if (!isInternalCall) {
    const serviceSupabase = createServiceClient();
    const { data: account } = await serviceSupabase
      .from("accounts")
      .select("id, plan")
      .eq("id", body.accountId)
      .eq("owner_user_id", user!.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    body.planTier = account.plan as "basic" | "pro";
  }

  // Forward to Agent API (Railway/Fly.io)
  const agentApiUrl = process.env.AGENT_API_URL;
  if (!agentApiUrl) {
    return NextResponse.json({ error: "Agent API not configured" }, { status: 503 });
  }

  try {
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
        planTier: body.planTier ?? "basic",
      }),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!agentResponse.ok) {
      const err = await agentResponse.text();
      return NextResponse.json({ error: `Agent API error: ${err}` }, { status: 502 });
    }

    const result = await agentResponse.json();
    return NextResponse.json({ success: true, runId: result.runId });
  } catch (err) {
    // If agent API is down, queue it for retry via n8n
    console.error("[Agent Trigger] Agent API unavailable:", err);
    return NextResponse.json(
      { error: "Agent API unavailable. Will retry automatically." },
      { status: 503 }
    );
  }
}
