// @ts-nocheck
/**
 * TitanCrew · Agent Webhook Receiver
 *
 * POST /api/agents/webhook
 *
 * Receives callbacks from the AI agent system (n8n / Railway workers).
 * Agents POST here when they complete a task, need human-in-the-loop
 * approval, or encounter an error.
 *
 * Auth: Bearer token matching AGENT_API_SECRET (machine-to-machine).
 *
 * Payload shape:
 * {
 *   runId:     string,           // unique run identifier
 *   agentType: string,           // e.g. "scheduler", "invoicer", "comms"
 *   accountId: string,           // tenant account UUID
 *   event:     "completed" | "needs_approval" | "error" | "progress",
 *   data:      Record<string, unknown>,
 *   timestamp: string            // ISO-8601
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type WebhookEvent = "completed" | "needs_approval" | "error" | "progress";

interface AgentWebhookPayload {
  runId: string;
  agentType: string;
  accountId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
  timestamp?: string;
}

function verifyAgentSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token === process.env.AGENT_API_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifyAgentSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AgentWebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { runId, agentType, accountId, event, data, timestamp } = body;

  if (!runId || !agentType || !accountId || !event) {
    return NextResponse.json(
      { error: "Missing required fields: runId, agentType, accountId, event" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const ts = timestamp ?? new Date().toISOString();

  try {
    await supabase.from("agent_runs").upsert(
      {
        run_id: runId,
        agent_type: agentType,
        account_id: accountId,
        status: event === "completed" ? "completed" : event === "error" ? "failed" : event === "needs_approval" ? "awaiting_approval" : "running",
        result_data: data,
        updated_at: ts,
        ...(event === "completed" || event === "error" ? { completed_at: ts } : {}),
      },
      { onConflict: "run_id" }
    );

    switch (event) {
      case "needs_approval": {
        await supabase.from("hil_queue").insert({
          run_id: runId,
          agent_type: agentType,
          account_id: accountId,
          action_summary: (data.summary as string) ?? agentType + " needs approval",
          action_payload: data,
          status: "pending",
          created_at: ts,
        });
        break;
      }
      case "completed": {
        if (data.jobId) {
          await supabase.from("jobs").update({
            agent_status: "completed",
            agent_result: data,
            updated_at: ts,
          }).eq("id", data.jobId);
        }
        break;
      }
      case "error": {
        const retryCount = (data.retryCount as number) ?? 0;
        if (retryCount < 3) {
          const agentApiUrl = process.env.AGENT_API_URL;
          if (agentApiUrl) {
            await fetch(agentApiUrl + "/crews/trigger", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + process.env.AGENT_API_SECRET,
              },
              body: JSON.stringify({
                accountId,
                event: "retry_" + agentType,
                payload: { ...data, retryCount: retryCount + 1, originalRunId: runId },
              }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => {});
          }
        }
        break;
      }
      case "progress": break;
    }

    return NextResponse.json({ received: true, event, runId });
  } catch (err) {
    console.error("[Agent Webhook] Processing error:", err);
    return NextResponse.json(
      { error: "Processing error", details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: "titancrew-agent-webhook",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
