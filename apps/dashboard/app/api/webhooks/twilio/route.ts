// @ts-nocheck
/**
 * TitanCrew · Twilio Webhook Handler
 * Handles inbound SMS: STOP/START opt-outs, status callbacks, inbound customer replies.
 */

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/server";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;

export async function POST(req: NextRequest) {
  // Verify Twilio signature
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const body = await req.formData();
  const params: Record<string, string> = {};
  body.forEach((value, key) => { params[key] = value.toString(); });

  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params);
  if (!isValid && process.env.NODE_ENV === "production") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const messageType = params.SmsStatus || (params.Body !== undefined ? "inbound" : "status");
  const from = params.From ?? "";
  const body_text = (params.Body ?? "").trim();
  const to = params.To ?? "";
  const messageSid = params.MessageSid ?? params.SmsSid ?? "";

  const supabase = createServiceClient();

  // ── Status callback (delivery receipts) ────────────────
  if (params.SmsStatus) {
    const status = params.SmsStatus;
    await supabase.from("comms_log").update({
      status,
    }).eq("external_id", messageSid);

    return NextResponse.json({ handled: "status_callback", status });
  }

  // ── Inbound SMS ─────────────────────────────────────────
  if (params.Body !== undefined) {
    const normalized = body_text.toUpperCase();

    // Find which account this number belongs to
    const { data: account } = await supabase
      .from("accounts")
      .select("id, phone")
      .eq("phone", to)
      .single();

    if (!account) {
      // Log it anyway
      console.warn(`[Twilio] Inbound SMS to unknown number ${to} from ${from}`);
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Handle STOP keywords (TCPA compliance)
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized)) {
      await supabase.from("trade_customers").update({
        comms_opt_out: true,
      }).eq("account_id", account.id).eq("phone", from);

      await logInbound(supabase, account.id, from, to, body_text, messageSid);

      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed. Reply START to re-subscribe.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Handle START keywords
    if (["START", "UNSTOP", "YES"].includes(normalized)) {
      await supabase.from("trade_customers").update({
        comms_opt_out: false,
      }).eq("account_id", account.id).eq("phone", from);

      await logInbound(supabase, account.id, from, to, body_text, messageSid);

      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You've been re-subscribed. Reply STOP to unsubscribe anytime.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Handle owner confirmations (Y/N for HIL)
    if (["Y", "YES", "APPROVE", "OK"].includes(normalized)) {
      await handleOwnerConfirmation(supabase, account.id, "approved");
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>✅ Action approved! Your crew will proceed.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    if (["N", "NO", "REJECT", "DENY"].includes(normalized)) {
      await handleOwnerConfirmation(supabase, account.id, "rejected");
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>❌ Action rejected. Your crew will skip that task.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // General inbound — log and flag for crew to handle
    await logInbound(supabase, account.id, from, to, body_text, messageSid);

    // Trigger CustomerComm agent to handle the reply
    await triggerCommAgent(account.id, { from, body: body_text });

    // Acknowledge receipt
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ────────────────────────────────────────────

async function logInbound(
  supabase: ReturnType<typeof createServiceClient>,
  accountId: string,
  from: string,
  to: string,
  body: string,
  sid: string
) {
  await supabase.from("comms_log").insert({
    account_id: accountId,
    direction: "inbound",
    channel: "sms",
    to_address: to,
    from_address: from,
    body,
    status: "received",
    external_id: sid,
    ai_generated: false,
  });
}

async function handleOwnerConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  accountId: string,
  action: "approved" | "rejected"
) {
  // Approve/reject the most recent pending HIL for this account
  const { data: pending } = await supabase
    .from("hil_confirmations")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (pending) {
    await supabase.from("hil_confirmations").update({
      status: action,
      responded_at: new Date().toISOString(),
    }).eq("id", pending.id);
  }
}

async function triggerCommAgent(accountId: string, payload: Record<string, unknown>) {
  const agentApiUrl = process.env.AGENT_API_URL;
  if (!agentApiUrl) return;

  await fetch(`${agentApiUrl}/crews/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AGENT_API_SECRET}`,
    },
    body: JSON.stringify({ accountId, event: "customer_comm", payload }),
  }).catch(console.error);
}
