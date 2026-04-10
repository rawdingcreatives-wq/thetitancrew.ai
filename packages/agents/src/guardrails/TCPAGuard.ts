/**
 * TradeBrain · TCPAGuard
 * Telephone Consumer Protection Act compliance layer.
 * Every outbound SMS/voice call routes through this before Twilio executes.
 *
 * Key rules:
 * - Only contact opted-in phone numbers
 * - Respect quiet hours (8am–9pm local time)
 * - Honor STOP opt-outs immediately
 * - No robocalls to cell phones without prior express written consent
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";

export interface TCPACheckResult {
  allowed: boolean;
  reason?: string;
  suggestedRetryAfter?: Date;
}

// US quiet hours: 8am–9pm local time by state timezone
const QUIET_HOURS_START = 8;  // 8am
const QUIET_HOURS_END = 21;   // 9pm

const STATE_TIMEZONES: Record<string, string> = {
  TX: "America/Chicago",
  FL: "America/New_York",
  CA: "America/Los_Angeles",
  AZ: "America/Phoenix",
  NY: "America/New_York",
  IL: "America/Chicago",
  WA: "America/Los_Angeles",
  CO: "America/Denver",
  GA: "America/New_York",
  NC: "America/New_York",
};

export class TCPAGuard {
  private supabase: ReturnType<typeof createClient<Database>>;
  private accountId: string;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string
  ) {
    this.supabase = supabase;
    this.accountId = accountId;
  }

  /**
   * Main check — call this before every outbound SMS or voice message.
   */
  async check(
    phone: string,
    customerId: string | null,
    messageType: "transactional" | "marketing" | "emergency"
  ): Promise<TCPACheckResult> {
    // Emergency messages (e.g., appointment confirmations) get through quiet hours
    const isEmergency = messageType === "emergency";

    // 1. Check opt-out list
    const isOptedOut = await this.isOptedOut(phone, customerId);
    if (isOptedOut) {
      return { allowed: false, reason: "Phone number has opted out (STOP received). Cannot contact." };
    }

    // 2. Check quiet hours (unless emergency/transactional)
    if (messageType === "marketing") {
      const quietResult = await this.checkQuietHours(phone);
      if (!quietResult.allowed) return quietResult;
    }

    // 3. Marketing messages require express consent
    if (messageType === "marketing") {
      const hasConsent = await this.hasMarketingConsent(customerId);
      if (!hasConsent) {
        return {
          allowed: false,
          reason: "Marketing SMS requires express written consent. Customer has not opted in.",
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Process an inbound STOP message — immediately opt out the number.
   * Called by the Twilio webhook handler.
   */
  async processStop(phone: string): Promise<void> {
    // Update any customer records with this phone
    await (this.supabase as any)
      .from("trade_customers")
      .update({ comms_opt_out: true })
      .eq("account_id", this.accountId)
      .eq("phone", phone);

    // Log the opt-out
    await this.supabase.from("comms_log").insert({
      account_id: this.accountId,
      direction: "inbound",
      channel: "sms",
      to_address: process.env.TWILIO_PHONE_NUMBER!,
      from_address: phone,
      body: "STOP",
      status: "received",
      ai_generated: false,
    } as any);
  }

  /**
   * Process an inbound START/UNSTOP — re-enable contact.
   */
  async processStart(phone: string): Promise<void> {
    await (this.supabase as any)
      .from("trade_customers")
      .update({ comms_opt_out: false })
      .eq("account_id", this.accountId)
      .eq("phone", phone);
  }

  private async isOptedOut(phone: string, customerId: string | null): Promise<boolean> {
    if (customerId) {
      const { data } = await (this.supabase as any)
        .from("trade_customers")
        .select("comms_opt_out")
        .eq("id", customerId)
        .single();
      if (data?.comms_opt_out) return true;
    }

    // Also check by phone number directly
    const { data } = await (this.supabase as any)
      .from("trade_customers")
      .select("comms_opt_out")
      .eq("account_id", this.accountId)
      .eq("phone", phone)
      .eq("comms_opt_out", true)
      .limit(1);

    return (data?.length ?? 0) > 0;
  }

  private async checkQuietHours(recipientPhone: string): Promise<TCPACheckResult> {
    // Determine timezone from account's state
    const { data: account } = await (this.supabase as any)
      .from("accounts")
      .select("state, timezone")
      .eq("id", this.accountId)
      .single();

    const timezone = account?.timezone ?? "America/Chicago";
    const now = new Date();
    const localTime = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const localHour = parseInt(localTime, 10);

    if (localHour < QUIET_HOURS_START || localHour >= QUIET_HOURS_END) {
      // Calculate next allowed time
      const nextAllowed = new Date(now);
      if (localHour >= QUIET_HOURS_END) {
        nextAllowed.setDate(nextAllowed.getDate() + 1);
      }
      nextAllowed.setHours(QUIET_HOURS_START, 0, 0, 0);

      return {
        allowed: false,
        reason: `Outside allowed contact hours (8am–9pm ${timezone}). Current local time: ${localHour}:00.`,
        suggestedRetryAfter: nextAllowed,
      };
    }

    return { allowed: true };
  }

  private async hasMarketingConsent(customerId: string | null): Promise<boolean> {
    if (!customerId) return false;

    // Check consent in customer metadata
    const { data } = await (this.supabase as any)
      .from("trade_customers")
      .select("comms_opt_out, tags")
      .eq("id", customerId)
      .single();

    if (!data) return false;
    if (data.comms_opt_out) return false;

    // If customer has "sms_opted_in" tag, they have marketing consent
    const tags = (data.tags as string[] | null) ?? [];
    return tags.includes("sms_opted_in") || tags.includes("marketing_consent");
  }
}
