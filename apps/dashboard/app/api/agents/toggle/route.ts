/**
 * TitanCrew · Agent Toggle Route
 * POST /api/agents/toggle
 * Body: { agentId: string; enabled: boolean }
 *
 * Enables or disables an agent instance.
 * If the agent_instance doesn't exist yet, creates it first (upsert by agent_type).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("agent-toggle");

interface AccountData {
  id: string;
  plan?: string;
}

interface AgentInstanceData {
  id: string;
  account_id: string;
  agent_type: string;
}

interface UpsertedData {
  id: string;
}

const CUSTOMER_AGENT_TYPES = [
  "foreman_predictor",
  "scheduler",
  "customer_comm",
  "finance_invoice",
  "parts_inventory",
  "tech_dispatch",
] as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { agentId?: string; agentType?: string; enabled: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Get the account for this user
    const { data: account, error: accErr } = await (serviceSupabase as any)
      .from("accounts")
      .select("id, plan")
      .eq("owner_user_id", user.id)
      .single();

    const typedAccount = account as AccountData | null;
    if (accErr || !typedAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (body.agentId) {
      // Toggle by agent instance ID — verify ownership first
      const { data: instance, error: instErr } = await (serviceSupabase as any)
        .from("agent_instances")
        .select("id, account_id, agent_type")
        .eq("id", body.agentId)
        .eq("account_id", typedAccount.id)
        .single();

      const typedInstance = instance as AgentInstanceData | null;
      if (instErr || !typedInstance) {
        return NextResponse.json({ error: "Agent instance not found" }, { status: 404 });
      }

      const { error: updateErr } = await (serviceSupabase as any)
        .from("agent_instances")
        .update({
          is_enabled: body.enabled,
          status: body.enabled ? "idle" : "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.agentId);

      if (updateErr) {
        log.error({ event: "update_error", err: String(updateErr) }, "Failed to update agent");
        return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
      }

      return NextResponse.json({ success: true, agentId: body.agentId, enabled: body.enabled });
    }

    // No agentId — must have agentType for upsert
    if (!body.agentType) {
      return NextResponse.json({ error: "agentId or agentType required" }, { status: 400 });
    }

    if (!CUSTOMER_AGENT_TYPES.includes(body.agentType as typeof CUSTOMER_AGENT_TYPES[number])) {
      return NextResponse.json({ error: "Invalid agent type" }, { status: 400 });
    }

    // Upsert the agent instance
    const { data: upserted, error: upsertErr } = await (serviceSupabase as any)
      .from("agent_instances")
      .upsert(
        {
          account_id: typedAccount.id,
          agent_type: body.agentType,
          is_enabled: body.enabled,
          status: body.enabled ? "idle" : "disabled",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,agent_type", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (upsertErr) {
      log.error({ event: "upsert_error", err: String(upsertErr) }, "Failed to upsert agent");
      return NextResponse.json({ error: "Failed to upsert agent" }, { status: 500 });
    }

    const upsertedTyped = upserted as UpsertedData | null;
    return NextResponse.json({ success: true, agentId: upsertedTyped?.id, enabled: body.enabled });

  } catch (err) {
    log.error({ event: "unhandled_error", err: String(err) }, "Unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
