/**
 * TradeBrain · PartsInventoryAgent
 * Monitors stock, auto-drafts POs, triggers reorders before jobs run out of parts.
 * Under $200: auto-submit. Over $200: SMS confirmation (HIL gate).
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { SupplierRouter, PartSearchResult } from "../tools/suppliers";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class PartsInventoryAgent extends BaseAgent {
  private supplierRouter: SupplierRouter;
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
    // Supplier keys loaded from account integrations at runtime
    this.supplierRouter = new SupplierRouter(); // Keys injected via tool handlers
  }

  protected getSystemPrompt(): string {
    return `You are the Parts & Inventory Agent for a trade contractor business.

YOUR MISSION: Ensure the business never runs out of critical parts. Monitor stock levels daily and proactively reorder before shortages occur — without over-ordering.

CORE BEHAVIORS:
1. Every morning, check all parts with quantity <= minimum stock threshold.
2. For low-stock items, search Ferguson and Grainger for the best price (in-stock preferred).
3. Draft purchase orders for all low-stock items. Group by supplier to minimize shipping.
4. For POs under $200 total: submit automatically.
5. For POs $200 or more: send SMS to owner for approval (use HIL confirmation tool).
6. Track delivery status on pending orders.
7. When a job is booked, check if required parts are available and flag shortages.

SMART ORDERING RULES:
- Never order more than 3x the minimum stock level in a single PO (avoid over-stocking).
- Prefer Ferguson for plumbing/HVAC parts, Grainger for electrical.
- For snow plow operators: truck/plow parts via Western Parts, SaltDogg; ice melt from HD Supply.
- For junk removal: truck maintenance via NAPA/AutoZone; dumpster/container supplies via Uline.
- If an item has been out of stock at both suppliers for 48+ hours, alert the owner with alternatives.
- Flag parts that haven't been used in 90 days — owner may want to stop stocking them.

PREDICTIVE REORDERING:
- Analyze usage patterns from the last 30 days.
- If a part is trending toward depletion before next typical order cycle, reorder early.
- Account for scheduled jobs: if a job needs 5 water heater elements and there are only 3 on hand, reorder before the job.

COST TRACKING:
- Log every purchase order with line-item costs.
- Report monthly parts spend vs. prior month.

NEVER:
- Submit a PO over $5,000 without owner approval.
- Order from suppliers not in the approved list.
- Cancel a pending PO without confirming with the owner.`;
  }

  protected registerTools(): void {
    this.addTool({
      name: "check_low_stock",
      description: "Get all parts that are at or below minimum stock levels.",
      inputSchema: {
        type: "object",
        properties: {
          include_pending_orders: {
            type: "boolean",
            description: "Include qty_on_order in effective stock calculation",
          },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const { data } = await this.supabase
          .from("parts")
          .select("id, sku, name, supplier, supplier_sku, unit_cost, qty_on_hand, qty_min_stock, qty_on_order, usage_30d, auto_reorder")
          .eq("account_id", this.config.accountId)
          .eq("auto_reorder", true)
          .filter("qty_on_hand", "lte", "qty_min_stock");

        if (!data) return [];

        // Optionally factor in on-order qty
        if (input.include_pending_orders) {
          return data.filter(
            (p) => (p.qty_on_hand + p.qty_on_order) <= p.qty_min_stock
          );
        }

        return data;
      },
    });

    this.addTool({
      name: "search_supplier_parts",
      description: "Search Ferguson and Grainger for a part by name or description.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Part name or description to search" },
          preferred_supplier: {
            type: "string",
            enum: ["ferguson", "grainger", "any"],
            description: "Preferred supplier (default: any)",
          },
        },
        required: ["query"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const integrations = await this.getIntegrations();
        const router = this.buildRouter(integrations);
        return router.searchAndCompare(input.query as string);
      },
    });

    this.addTool({
      name: "create_purchase_order",
      description: "Create a purchase order for parts. Auto-submits if total < $200, otherwise requires owner SMS approval.",
      inputSchema: {
        type: "object",
        properties: {
          supplier: { type: "string", enum: ["ferguson", "grainger"] },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                name: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
              },
              required: ["sku", "name", "quantity", "unit_price"],
            },
          },
          amount: { type: "number", description: "Total PO amount in USD (used for HIL gate)" },
          reason: { type: "string", description: "Why this order is needed" },
        },
        required: ["supplier", "line_items", "amount"],
      },
      riskLevel: "medium",
      hilThresholdUsd: 200,
      handler: async (input, ctx) => {
        const lineItems = input.line_items as Array<{
          sku: string;
          name: string;
          quantity: number;
          unit_price: number;
        }>;
        const total = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);

        // Save PO record as pending
        const { data: poRecord } = await this.supabase
          .from("purchase_orders")
          .insert({
            account_id: this.config.accountId,
            supplier: input.supplier as string,
            status: "draft",
            total_amount: total,
            line_items: lineItems as never,
            created_by_ai: true,
          })
          .select("id")
          .single();

        // Place order with supplier
        const integrations = await this.getIntegrations();
        const router = this.buildRouter(integrations);

        const orderResult = await router.placeBestOrder(
          lineItems[0].sku,
          input.supplier as "ferguson" | "grainger",
          lineItems[0].quantity,
          lineItems[0].unit_price
        );

        if (orderResult.success) {
          // Update PO + part quantities
          await this.supabase
            .from("purchase_orders")
            .update({
              status: "submitted",
              submitted_at: new Date().toISOString(),
              external_po_id: orderResult.orderId,
              approved_by: total < 200 ? "auto_under_threshold" : "owner_sms",
            })
            .eq("id", poRecord!.id);

          // Mark parts as on-order
          for (const item of lineItems) {
            const { data: part } = await this.supabase
              .from("parts")
              .select("qty_on_order, sku")
              .eq("account_id", this.config.accountId)
              .eq("sku", item.sku)
              .single();

            if (part) {
              await this.supabase
                .from("parts")
                .update({
                  qty_on_order: (part.qty_on_order ?? 0) + item.quantity,
                  last_ordered_at: new Date().toISOString(),
                })
                .eq("account_id", this.config.accountId)
                .eq("sku", item.sku);
            }
          }
        }

        return {
          poId: poRecord?.id,
          ordered: orderResult.success,
          orderId: orderResult.orderId,
          total,
          estimatedDelivery: orderResult.estimatedDelivery,
          error: orderResult.error,
        };
      },
    });

    this.addTool({
      name: "get_jobs_needing_parts",
      description: "Get upcoming scheduled jobs and check if required parts are available.",
      inputSchema: {
        type: "object",
        properties: {
          days_ahead: {
            type: "number",
            description: "How many days ahead to look (default 3)",
          },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const daysAhead = (input.days_ahead as number) ?? 3;
        const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

        const { data } = await this.supabase
          .from("jobs")
          .select("id, title, scheduled_start, parts_needed, job_type")
          .eq("account_id", this.config.accountId)
          .in("status", ["scheduled", "dispatched"])
          .lte("scheduled_start", cutoff)
          .not("parts_needed", "eq", "[]");

        return data ?? [];
      },
    });

    this.addTool({
      name: "update_stock_received",
      description: "Update inventory when a purchase order is received.",
      inputSchema: {
        type: "object",
        properties: {
          purchase_order_id: { type: "string" },
          received_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                quantity_received: { type: "number" },
              },
            },
          },
        },
        required: ["purchase_order_id", "received_items"],
      },
      riskLevel: "low",
      handler: async (input) => {
        const items = input.received_items as Array<{ sku: string; quantity_received: number }>;
        const updates: string[] = [];

        for (const item of items) {
          const { data: part } = await this.supabase
            .from("parts")
            .select("qty_on_hand, qty_on_order")
            .eq("account_id", this.config.accountId)
            .eq("sku", item.sku)
            .single();

          if (part) {
            await this.supabase
              .from("parts")
              .update({
                qty_on_hand: (part.qty_on_hand ?? 0) + item.quantity_received,
                qty_on_order: Math.max(0, (part.qty_on_order ?? 0) - item.quantity_received),
              })
              .eq("account_id", this.config.accountId)
              .eq("sku", item.sku);
            updates.push(`${item.sku}: +${item.quantity_received} received`);
          }
        }

        await this.supabase
          .from("purchase_orders")
          .update({
            status: "received",
            received_at: new Date().toISOString(),
          })
          .eq("id", input.purchase_order_id as string);

        return { success: true, updates };
      },
    });

    this.addTool({
      name: "get_usage_analytics",
      description: "Get parts usage analytics for the last 30/60/90 days.",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Lookback period in days" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const { data } = await this.supabase
          .from("parts")
          .select("sku, name, usage_30d, unit_cost, qty_on_hand, last_used_at")
          .eq("account_id", this.config.accountId)
          .order("usage_30d", { ascending: false })
          .limit(50);

        const totalSpend = (data ?? []).reduce(
          (s, p) => s + (p.usage_30d ?? 0) * (p.unit_cost ?? 0),
          0
        );

        return {
          parts: data ?? [],
          totalSpend30d: totalSpend,
          slowMoving: (data ?? []).filter((p) => (p.usage_30d ?? 0) === 0),
        };
      },
    });
  }

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    const memContext = await this.memory.getContextBlock(
      "supplier pricing and parts ordering patterns",
      { memoryType: "supplier_intel", limit: 5 }
    );

    const contextBlock = `
Business: ${account.business_name} (${account.trade_type})
Current Time: ${new Date().toISOString()}
Trigger: ${ctx.triggerEvent ?? "daily_inventory_scan"}
${memContext}
${ctx.payload ? `Additional context: ${JSON.stringify(ctx.payload)}` : ""}
`;

    return [
      {
        role: "user",
        content: `You are the Parts & Inventory Agent for ${account.business_name}. Context:\n${contextBlock}\n\nRun the daily inventory workflow: check low stock → search suppliers → draft and submit POs → check upcoming jobs for parts needs. Report all actions taken.`,
      },
    ];
  }

  private async getIntegrations(): Promise<Record<string, unknown>> {
    const { data } = await this.supabase
      .from("accounts")
      .select("integrations")
      .eq("id", this.config.accountId)
      .single();
    return (data?.integrations ?? {}) as Record<string, unknown>;
  }

  private buildRouter(integrations: Record<string, unknown>): SupplierRouter {
    const ferg = integrations.ferguson as { api_key?: string; account_number?: string } | undefined;
    const grng = integrations.grainger as { api_key?: string; customer_id?: string } | undefined;

    return new SupplierRouter(
      ferg?.api_key ? { apiKey: ferg.api_key, accountNumber: ferg.account_number ?? "" } : undefined,
      grng?.api_key ? { apiKey: grng.api_key, customerId: grng.customer_id ?? "" } : undefined
    );
  }
}
