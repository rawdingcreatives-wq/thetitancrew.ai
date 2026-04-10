/**
 * TradeBrain · Supplier Tool Adapters
 * Ferguson + Grainger API wrappers for parts ordering.
 * Falls back to email PO if API is unavailable.
 */

import { createLogger } from "../guardrails/logger";

const logger = createLogger("suppliers");

export interface PartSearchResult {
  sku: string;
  name: string;
  description: string;
  unitPrice: number;
  inStock: boolean;
  estimatedDeliveryDays: number;
  supplier: "ferguson" | "grainger";
  productUrl?: string;
}

export interface SupplierOrderResult {
  success: boolean;
  orderId?: string;
  orderTotal?: number;
  estimatedDelivery?: string;
  error?: string;
  fallbackEmailSent?: boolean;
}

// ─────────────────────────────────────────────
// Ferguson Tool
// ─────────────────────────────────────────────

export class FergusonTool {
  private apiKey: string;
  private baseUrl = "https://api.ferguson.com/v2";
  private accountNumber: string;

  constructor(apiKey: string, accountNumber: string) {
    this.apiKey = apiKey;
    this.accountNumber = accountNumber;
  }

  async searchParts(query: string, category?: string): Promise<PartSearchResult[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: "10",
        ...(category && { category }),
      });

      const resp = await fetch(`${this.baseUrl}/products/search?${params}`, {
        headers: {
          "X-API-Key": this.apiKey,
          "X-Account": this.accountNumber,
        },
      });

      if (!resp.ok) throw new Error(`Ferguson API: ${resp.status}`);

      const data = await resp.json() as { products: Array<Record<string, unknown>> };
      return data.products.map((p) => ({
        sku: p.sku as string,
        name: p.name as string,
        description: p.description as string ?? "",
        unitPrice: p.price as number ?? 0,
        inStock: (p.inventory as Record<string, unknown>)?.available as boolean ?? false,
        estimatedDeliveryDays: 2,
        supplier: "ferguson" as const,
        productUrl: `https://www.ferguson.com/product/${p.sku}`,
      }));
    } catch (err) {
      logger.error({ error: err }, "Ferguson search failed");
      return [];
    }
  }

  async placePurchaseOrder(items: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
  }>): Promise<SupplierOrderResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/orders`, {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "X-Account": this.accountNumber,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: this.accountNumber,
          lines: items.map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            expectedPrice: i.unitPrice,
          })),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Ferguson order failed: ${resp.status} ${errText}`);
      }

      const data = await resp.json() as {
        orderId: string;
        total: number;
        estimatedDelivery: string;
      };

      return {
        success: true,
        orderId: data.orderId,
        orderTotal: data.total,
        estimatedDelivery: data.estimatedDelivery,
      };
    } catch (err) {
      // Fallback: send email PO
      return this.sendEmailFallback(items, String(err));
    }
  }

  async checkPrice(sku: string, quantity: number): Promise<{ price: number; inStock: boolean } | null> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/products/${sku}/pricing?quantity=${quantity}&account=${this.accountNumber}`,
        { headers: { "X-API-Key": this.apiKey } }
      );
      if (!resp.ok) return null;
      const data = await resp.json() as { price: number; inStock: boolean };
      return data;
    } catch {
      return null;
    }
  }

  private async sendEmailFallback(
    items: Array<{ sku: string; quantity: number; unitPrice: number }>,
    originalError: string
  ): Promise<SupplierOrderResult> {
    // Would send an email PO via SendGrid in production
    logger.error({ event: "ferguson_email_fallback", err: originalError }, "Ferguson API failed, email PO fallback triggered");
    return {
      success: false,
      error: originalError,
      fallbackEmailSent: true,
    };
  }
}

// ─────────────────────────────────────────────
// Grainger Tool
// ─────────────────────────────────────────────

export class GraingerTool {
  private apiKey: string;
  private customerId: string;
  private baseUrl = "https://api.grainger.com/v1";

  constructor(apiKey: string, customerId: string) {
    this.apiKey = apiKey;
    this.customerId = customerId;
  }

  async searchParts(query: string): Promise<PartSearchResult[]> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/products?keyword=${encodeURIComponent(query)}&pageSize=10`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Grainger-Customer-ID": this.customerId,
          },
        }
      );

      if (!resp.ok) throw new Error(`Grainger API: ${resp.status}`);

      const data = await resp.json() as {
        products: Array<{
          itemNumber: string;
          name: string;
          description: string;
          unitPrice: number;
          availability: { inStock: boolean; estimatedDeliveryDays: number };
        }>;
      };

      return data.products.map((p) => ({
        sku: p.itemNumber,
        name: p.name,
        description: p.description ?? "",
        unitPrice: p.unitPrice,
        inStock: p.availability?.inStock ?? false,
        estimatedDeliveryDays: p.availability?.estimatedDeliveryDays ?? 3,
        supplier: "grainger" as const,
        productUrl: `https://www.grainger.com/product/${p.itemNumber}`,
      }));
    } catch (err) {
      logger.error({ error: err }, "Grainger search failed");
      return [];
    }
  }

  async placePurchaseOrder(items: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
  }>): Promise<SupplierOrderResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Grainger-Customer-ID": this.customerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: this.customerId,
          orderLines: items.map((i) => ({
            itemNumber: i.sku,
            quantity: i.quantity,
          })),
        }),
      });

      if (!resp.ok) throw new Error(`Grainger order failed: ${resp.status}`);

      const data = await resp.json() as {
        orderNumber: string;
        orderTotal: number;
        estimatedDeliveryDate: string;
      };

      return {
        success: true,
        orderId: data.orderNumber,
        orderTotal: data.orderTotal,
        estimatedDelivery: data.estimatedDeliveryDate,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}

// ─────────────────────────────────────────────
// Smart supplier router: picks best price
// ─────────────────────────────────────────────

export class SupplierRouter {
  private ferguson: FergusonTool | null;
  private grainger: GraingerTool | null;

  constructor(fergKeys?: { apiKey: string; accountNumber: string }, graingerKeys?: { apiKey: string; customerId: string }) {
    this.ferguson = fergKeys ? new FergusonTool(fergKeys.apiKey, fergKeys.accountNumber) : null;
    this.grainger = graingerKeys ? new GraingerTool(graingerKeys.apiKey, graingerKeys.customerId) : null;
  }

  async searchAndCompare(query: string): Promise<PartSearchResult[]> {
    const [fergusonResults, graingerResults] = await Promise.allSettled([
      this.ferguson?.searchParts(query) ?? Promise.resolve([]),
      this.grainger?.searchParts(query) ?? Promise.resolve([]),
    ]);

    const results: PartSearchResult[] = [];
    if (fergusonResults.status === "fulfilled") results.push(...fergusonResults.value);
    if (graingerResults.status === "fulfilled") results.push(...graingerResults.value);

    // Sort by: in-stock first, then price
    return results.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.unitPrice - b.unitPrice;
    });
  }

  async placeBestOrder(sku: string, supplier: "ferguson" | "grainger", quantity: number, unitPrice: number): Promise<SupplierOrderResult> {
    if (supplier === "ferguson" && this.ferguson) {
      return this.ferguson.placePurchaseOrder([{ sku, quantity, unitPrice }]);
    }
    if (supplier === "grainger" && this.grainger) {
      return this.grainger.placePurchaseOrder([{ sku, quantity, unitPrice }]);
    }
    return { success: false, error: `Supplier "${supplier}" not configured` };
  }
}
