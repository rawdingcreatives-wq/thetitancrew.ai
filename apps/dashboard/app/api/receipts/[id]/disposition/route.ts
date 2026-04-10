/**
 * POST /api/receipts/[id]/disposition
 *
 * Handles material disposition for a parsed receipt:
 * - Links line items to jobs
 * - Sets disposition (used_on_job / leftover_return_to_truck / wasted)
 * - Updates parts inventory quantities
 * - Logs audit trail
 *
 * Body: {
 *   job_id: string,          // required — job these materials are for
 *   items: Array<{
 *     line_item_id: string,
 *     disposition: "used_on_job" | "leftover_return_to_truck" | "wasted",
 *     disposed_quantity: number,
 *     part_id?: string,       // optional — matched inventory part
 *     notes?: string
 *   }>
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import type { MaterialDisposition } from "@/lib/supabase/types";

const log = createLogger("api/receipts/disposition");

const VALID_DISPOSITIONS: MaterialDisposition[] = [
  "used_on_job",
  "leftover_return_to_truck",
  "wasted",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();

    // Verify account ownership
    const { data: account } = await service
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch receipt
    const { data: receipt, error: fetchErr } = await (service as any)
      .from("receipts")
      .select("id, account_id, status")
      .eq("id", id)
      .eq("account_id", account.id)
      .single();

    if (fetchErr || !receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (receipt.status !== "parsed" && receipt.status !== "attributed") {
      return NextResponse.json(
        { error: `Receipt must be in 'parsed' or 'attributed' status. Current: ${receipt.status}` },
        { status: 400 }
      );
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { job_id, items } = body;

    if (!job_id) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required and must not be empty" }, { status: 400 });
    }

    // Verify job belongs to account
    const { data: job, error: jobErr } = await (service as any)
      .from("jobs")
      .select("id, account_id, title")
      .eq("id", job_id)
      .eq("account_id", account.id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found or not owned by this account" }, { status: 404 });
    }

    // Process each line item disposition
    const results: Array<{ line_item_id: string; ok: boolean; error?: string }> = [];
    const inventoryUpdates: Array<{ part_id: string; qty_delta: number }> = [];

    for (const item of items) {
      const { line_item_id, disposition, disposed_quantity, part_id, notes } = item;

      // Validate disposition
      if (!VALID_DISPOSITIONS.includes(disposition)) {
        results.push({ line_item_id, ok: false, error: `Invalid disposition: ${disposition}` });
        continue;
      }

      if (!disposed_quantity || disposed_quantity <= 0) {
        results.push({ line_item_id, ok: false, error: "disposed_quantity must be > 0" });
        continue;
      }

      // Update line item
      const { error: updateErr } = await (service as any)
        .from("receipt_line_items")
        .update({
          job_id,
          disposition,
          disposed_quantity,
          part_id: part_id || null,
          disposition_notes: notes || null,
        })
        .eq("id", line_item_id)
        .eq("receipt_id", id)
        .eq("account_id", account.id);

      if (updateErr) {
        log.error({ event: "line_item_update_failed" }, `Failed to update line item ${line_item_id}`, updateErr);
        results.push({ line_item_id, ok: false, error: "Database update failed" });
        continue;
      }

      results.push({ line_item_id, ok: true });

      // Track inventory impact
      if (part_id && disposition === "used_on_job") {
        // Deduct from inventory — material was consumed
        inventoryUpdates.push({ part_id, qty_delta: -disposed_quantity });
      } else if (part_id && disposition === "leftover_return_to_truck") {
        // No inventory change — material stays on truck (already counted)
        // But we log it for visibility
      } else if (part_id && disposition === "wasted") {
        // Deduct from inventory — material was lost/damaged
        inventoryUpdates.push({ part_id, qty_delta: -disposed_quantity });
      }
    }

    // Apply inventory updates
    for (const update of inventoryUpdates) {
      // Fetch current stock
      const { data: part } = await (service as any)
        .from("parts")
        .select("id, qty_on_hand")
        .eq("id", update.part_id)
        .single();

      if (part) {
        const newQty = Math.max(0, (part.qty_on_hand || 0) + update.qty_delta);
        await (service as any)
          .from("parts")
          .update({ qty_on_hand: newQty })
          .eq("id", update.part_id);

        log.info({ event: "inventory_updated" }, `Inventory updated: part ${update.part_id} qty ${part.qty_on_hand} → ${newQty}`);
      }
    }

    // Update receipt status
    const allDisposed = results.every((r) => r.ok);
    await (service as any)
      .from("receipts")
      .update({
        status: allDisposed ? "disposed" : "attributed",
        job_id,
        attributed_at: new Date().toISOString(),
        disposed_at: allDisposed ? new Date().toISOString() : null,
      })
      .eq("id", id);

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;

    log.info(
      { event: "disposition_complete", jobId: job_id },
      `Receipt ${id} disposition: ${successCount}/${items.length} items processed, ${inventoryUpdates.length} inventory updates`
    );

    return NextResponse.json({
      success: true,
      receipt_id: id,
      job_id,
      status: allDisposed ? "disposed" : "attributed",
      items_processed: successCount,
      items_failed: failCount,
      inventory_updates: inventoryUpdates.length,
      results,
    });
  } catch (err) {
    log.error({ event: "disposition_error" }, "POST /api/receipts/[id]/disposition error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
