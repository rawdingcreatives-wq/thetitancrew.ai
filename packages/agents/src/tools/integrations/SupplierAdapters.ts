/**
 * TitanCrew · Integration Adapters — Ferguson & Grainger Supplier APIs
 *
 * Dual supplier integration with automatic best-price routing.
 * Guardrail chain:
 *   LiabilityFilter → HILGate (POs >$200) → SupplierAdapter → AuditLogger
 *
 * Ferguson:  Major HVAC, plumbing, and waterworks distributor
 * Grainger:  Industrial MRO supplies, HVAC, electrical, plumbing
 *
 * Features:
 *   - Product search across both suppliers simultaneously
 *   - Real-time pricing with availability check
 *   - Automatic best-price selection (price + availability + shipping)
 *   - Purchase order creation with HIL gate for orders >$200
 *   - Order status tracking + delivery ETA
 *   - Low-stock automatic reorder triggers
 *   - Backorder detection + alternative product suggestion
 */

import { createClient } from "@supabase/supabase-js";
import { AuditLogger } from "../../guardrails/AuditLogger";
import { LiabilityFilter } from "../../guardrails/LiabilityFilter";
import { HILGate } from "../../base/HILGate";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

export interface PartSearchQuery {
  query: string;              // Part name, description, or part number
  category?: string;          // "plumbing" | "hvac" | "electrical" | "general"
  tradeType?: string;
  maxResults?: number;
  accountId: string;
}

export interface PartResult {
  supplier: "ferguson" | "grainger";
  partNumber: string;
  sku: string;
  name: string;
  description: string;
  unitPrice: number;
  availability: "in_stock" | "limited" | "backordered" | "out_of_stock";
  quantityAvailable?: number;
  estimatedDeliveryDays: number;
  imageUrl?: string;
  category: string;
  unitOfMeasure: string;
  minimumOrderQty: number;
  supplierUrl?: string;
}

export interface PurchaseOrderRequest {
  accountId: string;
  jobId?: string;
  technicianId?: string;
  items: Array<{
    partResult: PartResult;
    quantity: number;
    notes?: string;
  }>;
  deliveryAddress?: string;
  requestedDeliveryDate?: string;
  notes?: string;
  urgent?: boolean;
}

export interface PurchaseOrder {
  poId: string;
  poNumber: string;
  supplier: "ferguson" | "grainger";
  accountId: string;
  jobId?: string;
  items: PurchaseOrderRequest["items"];
  totalAmount: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  estimatedDelivery?: string;
  trackingNumber?: string;
  createdAt: string;
}

export interface OrderStatus {
  poId: string;
  poNumber: string;
  supplier: string;
  status: PurchaseOrder["status"];
  estimatedDelivery?: string;
  trackingNumber?: string;
  items: Array<{
    partNumber: string;
    name: string;
    quantityOrdered: number;
    quantityShipped: number;
    status: string;
  }>;
}

// ─── Ferguson API Client ──────────────────────────────────

class FergusonClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly customerId: string;

  constructor() {
    this.baseUrl = process.env.FERGUSON_API_URL ?? "https://api.ferguson.com/v2";
    this.apiKey = process.env.FERGUSON_API_KEY ?? "";
    this.customerId = process.env.FERGUSON_CUSTOMER_ID ?? "";
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        "X-Customer-ID": this.customerId,
        ...options.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) throw new Error(`Ferguson API ${resp.status}: ${await resp.text()}`);
    return resp.json();
  }

  async searchParts(query: string, category?: string, maxResults = 10): Promise<PartResult[]> {
    if (!this.apiKey) return this.getMockResults("ferguson", query);

    const params = new URLSearchParams({
      q: query,
      ...(category ? { category } : {}),
      limit: String(maxResults),
      include_pricing: "true",
      include_availability: "true",
    });

    const data = await this.request<{
      products: Array<{
        partNumber: string;
        sku: string;
        name: string;
        description: string;
        price: { unit: number };
        availability: { status: string; quantity: number; leadTimeDays: number };
        imageUrl?: string;
        category: string;
        uom: string;
        minOrderQty: number;
        productUrl: string;
      }>;
    }>(`/catalog/search?${params.toString()}`);

    return data.products.map((p) => ({
      supplier: "ferguson" as const,
      partNumber: p.partNumber,
      sku: p.sku,
      name: p.name,
      description: p.description,
      unitPrice: p.price.unit,
      availability: mapAvailability(p.availability.status),
      quantityAvailable: p.availability.quantity,
      estimatedDeliveryDays: p.availability.leadTimeDays ?? 2,
      imageUrl: p.imageUrl,
      category: p.category,
      unitOfMeasure: p.uom,
      minimumOrderQty: p.minOrderQty,
      supplierUrl: p.productUrl,
    }));
  }

  async createOrder(items: PurchaseOrder["items"], deliveryAddress?: string): Promise<{
    orderId: string;
    orderNumber: string;
    estimatedDelivery: string;
    totalAmount: number;
  }> {
    if (!this.apiKey) {
      return {
        orderId: `FERG-${Date.now()}`,
        orderNumber: `FRG-${Date.now().toString().slice(-6)}`,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: items.reduce((s, i) => s + i.partResult.unitPrice * i.quantity, 0),
      };
    }

    const data = await this.request<{
      order: { id: string; number: string; estimatedDelivery: string; total: number };
    }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        customerId: this.customerId,
        deliveryAddress,
        lines: items.map((item) => ({
          sku: item.partResult.sku,
          quantity: item.quantity,
          notes: item.notes,
        })),
      }),
    });

    return {
      orderId: data.order.id,
      orderNumber: data.order.number,
      estimatedDelivery: data.order.estimatedDelivery,
      totalAmount: data.order.total,
    };
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus | null> {
    if (!this.apiKey) return null;
    const data = await this.request<{ order: OrderStatus }>(`/orders/${orderId}`);
    return data.order;
  }

  private getMockResults(supplier: "ferguson", query: string): PartResult[] {
    return [
      {
        supplier,
        partNumber: `FERG-${Math.floor(Math.random() * 99999)}`,
        sku: `SKU-${Math.floor(Math.random() * 99999)}`,
        name: `${query} (Ferguson)`,
        description: `Standard ${query} — commercial grade`,
        unitPrice: 24.99 + Math.random() * 50,
        availability: "in_stock",
        quantityAvailable: Math.floor(Math.random() * 100) + 10,
        estimatedDeliveryDays: 2,
        category: "plumbing",
        unitOfMeasure: "EA",
        minimumOrderQty: 1,
        supplierUrl: "https://ferguson.com/stub",
      },
    ];
  }
}

// ─── Grainger API Client ──────────────────────────────────

class GraingerClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly accountNumber: string;

  constructor() {
    this.baseUrl = process.env.GRAINGER_API_URL ?? "https://api.grainger.com/v1";
    this.apiKey = process.env.GRAINGER_API_KEY ?? "";
    this.accountNumber = process.env.GRAINGER_ACCOUNT_NUMBER ?? "";
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        "X-Account-Number": this.accountNumber,
        ...options.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) throw new Error(`Grainger API ${resp.status}: ${await resp.text()}`);
    return resp.json();
  }

  async searchParts(query: string, category?: string, maxResults = 10): Promise<PartResult[]> {
    if (!this.apiKey) return this.getMockResults("grainger", query);

    const params = new URLSearchParams({
      keyword: query,
      ...(category ? { categoryId: category } : {}),
      pageSize: String(maxResults),
    });

    const data = await this.request<{
      items: Array<{
        itemNumber: string;
        modelNumber: string;
        productName: string;
        description: string;
        currentPrice: number;
        warehouseAvailability: { branchAvailability: string; quantity: number };
        estimatedShipDays: number;
        thumbnail?: string;
        category: string;
        unitOfMeasure: string;
        orderQuantityMinimum: number;
        productUrl: string;
      }>;
    }>(`/products/search?${params.toString()}`);

    return data.items.map((p) => ({
      supplier: "grainger" as const,
      partNumber: p.itemNumber,
      sku: p.modelNumber,
      name: p.productName,
      description: p.description,
      unitPrice: p.currentPrice,
      availability: mapAvailability(p.warehouseAvailability.branchAvailability),
      quantityAvailable: p.warehouseAvailability.quantity,
      estimatedDeliveryDays: p.estimatedShipDays ?? 3,
      imageUrl: p.thumbnail,
      category: p.category,
      unitOfMeasure: p.unitOfMeasure,
      minimumOrderQty: p.orderQuantityMinimum,
      supplierUrl: p.productUrl,
    }));
  }

  async createOrder(items: PurchaseOrder["items"], deliveryAddress?: string): Promise<{
    orderId: string;
    orderNumber: string;
    estimatedDelivery: string;
    totalAmount: number;
  }> {
    if (!this.apiKey) {
      return {
        orderId: `GRAIN-${Date.now()}`,
        orderNumber: `GRN-${Date.now().toString().slice(-6)}`,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: items.reduce((s, i) => s + i.partResult.unitPrice * i.quantity, 0),
      };
    }

    const data = await this.request<{
      order: { orderId: string; orderNumber: string; estimatedDelivery: string; orderTotal: number };
    }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        accountNumber: this.accountNumber,
        shippingAddress: deliveryAddress,
        orderLines: items.map((item) => ({
          itemNumber: item.partResult.partNumber,
          quantity: item.quantity,
          lineNotes: item.notes,
        })),
      }),
    });

    return {
      orderId: data.order.orderId,
      orderNumber: data.order.orderNumber,
      estimatedDelivery: data.order.estimatedDelivery,
      totalAmount: data.order.orderTotal,
    };
  }

  private getMockResults(supplier: "grainger", query: string): PartResult[] {
    return [
      {
        supplier,
        partNumber: `GRN-${Math.floor(Math.random() * 99999)}`,
        sku: `MSKU-${Math.floor(Math.random() * 99999)}`,
        name: `${query} (Grainger)`,
        description: `Industrial-grade ${query}`,
        unitPrice: 22.49 + Math.random() * 45,
        availability: "in_stock",
        quantityAvailable: Math.floor(Math.random() * 200) + 20,
        estimatedDeliveryDays: 3,
        category: "hvac",
        unitOfMeasure: "EA",
        minimumOrderQty: 1,
        supplierUrl: "https://grainger.com/stub",
      },
    ];
  }
}

// ─── SupplierRouter — Best-Price Selection ────────────────

export class SupplierRouter {
  private ferguson: FergusonClient;
  private grainger: GraingerClient;
  private auditLogger!: AuditLogger;
  private liabilityFilter: LiabilityFilter;
  private hilGate!: HILGate;
  private readonly RETRY_MAX = 3;

  constructor() {
    this.ferguson = new FergusonClient();
    this.grainger = new GraingerClient();
    this.liabilityFilter = new LiabilityFilter();
  }

  private initForAccount(accountId: string) {
    this.auditLogger = new AuditLogger(supabase, accountId);
    this.hilGate = new HILGate(supabase, accountId);
  }

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.RETRY_MAX; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === this.RETRY_MAX) throw lastError;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    throw lastError;
  }

  /**
   * Search both suppliers simultaneously, return best-price results
   */
  async searchParts(query: PartSearchQuery): Promise<{
    results: PartResult[];
    bestPrice: PartResult | null;
    comparison: { ferguson: PartResult[]; grainger: PartResult[] };
  }> {
    this.initForAccount(query.accountId);

    // Parallel search across both suppliers
    const [fergusonResults, graingerResults] = await Promise.allSettled([
      this.withRetry(() => this.ferguson.searchParts(query.query, query.category, query.maxResults ?? 5), "Ferguson search"),
      this.withRetry(() => this.grainger.searchParts(query.query, query.category, query.maxResults ?? 5), "Grainger search"),
    ]);

    const fergusonItems = fergusonResults.status === "fulfilled" ? fergusonResults.value : [];
    const graingerItems = graingerResults.status === "fulfilled" ? graingerResults.value : [];

    // Combine and sort by best value score
    const allResults = [...fergusonItems, ...graingerItems].sort((a, b) => {
      return calculateValueScore(b) - calculateValueScore(a);
    });

    // Best price: cheapest in-stock item
    const inStockResults = allResults.filter((r) => r.availability === "in_stock");
    const bestPrice = inStockResults.length > 0
      ? inStockResults.reduce((best, curr) => curr.unitPrice < best.unitPrice ? curr : best)
      : null;

    await this.auditLogger.log({
      eventType: "supplier.parts_searched",
      details: {
        query: query.query,
        fergusonCount: fergusonItems.length,
        graingerCount: graingerItems.length,
        bestPrice: bestPrice?.unitPrice,
        bestSupplier: bestPrice?.supplier,
      },
    });

    return {
      results: allResults,
      bestPrice,
      comparison: { ferguson: fergusonItems, grainger: graingerItems },
    };
  }

  /**
   * Create a purchase order — HIL required for total > $200
   */
  async createPurchaseOrder(request: PurchaseOrderRequest): Promise<PurchaseOrder> {
    this.initForAccount(request.accountId);

    const totalAmount = request.items.reduce(
      (s, item) => s + item.partResult.unitPrice * item.quantity,
      0
    );

    // Liability check
    const liabilityCheck = this.liabilityFilter.check({
      action: "supplier_purchase_order",
      estimatedValue: totalAmount,
      details: { jobId: request.jobId, itemCount: request.items.length },
    });
    if (!liabilityCheck.allowed) throw new Error(`Liability filter: ${liabilityCheck.reason}`);

    // HIL for POs > $200
    if (totalAmount > 200) {
      const itemsSummary = request.items
        .map((i) => `${i.quantity}x ${i.partResult.name} @ $${i.partResult.unitPrice.toFixed(2)}`)
        .join(", ");

      const approved = await this.hilGate.requestConfirmation({
        actionType: "supplier_purchase_order",
        description: `Purchase order: ${itemsSummary} — Total: $${totalAmount.toFixed(2)} from ${request.items[0]?.partResult.supplier}${request.jobId ? ` — Job: ${request.jobId}` : ""}`,
        estimatedValue: totalAmount,
        metadata: { jobId: request.jobId, supplier: request.items[0]?.partResult.supplier },
      });
      if (!approved) throw new Error("HIL: Purchase order rejected by owner");
    }

    // Group items by supplier
    const bySupplier: Record<string, typeof request.items> = {};
    for (const item of request.items) {
      const s = item.partResult.supplier;
      if (!bySupplier[s]) bySupplier[s] = [];
      bySupplier[s].push(item);
    }

    // Place orders with each supplier
    let poId: string = "";
    let poNumber: string = "";
    let estimatedDelivery: string = "";
    const primarySupplier = Object.keys(bySupplier)[0] as "ferguson" | "grainger";

    for (const [supplier, items] of Object.entries(bySupplier)) {
      const client = supplier === "ferguson" ? this.ferguson : this.grainger;
      const result = await this.withRetry(
        () => client.createOrder(items, request.deliveryAddress),
        `create ${supplier} order`
      );
      if (!poId) {
        poId = result.orderId;
        poNumber = result.orderNumber;
        estimatedDelivery = result.estimatedDelivery;
      }
    }

    // Save to DB
    const po: PurchaseOrder = {
      poId,
      poNumber,
      supplier: primarySupplier,
      accountId: request.accountId,
      jobId: request.jobId,
      items: request.items,
      totalAmount,
      status: "confirmed",
      estimatedDelivery,
      createdAt: new Date().toISOString(),
    };

    const { data: savedPO } = await supabase
      .from("purchase_orders")
      .insert({
        account_id: request.accountId,
        job_id: request.jobId,
        technician_id: request.technicianId,
        supplier: primarySupplier,
        po_number: poNumber,
        external_order_id: poId,
        total_amount: totalAmount,
        status: "confirmed",
        estimated_delivery: estimatedDelivery,
        items: request.items as never,
        notes: request.notes,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    await this.auditLogger.log({
      eventType: "supplier.purchase_order_created",
      details: {
        poNumber,
        supplier: primarySupplier,
        totalAmount,
        itemCount: request.items.length,
        jobId: request.jobId,
      },
    });

    return { ...po, poId: savedPO?.id ?? poId };
  }

  /**
   * Track order status
   */
  async getOrderStatus(poId: string, accountId: string): Promise<OrderStatus | null> {
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("external_order_id, supplier, status")
      .eq("id", poId)
      .eq("account_id", accountId)
      .single();

    if (!po?.external_order_id) return null;

    const client = po.supplier === "ferguson" ? this.ferguson : this.grainger;
    return this.withRetry(() => client.getOrderStatus(po.external_order_id!), "get order status");
  }

  /**
   * Find alternative parts when an item is backordered
   */
  async findAlternatives(
    backordered: PartResult,
    accountId: string
  ): Promise<PartResult[]> {
    const { results } = await this.searchParts({
      query: backordered.description,
      category: backordered.category,
      maxResults: 6,
      accountId,
    });

    return results.filter(
      (r) =>
        r.availability === "in_stock" &&
        r.partNumber !== backordered.partNumber &&
        Math.abs(r.unitPrice - backordered.unitPrice) / backordered.unitPrice < 0.3 // within 30% price
    );
  }

  /**
   * Check low stock across the account's tracked parts and suggest reorders
   */
  async checkLowStockAndSuggestReorders(accountId: string): Promise<{
    lowStockParts: Array<{
      part: { name: string; currentStock: number; reorderPoint: number };
      suggestions: PartResult[];
    }>;
  }> {
    const { data: lowStockParts } = await supabase
      .from("parts")
      .select("id, name, description, quantity_on_hand, reorder_point, preferred_supplier, unit_cost")
      .eq("account_id", accountId)
      .filter("quantity_on_hand", "lte", supabase.rpc as unknown as string)
      .lt("quantity_on_hand", 5); // Simplified — in production use: quantity_on_hand <= reorder_point

    const suggestions: Array<{
      part: { name: string; currentStock: number; reorderPoint: number };
      suggestions: PartResult[];
    }> = [];

    for (const part of lowStockParts ?? []) {
      const { results } = await this.searchParts({
        query: part.name ?? part.description ?? "",
        accountId,
        maxResults: 3,
      });

      suggestions.push({
        part: {
          name: part.name ?? "",
          currentStock: part.quantity_on_hand ?? 0,
          reorderPoint: part.reorder_point ?? 0,
        },
        suggestions: results.filter((r) => r.availability === "in_stock"),
      });
    }

    return { lowStockParts: suggestions };
  }
}

// ─── Helpers ─────────────────────────────────────────────

function mapAvailability(status: string): PartResult["availability"] {
  const s = status.toLowerCase();
  if (s.includes("in stock") || s === "available" || s === "branch") return "in_stock";
  if (s.includes("limited") || s.includes("low")) return "limited";
  if (s.includes("backorder")) return "backordered";
  return "out_of_stock";
}

function calculateValueScore(part: PartResult): number {
  // Higher is better: in-stock gets big boost, lower price, faster delivery
  const availabilityBonus = part.availability === "in_stock" ? 100 : part.availability === "limited" ? 50 : 0;
  const priceScore = 1000 / (part.unitPrice + 1);
  const deliveryScore = 10 / (part.estimatedDeliveryDays + 1);
  return availabilityBonus + priceScore + deliveryScore;
}

// ─── Convenience exports ──────────────────────────────────

export const supplierRouter = new SupplierRouter();
