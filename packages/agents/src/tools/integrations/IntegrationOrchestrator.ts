/**
 * TitanCrew · IntegrationOrchestrator
 *
 * Central hub for all third-party integration calls.
 * Manages:
 *   - Retry logic with exponential backoff + jitter
 *   - Circuit breaker per integration (stops hammering failing APIs)
 *   - Integration health monitoring
 *   - Fallback strategies when integrations are unavailable
 *   - Per-account integration status cache
 *
 * All agents call through this orchestrator rather than adapters directly.
 * This ensures consistent error handling, retry behavior, and audit trails.
 */

import { GoogleCalendarAdapter, type JobEvent, type AvailabilityQuery } from "./GoogleCalendarAdapter";
import { QuickBooksAdapter, type QBOInvoice, type QBOCustomer } from "./QuickBooksAdapter";
import { SupplierRouter, type PartSearchQuery, type PurchaseOrderRequest } from "./SupplierAdapters";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../../guardrails/logger";

const integLog = createLogger("IntegrationOrchestrator");

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Circuit Breaker ──────────────────────────────────────

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half_open";
}

const circuitBreakers: Record<string, CircuitState> = {
  google_calendar: { failures: 0, lastFailure: 0, state: "closed" },
  quickbooks: { failures: 0, lastFailure: 0, state: "closed" },
  ferguson: { failures: 0, lastFailure: 0, state: "closed" },
  grainger: { failures: 0, lastFailure: 0, state: "closed" },
};

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_TIMEOUT_MS = 60_000; // 1 minute

function checkCircuit(integration: string): void {
  const cb = circuitBreakers[integration];
  if (!cb) return;

  if (cb.state === "open") {
    if (Date.now() - cb.lastFailure > CIRCUIT_RESET_TIMEOUT_MS) {
      cb.state = "half_open";
    } else {
      throw new Error(`Circuit breaker OPEN for ${integration} — too many recent failures. Retry in 60s.`);
    }
  }
}

function recordSuccess(integration: string): void {
  const cb = circuitBreakers[integration];
  if (!cb) return;
  cb.failures = 0;
  cb.state = "closed";
}

function recordFailure(integration: string): void {
  const cb = circuitBreakers[integration];
  if (!cb) return;
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    cb.state = "open";
    integLog.warn({ event: "circuit_breaker_opened", integration, failures: cb.failures }, `Circuit breaker OPENED for ${integration} after ${cb.failures} failures`);
  }
}

// ─── Retry with Jitter ────────────────────────────────────

async function withRetryAndCircuitBreaker<T>(
  integration: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  fallback?: () => T
): Promise<T> {
  checkCircuit(integration);

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      recordSuccess(integration);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      recordFailure(integration);

      const isRetryable =
        lastError.message.includes("ECONNRESET") ||
        lastError.message.includes("ETIMEDOUT") ||
        lastError.message.includes("503") ||
        lastError.message.includes("429") ||
        lastError.message.includes("rate limit") ||
        lastError.message.includes("quota");

      if (!isRetryable || attempt === maxAttempts) break;

      // Exponential backoff with jitter: base * 2^attempt ± 25% jitter
      const baseDelay = 1000 * Math.pow(2, attempt - 1);
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(500, baseDelay + jitter);

      integLog.warn(
        { event: "retry", integration, attempt, maxAttempts, delayMs: Math.round(delay) },
        `${integration} attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  if (fallback) {
    integLog.warn({ event: "fallback_used", integration }, `${integration} all retries exhausted — using fallback`);
    return fallback();
  }

  throw lastError ?? new Error(`${integration} failed after ${maxAttempts} attempts`);
}

// ─── Integration Status Cache ─────────────────────────────

interface IntegrationStatus {
  googleCalendar: boolean;
  quickbooks: boolean;
  ferguson: boolean;
  grainger: boolean;
  lastChecked: number;
}

const statusCache = new Map<string, IntegrationStatus>();
const STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getIntegrationStatus(accountId: string): Promise<IntegrationStatus> {
  const cached = statusCache.get(accountId);
  if (cached && Date.now() - cached.lastChecked < STATUS_CACHE_TTL) {
    return cached;
  }

  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("google_calendar_token, qbo_access_token")
    .eq("id", accountId)
    .single();

  const status: IntegrationStatus = {
    googleCalendar: !!account?.google_calendar_token,
    quickbooks: !!account?.qbo_access_token,
    ferguson: !!process.env.FERGUSON_API_KEY,
    grainger: !!process.env.GRAINGER_API_KEY,
    lastChecked: Date.now(),
  };

  statusCache.set(accountId, status);
  return status;
}

// ─── Main Orchestrator ────────────────────────────────────

export class IntegrationOrchestrator {
  private calendarAdapters = new Map<string, GoogleCalendarAdapter>();
  private qboAdapters = new Map<string, QuickBooksAdapter>();
  private supplierRouter = new SupplierRouter();

  private getCalendarAdapter(accountId: string): GoogleCalendarAdapter {
    if (!this.calendarAdapters.has(accountId)) {
      this.calendarAdapters.set(accountId, new GoogleCalendarAdapter(accountId));
    }
    return this.calendarAdapters.get(accountId)!;
  }

  private getQBOAdapter(accountId: string): QuickBooksAdapter {
    if (!this.qboAdapters.has(accountId)) {
      this.qboAdapters.set(accountId, new QuickBooksAdapter(accountId));
    }
    return this.qboAdapters.get(accountId)!;
  }

  // ── Google Calendar ───────────────────────────────────────

  async getAvailableSlots(query: AvailabilityQuery) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(query.accountId).getAvailableSlots(query),
      3,
      () => [] // Fallback: return empty slots (agent will use manual scheduling)
    );
  }

  async bookJob(event: JobEvent) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(event.accountId).bookJob(event)
    );
  }

  async updateJob(accountId: string, eventId: string, updates: Partial<JobEvent> & { newStatus?: string }) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(accountId).updateJob(accountId, eventId, updates)
    );
  }

  async cancelJob(accountId: string, eventId: string, reason?: string) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(accountId).cancelJob(accountId, eventId, reason)
    );
  }

  async getTodaysJobs(accountId: string) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(accountId).getTodaysJobs(accountId),
      3,
      () => [] // Fallback: no calendar events available
    );
  }

  async detectConflicts(accountId: string, start: string, end: string, technicianEmail?: string) {
    return withRetryAndCircuitBreaker(
      "google_calendar",
      () => this.getCalendarAdapter(accountId).detectConflicts(accountId, start, end, technicianEmail),
      3,
      () => ({ hasConflict: false, conflictingEvents: [] })
    );
  }

  // ── QuickBooks Online ─────────────────────────────────────

  async syncCustomer(accountId: string, customer: QBOCustomer) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(accountId).syncCustomer(customer)
    );
  }

  async createInvoice(invoice: QBOInvoice) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(invoice.accountId).createInvoice(invoice)
    );
  }

  async getPaymentStatuses(accountId: string, jobIds: string[]) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(accountId).getPaymentStatuses(jobIds),
      3,
      () => [] // Fallback: no payment data available
    );
  }

  async getOverdueInvoices(accountId: string, daysOverdue?: number) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(accountId).getOverdueInvoices(daysOverdue),
      3,
      () => []
    );
  }

  async getRevenueReport(accountId: string, startDate: string, endDate: string) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(accountId).getRevenueReport(startDate, endDate)
    );
  }

  async voidInvoice(accountId: string, qboInvoiceId: string, reason: string) {
    return withRetryAndCircuitBreaker(
      "quickbooks",
      () => this.getQBOAdapter(accountId).voidInvoice(qboInvoiceId, reason)
    );
  }

  // ── Suppliers ─────────────────────────────────────────────

  async searchParts(query: PartSearchQuery) {
    return withRetryAndCircuitBreaker(
      "ferguson", // Primary — both suppliers run inside searchParts
      () => this.supplierRouter.searchParts(query),
      3,
      () => ({ results: [], bestPrice: null, comparison: { ferguson: [], grainger: [] } })
    );
  }

  async createPurchaseOrder(request: PurchaseOrderRequest) {
    return withRetryAndCircuitBreaker(
      request.items[0]?.partResult.supplier === "grainger" ? "grainger" : "ferguson",
      () => this.supplierRouter.createPurchaseOrder(request)
    );
  }

  async getOrderStatus(poId: string, accountId: string) {
    return withRetryAndCircuitBreaker(
      "ferguson",
      () => this.supplierRouter.getOrderStatus(poId, accountId),
      3,
      () => null
    );
  }

  async checkLowStockAndSuggestReorders(accountId: string) {
    return withRetryAndCircuitBreaker(
      "ferguson",
      () => this.supplierRouter.checkLowStockAndSuggestReorders(accountId),
      3,
      () => ({ lowStockParts: [] })
    );
  }

  async findAlternatives(backordered: import("./SupplierAdapters").PartResult, accountId: string) {
    return withRetryAndCircuitBreaker(
      "grainger",
      () => this.supplierRouter.findAlternatives(backordered, accountId),
      3,
      () => []
    );
  }

  // ── Health & Status ───────────────────────────────────────

  async getStatus(accountId: string): Promise<{
    integrations: IntegrationStatus;
    circuitBreakers: Record<string, CircuitState>;
  }> {
    const integrations = await getIntegrationStatus(accountId);
    return { integrations, circuitBreakers };
  }

  async healthCheck(): Promise<Record<string, "healthy" | "degraded" | "down">> {
    return Object.fromEntries(
      Object.entries(circuitBreakers).map(([name, cb]) => [
        name,
        cb.state === "closed" ? "healthy" : cb.state === "half_open" ? "degraded" : "down",
      ])
    ) as Record<string, "healthy" | "degraded" | "down">;
  }

  /**
   * Invalidate the status cache for an account (call after OAuth connect/disconnect)
   */
  invalidateCache(accountId: string): void {
    statusCache.delete(accountId);
    this.calendarAdapters.delete(accountId);
    this.qboAdapters.delete(accountId);
  }
}

// ─── Singleton export ─────────────────────────────────────

export const integrationOrchestrator = new IntegrationOrchestrator();
