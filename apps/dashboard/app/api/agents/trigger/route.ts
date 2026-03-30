// @ts-nocheck
/**
 * TitanCrew · Agent Trigger Route
 * Dashboard → trigger any crew event on-demand.
 * Also used by the onboarder to fire the initial crew deploy.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Allow internal calls (from agent API) with secret header
    const internalSecret = req.headers.get("x-titancrew-secret");
    const isInternalCall = internalSecret === process.env.AGENT_API_SECRET;

    if (!user && !isInternalCall) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { accountId: string; event: string; payload?: Record<string, unknown>; planTier?: "basic" | "pro" };
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
      const { data: account, error: accErr } = await serviceSupabase
        .from("accounts")
        .select("id, plan")
        .eq("id", body.accountId)
        .eq("owner_user_id", user!.id)
        .single();

      if (accErr || !account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      body.planTier = account.plan as "basic" | "pro";
    }

    // Forward to Agent API (Railway/Fly.io)
    const agentApiUrl = process.env.AGENT_API_URL;
    if (!agentApiUrl) {
      // Gracefully degrade — log and return success so onboarding continues
      console.warn("[Agent Trigger] AGENT_API_URL not configured — skipping trigger");
      return NextResponse.json({ success: true, runId: null, note: "Agent API not configured" });
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
        planTier: body.planTier ?? "basic",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!agentResponse.ok) {
      const err = await agentResponse.text();
      console.error("[Agent Trigger] Agent API error:", err);
      return NextResponse.json({ error: `Agent API error: ${err}` }, { status: 502 });
    }

    const result = await agentResponse.json();
    return NextResponse.json({ success: true, runId: result.runId });

  } catch (err) {
    console.error("[Agent Trigger] Unhandled error:", err);
    return NextResponse.json(
      { error: "Agent API unavailable. Will retry automatically." },
      { status: 503 }
    );
  }
}
