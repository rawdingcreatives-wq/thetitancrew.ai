/**
 * TitanCrew · Twilio Webhook Handler
 *
 * SECURITY MODEL (HIL-SACRED):
 * 1. Twilio signature is verified on every request (production).
 * 2. STOP/START keywords are handled first (TCPA compliance) — any sender.
 * 3. HIL approval/rejection requires the sender to be the verified account owner.
 *    - Owner phone is matched against accounts.phone (the owner's mobile).
 *    - Unverified senders CANNOT approve or reject HIL actions.
 * 4. SMS delivery failure NEVER auto-approves. Pending HIL stays pending.
 * 5. "YES" is routed to HIL approval (if owner) BEFORE opt-in handling.
 */

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/server";
import { createLogger, generateRequestId } from "@/lib/logger";

const log = createLogger("twilio-webhook");
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;

// ─── Types for Supabase responses ────────────────────────────

interface TwilioAccount {
  id: string;
  phone: string | null;
  twilio_phone_number: string;
}

interface TwilioPending {
  id: string;
  description: string | null;
  action_type: string | null;
}

// Keywords
const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_KEYWORDS = ["START", "UNSTOP"];
const APPROVE_KEYWORDS = ["Y", "YES", "APPROVE", "OK"];
const REJECT_KEYWORDS = ["N", "NO", "REJECT", "DENY"];

function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  // ── 1. Verify Twilio signature ───────────────────────
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = value.toString(); });

  const messageSid = params.MessageSid ?? "";
  const requestId = generateRequestId();

  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params);
  if (!isValid && process.env.NODE_ENV === "production") {
    log.error({ event: "invalid_signature", requestId, twilioMessageSid: messageSid }, "Twilio signature validation failed — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const from = params.From ?? "";
  const body_text = (params.Body ?? "").trim();
  const to = params.To ?? "";
  log.info({ event: "sms_received", requestId, twilioMessageSid: messageSid, from, to }, `Inbound SMS: "${body_text.slice(0, 50)}"`);

  const supabase = createServiceClient();

  // ── 2. Status callback (delivery receipts) ────────────
  if (params.SmsStatus) {
    const status = params.SmsStatus;
    await (supabase as any).from("comms_log").update({ status }).eq("external_id", messageSid);
    return NextResponse.json({ handled: "status_callback", status });
  }

  // ── 3. Inbound SMS ─────────────────────────────────────
  if (params.Body === undefined) {
    return NextResponse.json({ received: true });
  }

  const normalized = body_text.toUpperCase();

  // 3a. Find which account owns this Twilio number
  // IMPORTANT: `to` is the Twilio number → match against twilio_phone_number
  // `phone` column stores the owner's personal mobile (used for HIL verification)
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, phone, twilio_phone_number")
    .eq("twilio_phone_number", to)
    .single();

  const typedAccount = account as TwilioAccount | null;
  if (!typedAccount || error) {
    log.warn({ event: "unknown_number", requestId, from, to }, `Inbound SMS to unknown number ${to}`);
    return twiml();
  }

  const accountId = typedAccount.id;
  // Owner's personal mobile — set during onboarding in `phone` column
  const ownerMobile = typedAccount.phone;

  // 3b. TCPA compliance — STOP keywords (any sender)
  if (STOP_KEYWORDS.includes(normalized)) {
    await (supabase as any)
      .from("trade_customers")
      .update({
        comms_opt_out: true,
      })
      .eq("account_id", accountId)
      .eq("phone", from);
    await logInbound(supabase, accountId, from, to, body_text, messageSid);
    return twiml("You have been unsubscribed. Reply START to re-subscribe.");
  }

  // 3c. TCPA compliance — START keywords (any sender, but NOT "YES")
  //     "YES" is reserved for HIL approval when sent by the owner.
  if (START_KEYWORDS.includes(normalized)) {
    await (supabase as any)
      .from("trade_customers")
      .update({
        comms_opt_out: false,
      })
      .eq("account_id", accountId)
      .eq("phone", from);
    await logInbound(supabase, accountId, from, to, body_text, messageSid);
    return twiml("You've been re-subscribed. Reply STOP to unsubscribe anytime.");
  }

  // ── 4. OWNER VERIFICATION for HIL actions ──────────────
  // CRITICAL: Only the verified account owner can approve/reject HIL actions.
  // We check the sender's phone against the owner's personal mobile (accounts.phone).
  // If the owner has no phone on file, HIL via SMS is disabled — no auto-approve.
  const ownerPhone = ownerMobile;
  const isOwner = ownerPhone !== null && normalizePhone(from) === normalizePhone(ownerPhone);

  // 4a. HIL APPROVAL (owner only)
  if (APPROVE_KEYWORDS.includes(normalized)) {
    if (!isOwner) {
      log.warn({ event: "hil_non_owner_approval", requestId, accountId, from }, `HIL approval attempt from non-owner ${from}`);
      await logInbound(supabase, accountId, from, to, body_text, messageSid);
      // If sender is a customer, treat "YES" as opt-in re-subscribe
      if (normalized === "YES") {
        await (supabase as any)
          .from("trade_customers")
          .update({
            comms_opt_out: false,
          })
          .eq("account_id", accountId)
          .eq("phone", from);
        return twiml("You've been re-subscribed. Reply STOP to unsubscribe anytime.");
      }
      return twiml();
    }

    const result = await handleOwnerConfirmation(supabase, accountId, "approved");
    if (result.found) {
      return twiml(`Action approved: ${result.description}. Your crew will proceed.`);
    }
    return twiml("No pending actions to approve.");
  }

  // 4b. HIL REJECTION (owner only)
  if (REJECT_KEYWORDS.includes(normalized)) {
    if (!isOwner) {
      log.warn({ event: "hil_non_owner_rejection", requestId, accountId, from }, `HIL rejection attempt from non-owner ${from}`);
      await logInbound(supabase, accountId, from, to, body_text, messageSid);
      return twiml();
    }

    const result = await handleOwnerConfirmation(supabase, accountId, "rejected");
    if (result.found) {
      return twiml(`Action rejected: ${result.description}. Your crew will skip that task.`);
    }
    return twiml("No pending actions to reject.");
  }

  // ── 5. General inbound — log and route to agent ────────
  await logInbound(supabase, accountId, from, to, body_text, messageSid);
  await triggerCommAgent(accountId, { from, body: body_text });
  return twiml();
}

// ─── Helpers ────────────────────────────────────────────

/** Normalize phone to digits-only for comparison (strips +, -, spaces, parens) */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Handle US numbers: if 11 digits starting with 1, strip the leading 1
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

async function logInbound(
  supabase: ReturnType<typeof createServiceClient>,
  accountId: string,
  from: string,
  to: string,
  body: string,
  sid: string
) {
  await (supabase as any).from("comms_log").insert({
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
): Promise<{ found: boolean; description: string }> {
  // Find the most recent pending HIL confirmation for this account
  // that has NOT expired.
  const { data: pending } = await supabase
    .from("hil_confirmations")
    .select("id, description, action_type")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const typedPending = pending as TwilioPending | null;
  if (!typedPending) {
    return { found: false, description: "" };
  }

  await (supabase as any)
    .from("hil_confirmations")
    .update({
      status: action,
      responded_at: new Date().toISOString(),
    })
    .eq("id", typedPending.id);

  return { found: true, description: typedPending.description || typedPending.action_type || "action" };
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
  }).catch((err: unknown) => log.error({ event: "comm_agent_trigger_failed", accountId }, "Comm agent trigger failed", err));
}
