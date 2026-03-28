/**
 * TradeBrain · Twilio Tool Adapter
 * SMS + Voice outreach for customer comm and owner notifications.
 * All outbound calls route through TCPAGuard before executing.
 */

import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { TCPAGuard } from "../guardrails/TCPAGuard";
import type { Database } from "../../shared/types/database.types";

export interface SMSResult {
  success: boolean;
  sid?: string;
  error?: string;
  blocked?: boolean;
  blockReason?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callSid?: string;
  error?: string;
  blocked?: boolean;
}

export class TwilioTool {
  private client: ReturnType<typeof twilio>;
  private supabase: ReturnType<typeof createClient<Database>>;
  private tcpaGuard: TCPAGuard;
  private accountId: string;
  private fromNumber: string;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string
  ) {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    this.supabase = supabase;
    this.accountId = accountId;
    this.tcpaGuard = new TCPAGuard(supabase, accountId);
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER!;
  }

  /**
   * Send an SMS message with full TCPA compliance check.
   */
  async sendSMS(params: {
    to: string;
    body: string;
    customerId?: string;
    jobId?: string;
    messageType?: "transactional" | "marketing" | "emergency";
    agentRunId?: string;
  }): Promise<SMSResult> {
    const messageType = params.messageType ?? "transactional";

    // TCPA pre-flight
    const tcpaCheck = await this.tcpaGuard.check(
      params.to,
      params.customerId ?? null,
      messageType
    );

    if (!tcpaCheck.allowed) {
      await this.logComm({
        direction: "outbound",
        channel: "sms",
        to: params.to,
        body: params.body,
        status: "blocked",
        customerId: params.customerId,
        jobId: params.jobId,
        agentRunId: params.agentRunId,
      });
      return { success: false, blocked: true, blockReason: tcpaCheck.reason };
    }

    try {
      const message = await this.client.messages.create({
        body: params.body,
        from: this.fromNumber,
        to: params.to,
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`,
      });

      await this.logComm({
        direction: "outbound",
        channel: "sms",
        to: params.to,
        body: params.body,
        status: message.status,
        externalId: message.sid,
        customerId: params.customerId,
        jobId: params.jobId,
        agentRunId: params.agentRunId,
      });

      return { success: true, sid: message.sid };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.logComm({
        direction: "outbound",
        channel: "sms",
        to: params.to,
        body: params.body,
        status: "failed",
        customerId: params.customerId,
        jobId: params.jobId,
        agentRunId: params.agentRunId,
      });
      return { success: false, error };
    }
  }

  /**
   * Make an outbound voice call using a TwiML URL.
   * Used for appointment reminders and urgent notifications.
   */
  async makeCall(params: {
    to: string;
    twimlUrl: string;    // URL serving TwiML for the call flow
    customerId?: string;
    messageType?: "transactional" | "marketing" | "emergency";
  }): Promise<VoiceCallResult> {
    const messageType = params.messageType ?? "transactional";

    const tcpaCheck = await this.tcpaGuard.check(
      params.to,
      params.customerId ?? null,
      messageType
    );

    if (!tcpaCheck.allowed) {
      return { success: false, blocked: true };
    }

    try {
      const call = await this.client.calls.create({
        to: params.to,
        from: this.fromNumber,
        url: params.twimlUrl,
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`,
      });
      return { success: true, callSid: call.sid };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Send a batch of SMS messages (with TCPA checks for each).
   * Rate-limited to 10 SMS/second per Twilio A2P 10DLC guidelines.
   */
  async sendBulkSMS(
    messages: Array<{
      to: string;
      body: string;
      customerId?: string;
      messageType?: "transactional" | "marketing" | "emergency";
    }>
  ): Promise<{ sent: number; blocked: number; failed: number }> {
    let sent = 0, blocked = 0, failed = 0;

    for (const msg of messages) {
      const result = await this.sendSMS(msg);
      if (result.blocked) blocked++;
      else if (result.success) sent++;
      else failed++;

      // Rate limit: 100ms between messages
      await new Promise((r) => setTimeout(r, 100));
    }

    return { sent, blocked, failed };
  }

  /**
   * Handle inbound webhook from Twilio (status callbacks + inbound messages).
   */
  async handleInboundSMS(from: string, body: string): Promise<void> {
    const normalizedBody = body.trim().toUpperCase();

    // Handle opt-out keywords per TCPA
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalizedBody)) {
      await this.tcpaGuard.processStop(from);
    } else if (["START", "UNSTOP", "YES"].includes(normalizedBody)) {
      await this.tcpaGuard.processStart(from);
    }

    // Log inbound
    await this.logComm({
      direction: "inbound",
      channel: "sms",
      to: this.fromNumber,
      from: from,
      body,
      status: "received",
    });
  }

  private async logComm(params: {
    direction: string;
    channel: "sms" | "voice";
    to: string;
    from?: string;
    body?: string;
    status: string;
    externalId?: string;
    customerId?: string;
    jobId?: string;
    agentRunId?: string;
  }): Promise<void> {
    try {
      await this.supabase.from("comms_log").insert({
        account_id: this.accountId,
        customer_id: params.customerId,
        job_id: params.jobId,
        agent_run_id: params.agentRunId,
        direction: params.direction,
        channel: params.channel,
        to_address: params.to,
        from_address: params.from ?? this.fromNumber,
        body: params.body,
        status: params.status,
        external_id: params.externalId,
        ai_generated: true,
        cost_usd: 0.0075, // Twilio SMS ~$0.0075/msg
      });
    } catch (err) {
      console.error("[TwilioTool] Failed to log comm:", err);
    }
  }
}
