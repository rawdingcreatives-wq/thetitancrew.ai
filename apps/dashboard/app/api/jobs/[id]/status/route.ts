/**
 * TitanCrew · PATCH /api/jobs/[id]/status
 * Update a job's kanban status (drag-drop).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("job-status");

const VALID_STATUSES = ["lead", "scheduled", "dispatched", "in_progress", "completed", "invoiced", "paid", "canceled"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { status: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const service = createServiceClient();

    // Get account for this user
    const { data: account } = await (service as any)
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const accountTyped = account as any;

    // Verify job belongs to this account
    const { data: job, error: jobErr } = await (service as any)
      .from("jobs")
      .select("id, account_id")
      .eq("id", id)
      .eq("account_id", accountTyped.id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };

    // Auto-set timestamps
    if (body.status === "completed") updates.completed_at = new Date().toISOString();
    if (body.status === "invoiced") updates.invoiced_at = new Date().toISOString();

    const { error: updateErr } = await (service as any)
      .from("jobs")
      .update(updates)
      .eq("id", id);

    if (updateErr) {
      log.error({ event: "update_error", err: String(updateErr) }, "Update error");
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId: id, status: body.status });
  } catch (err) {
    log.error({ event: "unhandled_error", err: String(err) }, "Unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
