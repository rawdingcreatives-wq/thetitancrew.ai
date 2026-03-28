/**
 * TradeBrain · HILGate (Human-in-Loop Gate)
 * Sends SMS confirmations to business owners before high-risk actions execute.
 * Every financial action >$50 or high-liability comm routes through here.
 */

import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import type { Database } from "../../shared/types/database.types";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface HILRequest {
  accountId: string;
  actionType: string;
  riskLevel: RiskLevel;
  description: string;
  amount?: number;
  payload: Record<string, unknown>;
}

export interface HILRecord {
  id: string;
  response_token: string;
  expires_at: string;
  status: "pending" | "approved" | "rejected" | "timed_out";
}

const HIL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour default
const POLL_INTERVAL_MS = 5_000;         // Check DB every 5 seconds

export class HILGate {
  private supabase: ReturnType<typeof createClient<Database>>;
  private twilioClient: ReturnType<typeof twilio>;
  private accountId: string;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string
  ) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
  }

  /**
   * Main HIL flow:
   * 1. Create pending confirmation record
   * 2. Send SMS to owner with approve/reject links
   * 3. Poll for response until timeout
   * Returns true if approved, false if rejected/timed-out
   */
  async requestConfirmation(
    request: HILRequest,
    timeoutMs = HIL_TIMEOUT_MS
  ): Promise<boolean> {
    // Fetch owner phone
    const ownerPhone = await this.getOwnerPhone();
    if (!ownerPhone) {
      console.warn(`[HILGate] No owner phone for account ${this.accountId} — auto-approving low-risk`);
      return request.riskLevel === "low";
    }

    // Create confirmation record
    const confirmationId = crypto.randomUUID();
    const { data: record, error } = await this.supabase
      .from("hil_confirmations")
      .insert({
        id: confirmationId,
        account_id: this.accountId,
        action_type: request.actionType,
        risk_level: request.riskLevel,
        description: request.description,
        amount: request.amount,
        payload: request.payload as never,
        sent_via: "sms",
        sent_to: ownerPhone,
        status: "pending",
        expires_at: new Date(Date.now() + timeoutMs).toISOString(),
      })
      .select("id, response_token, expires_at, status")
      .single();

    if (error || !record) {
      console.error("[HILGate] Failed to create HIL record:", error);
      return false;
    }

    // Build SMS message
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tradebrain.ai";
    const approveUrl = `${appUrl}/api/hil/confirm?token=${record.response_token}&action=approve`;
    const rejectUrl = `${appUrl}/api/hil/confirm?token=${record.response_token}&action=reject`;

    const amountStr = request.amount
      ? ` ($${request.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })})`
      : "";

    const smsBody = [
      `🤖 TradeBrain needs your OK:`,
      ``,
      `${request.description}${amountStr}`,
      ``,
      `✅ Approve: ${approveUrl}`,
      `❌ Reject: ${rejectUrl}`,
      ``,
      `Expires in 1 hour. Reply STOP to opt out.`,
    ].join("\n");

    // Send SMS
    try {
      const msg = await this.twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: ownerPhone,
      });

      await this.supabase
        .from("hil_confirmations")
        .update({ twilio_sid: msg.sid })
        .eq("id", confirmationId);
    } catch (twilioError) {
      console.error("[HILGate] SMS send failed:", twilioError);
      // If we can't send SMS, block high-risk actions
      if (request.riskLevel === "high" || request.riskLevel === "critical") {
        return false;
      }
      return true; // Auto-approve medium/low if SMS fails
    }

    // Poll for response
    return this.pollForResponse(record.response_token, timeoutMs);
  }

  /**
   * Poll the DB until owner responds or timeout elapses.
   * This runs in the agent's async context — the agent is blocked until response.
   */
  private async pollForResponse(
    responseToken: string,
    timeoutMs: number
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const { data } = await this.supabase
        .from("hil_confirmations")
        .select("status")
        .eq("response_token", responseToken)
        .single();

      if (!data) continue;

      if (data.status === "approved") return true;
      if (data.status === "rejected") return false;
      // status === "pending" → keep polling
    }

    // Timeout — mark as timed_out and return false (safe default)
    await this.supabase
      .from("hil_confirmations")
      .update({ status: "timed_out" })
      .eq("response_token", responseToken);

    return false;
  }

  /**
   * Called by the API route when the owner clicks approve/reject.
   * `/api/hil/confirm?token=xxx&action=approve`
   */
  static async handleResponse(
    supabase: ReturnType<typeof createClient<Database>>,
    responseToken: string,
    action: "approve" | "reject",
    rejectionReason?: string
  ): Promise<{ success: boolean; message: string }> {
    const { data, error } = await supabase
      .from("hil_confirmations")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        responded_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq("response_token", responseToken)
      .eq("status", "pending")
      .select("id, expires_at")
      .single();

    if (error || !data) {
      return { success: false, message: "Confirmation not found or already responded." };
    }

    if (new Date(data.expires_at) < new Date()) {
      return { success: false, message: "This confirmation has expired." };
    }

    const verb = action === "approve" ? "approved" : "rejected";
    return { success: true, message: `Action ${verb} successfully.` };
  }

  private async getOwnerPhone(): Promise<string | null> {
    const { data } = await this.supabase
      .from("accounts")
      .select("phone")
      .eq("id", this.accountId)
      .single();
    return data?.phone ?? null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
