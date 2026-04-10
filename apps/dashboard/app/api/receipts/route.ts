/**
 * /api/receipts — POST (upload receipt) + GET (list receipts)
 *
 * POST: Accepts multipart form data with receipt image + optional job_id.
 *       Uploads to Supabase Storage, creates receipt record, returns receipt.
 *
 * GET:  Returns receipts for the authenticated user's account.
 *       Supports ?status= filter and ?job_id= filter.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/receipts");

// ── GET: List receipts ───────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: account } = await service
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Build query with optional filters
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const jobFilter = url.searchParams.get("job_id");

    let query = (service as any)
      .from("receipts")
      .select(`
        id, account_id, job_id, status, vendor_name, receipt_date,
        total_amount, original_filename, parse_confidence, created_at,
        receipt_line_items(id, description, quantity, unit_price, line_total, disposition)
      `)
      .eq("account_id", account.id)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (jobFilter) {
      query = query.eq("job_id", jobFilter);
    }

    const { data: receipts, error } = await query.limit(100);

    if (error) {
      log.error({ event: "fetch_failed" }, "Failed to fetch receipts", error);
      return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
    }

    return NextResponse.json({ success: true, receipts: receipts ?? [] });
  } catch (err) {
    log.error({ event: "get_error" }, "GET /api/receipts error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: Upload receipt ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: account } = await service
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobId = formData.get("job_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, HEIC, PDF` },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
    }

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const storagePath = `${account.id}/${timestamp}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await service.storage
      .from("receipts")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      log.error({ event: "storage_upload_failed" }, "Storage upload failed", uploadErr);
      return NextResponse.json({ error: "Failed to upload receipt image" }, { status: 500 });
    }

    // Create receipt record
    const { data: receipt, error: insertErr } = await (service as any)
      .from("receipts")
      .insert({
        account_id: account.id,
        job_id: jobId || null,
        uploaded_by: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        status: "uploaded",
      })
      .select("id, status, storage_path, created_at")
      .single();

    if (insertErr) {
      log.error({ event: "insert_failed" }, "Receipt insert failed", insertErr);
      // Clean up uploaded file on insert failure
      await service.storage.from("receipts").remove([storagePath]);
      return NextResponse.json({ error: "Failed to create receipt record" }, { status: 500 });
    }

    log.info({ event: "receipt_uploaded", accountId: account.id }, `Receipt uploaded: ${receipt.id}`);

    return NextResponse.json({ success: true, receipt }, { status: 201 });
  } catch (err) {
    log.error({ event: "post_error" }, "POST /api/receipts error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
