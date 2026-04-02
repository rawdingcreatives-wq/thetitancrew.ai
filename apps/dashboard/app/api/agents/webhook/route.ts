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

// --- Types ---

type WebhookEvent = "completed" | "needs_approval" | "error" | "progress";

interface AgentWebhookPayload {
  runId: string;
  agentType: string;
  accountId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
  timestamp?: string;
}

// --- Auth guard ---

function verifyAgentSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token === process.env.AGENT_API_SECRET;
}

// --- POST handler ---

export async function POST(req: NextRequest) {
  // 1. Auth check
  if (!verifyAgentSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
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
    // 3. Log to agent_runs table (matches Phase 0 schema)
    // agent_runs requires agent_id (FK to agent_instances), not just agent_type
    const { data: agentInstance } = await supabase
      .from("agent_instances")
      .select("id")
      .eq("account_id", accountId)
      .eq("agent_type", agentType)
      .single();

    if (agentInstance) {
      await supabase.from("agent_runs").insert({
        agent_id: agentInstance.id,
        account_id: accountId,
        run_type: "triggered",
        trigger_event: event,
        status: event === "completed" ? "success" : event === "error" ? "failed" : "running",
        output_summary: (data.summary as string) ?? null,
        actions_taken: data.actions ?? [],
        ...(event === "completed" || event === "error" ? { completed_at: ts } : {}),
        ...(event === "error" ? { error_message: (data.error as string) ?? "Unknown error" } : {}),
      });
    }

    // 4. Handle specific event types
    switch (event) {
      case "needs_approval": {
        // Insert into hil_confirmations table (Phase 0 schema)
        await supabase.from("hil_confirmations").insert({
          account_id: accountId,
          agent_run_id: agentInstance?.id ?? null,
          action_type: (data.actionType as string) ?? agentType,
          risk_level: (data.riskLevel as string) ?? "medium",
          description: (data.summary as string) ?? `${agentType} needs approval`,
          amount: (data.amount as number) ?? null,
          payload: data,
          status: "pending",
        });

        // TODO: Send push notification / SMS to account owner
        console.log(`[Agent Webhook] HIL request from ${agentType} for account ${accountId}`);
        break;
      }

      case "completed": {
        // Update any related job records if applicable
        if (data.jobId) {
          await supabase.from("jobs").update({
            agent_status: "completed",
            agent_result: data,
            updated_at: ts,
          }).eq("id", data.jobId);
        }
        console.log(`[Agent Webhook] ${agentType} completed run ${runId}`);
        break;
      }

      case "error": {
        console.error(`[Agent Webhook] ${agentType} error on run ${runId}:`, data.error ?? data);

        // Auto-retry logic: if retries < 3, re-trigger
        const retryCount = (data.retryCount as number) ?? 0;
        if (retryCount < 3) {
          const agentApiUrl = process.env.AGENT_API_URL;
          if (agentApiUrl) {
            await fetch(`${agentApiUrl}/crews/trigger`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.AGENT_API_SECRET}`,
              },
              body: JSON.stringify({
                accountId,
                event: `retry_${agentType}`,
                payload: { ...data, retryCount: retryCount + 1, originalRunId: runId },
              }),
              signal: AbortSignal.timeout(5_000),
            }).catch((err) => {
              console.error("[Agent Webhook] Retry trigger failed:", err);
            });
          }
        }
        break;
      }

      case "progress": {
        // Progress updates for long-running tasks -- just logged to agent_runs
        console.log(`[Agent Webhook] ${agentType} progress on ${runId}: ${data.message ?? ""}`);
        break;
      }
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

// --- GET handler -- health check ---

export async function GET() {
  return NextResponse.json({
    service: "titancrew-agent-webhook",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
