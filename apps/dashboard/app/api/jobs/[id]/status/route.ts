// @ts-nocheck
/**
 * TitanCrew · PATCH /api/jobs/[id]/status
 * Update a job's kanban status (drag-drop).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const VALID = ["lead","scheduled","dispatched","in_progress","completed","invoiced","paid","canceled"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let body: { status: string };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!body.status || !VALID.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const service = createServiceClient();
    const { data: account } = await service.from("accounts").select("id").eq("owner_user_id", user.id).single();
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const { data: job } = await service.from("jobs").select("id").eq("id", params.id).eq("account_id", account.id).single();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const updates: any = { status: body.status, updated_at: new Date().toISOString() };
    if (body.status === "completed") updates.completed_at = new Date().toISOString();
    if (body.status === "invoiced") updates.invoiced_at = new Date().toISOString();
    const { error } = await service.from("jobs").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, jobId: params.id, status: body.status });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
