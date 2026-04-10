/**
 * TitanCrew · POST /api/jobs
 * Create a new job lead. Optionally creates a trade_customer record.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs");

export async function POST(req: NextRequest) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: {
      accountId: string;
      title: string;
      job_type?: string;
      priority?: string;
      estimate_amount?: string;
      technician_id?: string;
      address?: string;
      customer_name?: string;
      customer_phone?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.accountId || !body.title?.trim()) {
      return NextResponse.json({ error: "accountId and title are required" }, { status: 400 });
    }

    const service = createServiceClient();

    // Verify account ownership
    const { data: account, error: accErr } = await service
      .from("accounts")
      .select("id")
      .eq("id", body.accountId)
      .eq("owner_user_id", user.id)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Upsert customer if name/phone provided
    let customerId: string | null = null;
    if (body.customer_name || body.customer_phone) {
      const { data: customer, error: custErr } = await (service as any)
        .from("trade_customers")
        .upsert(
          {
            account_id: body.accountId,
            name: body.customer_name ?? "Unknown",
            phone: body.customer_phone ?? null,
          },
          { onConflict: "account_id,phone", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (!custErr && customer) {
        const customerTyped = customer as any;
        customerId = customerTyped.id;
      }
    }

    // Create the job
    const { data: job, error: jobErr } = await (service as any)
      .from("jobs")
      .insert({
        account_id: body.accountId,
        title: body.title.trim(),
        status: "lead",
        job_type: body.job_type ?? "service",
        priority: body.priority ? parseInt(body.priority, 10) : 2,
        estimate_amount: body.estimate_amount ? parseFloat(body.estimate_amount) : null,
        technician_id: body.technician_id || null,
        customer_id: customerId,
        address: body.address || null,
        booked_by_ai: false,
        source: "manual",
      })
      .select("id, title, status")
      .single();

    if (jobErr) {
      log.error({ event: "insert_error", err: String(jobErr) }, "Insert error");
      return NextResponse.json({ error: jobErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, job });
  } catch (err) {
    log.error({ event: "unhandled_error", err: String(err) }, "Unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
