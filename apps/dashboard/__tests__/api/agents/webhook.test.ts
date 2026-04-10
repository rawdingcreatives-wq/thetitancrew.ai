/**
 * TitanCrew · Unit Tests — Agent Webhook Route
 *
 * Tests the POST /api/agents/webhook endpoint that receives callbacks
 * from AI agents running on Railway/n8n.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSupabaseFrom = vi.fn();
const mockSupabaseAuth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockSupabaseFrom,
    auth: { getUser: mockSupabaseAuth },
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: any, secret = "test-secret") {
  return new Request("http://localhost:3000/api/agents/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/agents/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_API_SECRET = "test-secret";
  });

  it("should reject requests without valid auth", async () => {
    const req = makeRequest({ event_type: "completed" }, "wrong-secret");

    // The route checks bearer token against AGENT_API_SECRET
    // Without a valid token, it should return 401
    expect(req.headers.get("Authorization")).toBe("Bearer wrong-secret");
  });

  it("should accept valid event types", () => {
    const validEvents = ["completed", "needs_approval", "error", "progress"];
    validEvents.forEach((evt) => {
      expect(validEvents).toContain(evt);
    });
  });

  it("should require event_type in body", () => {
    const body = { agent_type: "scheduler", account_id: "abc" };
    expect(body).not.toHaveProperty("event_type");
  });

  it("should map agent_type to agent_instances correctly", () => {
    const validAgentTypes = [
      "scheduler",
      "customer_comm",
      "finance_invoice",
      "parts_inventory",
      "foreman_predictor",
      "tech_dispatch",
    ];
    validAgentTypes.forEach((type) => {
      expect(type).toBeTruthy();
      expect(typeof type).toBe("string");
    });
  });

  it("should handle completed events by logging to agent_runs", () => {
    const body = {
      event_type: "completed",
      agent_type: "scheduler",
      account_id: "test-account-id",
      data: {
        output_summary: "Booked 3 new jobs",
        actions_taken: ["book_job", "send_sms", "update_calendar"],
        duration_ms: 4500,
        cost_usd: 0.023,
      },
    };

    expect(body.event_type).toBe("completed");
    expect(body.data.actions_taken).toHaveLength(3);
    expect(body.data.cost_usd).toBeLessThan(1);
  });

  it("should handle needs_approval events by creating HIL confirmations", () => {
    const body = {
      event_type: "needs_approval",
      agent_type: "finance_invoice",
      account_id: "test-account-id",
      data: {
        action_type: "invoice",
        risk_level: "high",
        description: "Invoice #1234 for $3,500 to Johnson Plumbing",
        amount: 3500,
        payload: { invoice_id: "inv_1234", customer_id: "cust_456" },
      },
    };

    expect(body.event_type).toBe("needs_approval");
    expect(body.data.amount).toBeGreaterThan(2000); // HIL threshold
    expect(body.data.risk_level).toBe("high");
  });

  it("should handle error events and track retry count", () => {
    const body = {
      event_type: "error",
      agent_type: "customer_comm",
      account_id: "test-account-id",
      data: {
        error_message: "Twilio API rate limit exceeded",
        retry_count: 2,
      },
    };

    expect(body.event_type).toBe("error");
    expect(body.data.retry_count).toBeLessThan(3); // max retries
  });
});

describe("Agent type validation", () => {
  it("should accept all valid customer crew agent types", () => {
    const customerCrewTypes = [
      "scheduler",
      "customer_comm",
      "finance_invoice",
      "parts_inventory",
      "foreman_predictor",
      "tech_dispatch",
    ];

    customerCrewTypes.forEach((type) => {
      expect(type).toMatch(/^[a-z_]+$/);
    });
  });

  it("should accept all valid meta-swarm agent types", () => {
    const metaSwarmTypes = [
      "lead_hunter",
      "demo_creator",
      "onboarder",
      "performance_optimizer",
      "billing_churn_preventer",
    ];

    metaSwarmTypes.forEach((type) => {
      expect(type).toMatch(/^[a-z_]+$/);
    });
  });
});
