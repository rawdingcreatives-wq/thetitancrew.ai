// @ts-nocheck
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
    const { data: account, error: accErr } = await serviceSupabase
      .from("accounts")
      .select("id, plan")
      .eq("owner_user_id", user.id)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (body.agentId) {
      // Toggle by agent instance ID — verify ownership first
      const { data: instance, error: instErr } = await serviceSupabase
        .from("agent_instances")
        .select("id, account_id, agent_type")
        .eq("id", body.agentId)
        .eq("account_id", account.id)
        .single();

      if (instErr || !instance) {
        return NextResponse.json({ error: "Agent instance not found" }, { status: 404 });
      }

      const { error: updateErr } = await serviceSupabase
        .from("agent_instances")
        .update({
          is_enabled: body.enabled,
          status: body.enabled ? "idle" : "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.agentId);

      if (updateErr) {
        console.error("[Agent Toggle] Update error:", updateErr);
        return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
      }

      return NextResponse.json({ success: true, agentId: body.agentId, enabled: body.enabled });
    }

    // No agentId — must have agentType for upsert
    if (!body.agentType) {
      return NextResponse.json({ error: "agentId or agentType required" }, { status: 400 });
    }

    if (!CUSTOMER_AGENT_TYPES.includes(body.agentType as any)) {
      return NextResponse.json({ error: "Invalid agent type" }, { status: 400 });
    }

    // Upsert the agent instance
    const { data: upserted, error: upsertErr } = await serviceSupabase
      .from("agent_instances")
      .upsert(
        {
          account_id: account.id,
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
      console.error("[Agent Toggle] Upsert error:", upsertErr);
      return NextResponse.json({ error: "Failed to upsert agent" }, { status: 500 });
    }

    return NextResponse.json({ success: true, agentId: upserted?.id, enabled: body.enabled });

  } catch (err) {
    console.error("[Agent Toggle] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
