/**
 * TradeBrain · LiabilityFilter
 * Pre-flight safety check before any tool executes.
 * Blocks legally dangerous, financially excessive, or out-of-scope actions.
 */

export interface LiabilityCheckResult {
  allowed: boolean;
  reason?: string;
  requiresEscalation?: boolean;
}

export interface LiabilityRule {
  name: string;
  check: (toolName: string, input: Record<string, unknown>) => LiabilityCheckResult | null;
}

export class LiabilityFilter {
  private rules: LiabilityRule[];

  constructor() {
    this.rules = [
      // ── Financial limits ──────────────────────────────────────
      {
        name: "max_single_purchase",
        check: (tool, input) => {
          if (!tool.includes("purchase") && !tool.includes("order")) return null;
          const amount = typeof input.amount === "number" ? input.amount : 0;
          if (amount > 5000) {
            return {
              allowed: false,
              reason: `Single purchase of $${amount} exceeds $5,000 agent limit. Owner approval required.`,
              requiresEscalation: true,
            };
          }
          return null;
        },
      },
      {
        name: "max_single_invoice",
        check: (tool, input) => {
          if (!tool.includes("invoice")) return null;
          const amount = typeof input.amount === "number" ? input.amount : 0;
          if (amount > 25_000) {
            return {
              allowed: false,
              reason: `Invoice of $${amount} exceeds $25,000 agent limit. Manual review required.`,
              requiresEscalation: true,
            };
          }
          return null;
        },
      },
      {
        name: "no_refunds_over_500",
        check: (tool, input) => {
          if (!tool.includes("refund")) return null;
          const amount = typeof input.amount === "number" ? input.amount : 0;
          if (amount > 500) {
            return {
              allowed: false,
              reason: `Refunds over $500 require owner approval.`,
              requiresEscalation: true,
            };
          }
          return null;
        },
      },

      // ── Communication guardrails ──────────────────────────────
      {
        name: "no_bulk_sms_without_list",
        check: (tool, input) => {
          if (!tool.includes("sms") && !tool.includes("twilio")) return null;
          const recipients = input.recipients;
          if (Array.isArray(recipients) && recipients.length > 50) {
            return {
              allowed: false,
              reason: `Bulk SMS to ${recipients.length} recipients requires manual review (TCPA risk).`,
              requiresEscalation: true,
            };
          }
          return null;
        },
      },
      {
        name: "no_legal_or_medical_advice",
        check: (tool, input) => {
          if (!tool.includes("comm") && !tool.includes("email") && !tool.includes("sms")) return null;
          const body = String(input.body ?? input.message ?? "").toLowerCase();
          const legalTerms = ["sue", "lawsuit", "attorney", "negligence", "liable", "medical", "injury"];
          const found = legalTerms.find((t) => body.includes(t));
          if (found) {
            return {
              allowed: false,
              reason: `Message contains legal/medical term "${found}". Escalate to owner.`,
              requiresEscalation: true,
            };
          }
          return null;
        },
      },

      // ── Data privacy ──────────────────────────────────────────
      {
        name: "no_pii_in_logs",
        check: (tool, input) => {
          if (!tool.includes("log") && !tool.includes("store")) return null;
          const str = JSON.stringify(input);
          // Basic SSN pattern
          if (/\b\d{3}-\d{2}-\d{4}\b/.test(str)) {
            return {
              allowed: false,
              reason: "Potential SSN detected in action input. Blocked to prevent PII logging.",
            };
          }
          // Credit card pattern
          if (/\b(?:\d[ -]?){13,16}\b/.test(str)) {
            return {
              allowed: false,
              reason: "Potential credit card number detected. Blocked to prevent PII logging.",
            };
          }
          return null;
        },
      },

      // ── Scope guardrails ──────────────────────────────────────
      {
        name: "no_external_banking",
        check: (tool, _input) => {
          if (tool.includes("bank_transfer") || tool.includes("wire")) {
            return {
              allowed: false,
              reason: "Bank transfers and wire operations are not permitted for AI agents.",
            };
          }
          return null;
        },
      },
      {
        name: "no_social_media_posting",
        check: (tool, _input) => {
          if (
            tool.includes("post_tweet") ||
            tool.includes("facebook_post") ||
            tool.includes("instagram_post")
          ) {
            return {
              allowed: false,
              reason: "Direct social media posting requires owner approval.",
              requiresEscalation: true,
            };
          }
          return null;
        },
      },
    ];
  }

  check(toolName: string, input: Record<string, unknown>): LiabilityCheckResult {
    for (const rule of this.rules) {
      const result = rule.check(toolName, input);
      if (result !== null) {
        // A rule fired — return its result
        return result;
      }
    }
    // No rules blocked this action
    return { allowed: true };
  }

  /** Add a custom rule at runtime (used by Performance Optimizer to inject account-specific rules) */
  addRule(rule: LiabilityRule): void {
    this.rules.push(rule);
  }
}
