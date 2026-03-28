/**
 * TradeBrain · QuickBooks Online Tool Adapter
 * Invoice creation, customer sync, payment tracking.
 * Uses OAuth2 tokens stored per-account.
 */

export interface QBInvoice {
  id?: string;
  customerId: string;     // QB Customer ID
  customerName: string;
  lineItems: QBLineItem[];
  dueDate?: string;       // ISO date
  memo?: string;
  emailCustomer?: boolean;
}

export interface QBLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  serviceDate?: string;
}

export interface QBInvoiceResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  invoiceUrl?: string;
  error?: string;
}

export interface QBPaymentStatus {
  invoiceId: string;
  status: "open" | "paid" | "partial" | "overdue" | "void";
  balance: number;
  totalAmount: number;
  dueDate: string;
  lastPaymentDate?: string;
}

export class QuickBooksTool {
  private accountId: string;
  private baseUrl = "https://quickbooks.api.intuit.com/v3/company";

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Create and optionally send an invoice in QuickBooks.
   */
  async createInvoice(invoice: QBInvoice): Promise<QBInvoiceResult> {
    const tokens = await this.getOAuthTokens();
    if (!tokens) {
      return { success: false, error: "QuickBooks not connected. Visit Settings > Integrations." };
    }

    const qbPayload = {
      CustomerRef: { value: invoice.customerId, name: invoice.customerName },
      Line: invoice.lineItems.map((item, idx) => ({
        Id: String(idx + 1),
        LineNum: idx + 1,
        Amount: item.quantity * item.unitPrice,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          Qty: item.quantity,
          UnitPrice: item.unitPrice,
          ServiceDate: item.serviceDate,
        },
        Description: item.description,
      })),
      DueDate: invoice.dueDate,
      PrivateNote: invoice.memo,
      BillEmail: invoice.emailCustomer
        ? { Address: await this.getCustomerEmail(invoice.customerId, tokens) }
        : undefined,
    };

    try {
      const response = await this.qbFetch(
        tokens,
        `/invoice`,
        "POST",
        qbPayload
      );

      const inv = response.Invoice;
      const total = inv.TotalAmt ?? 0;

      // Optionally send invoice email
      if (invoice.emailCustomer) {
        await this.qbFetch(tokens, `/invoice/${inv.Id}/send`, "POST", {});
      }

      return {
        success: true,
        invoiceId: inv.Id,
        invoiceNumber: inv.DocNumber,
        totalAmount: total,
        invoiceUrl: `https://app.qbo.intuit.com/app/invoice?txnId=${inv.Id}`,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Get payment status for an invoice.
   */
  async getPaymentStatus(invoiceId: string): Promise<QBPaymentStatus | null> {
    const tokens = await this.getOAuthTokens();
    if (!tokens) return null;

    try {
      const response = await this.qbFetch(tokens, `/invoice/${invoiceId}`, "GET");
      const inv = response.Invoice;

      const totalAmt = inv.TotalAmt ?? 0;
      const balance = inv.Balance ?? 0;
      const dueDate = inv.DueDate ?? "";

      let status: QBPaymentStatus["status"] = "open";
      if (balance === 0) status = "paid";
      else if (balance < totalAmt) status = "partial";
      else if (new Date(dueDate) < new Date()) status = "overdue";

      return {
        invoiceId,
        status,
        balance,
        totalAmount: totalAmt,
        dueDate,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get overdue invoices for follow-up.
   */
  async getOverdueInvoices(daysOverdue = 7): Promise<QBPaymentStatus[]> {
    const tokens = await this.getOAuthTokens();
    if (!tokens) return [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    try {
      const response = await this.qbFetch(
        tokens,
        `/query?query=SELECT * FROM Invoice WHERE Balance > '0' AND DueDate < '${cutoff}'`,
        "GET"
      );

      return (response.QueryResponse?.Invoice ?? []).map((inv: Record<string, unknown>) => ({
        invoiceId: inv.Id as string,
        status: "overdue" as const,
        balance: inv.Balance as number,
        totalAmount: inv.TotalAmt as number,
        dueDate: inv.DueDate as string,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Sync a customer from TradeBrain to QuickBooks (upsert).
   */
  async syncCustomer(customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  }): Promise<{ success: boolean; qbCustomerId?: string; error?: string }> {
    const tokens = await this.getOAuthTokens();
    if (!tokens) return { success: false, error: "QuickBooks not connected" };

    const payload = {
      FullyQualifiedName: customer.name,
      DisplayName: customer.name,
      PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      BillAddr: customer.address
        ? { Line1: customer.address }
        : undefined,
    };

    try {
      const response = await this.qbFetch(tokens, `/customer`, "POST", payload);
      return { success: true, qbCustomerId: response.Customer?.Id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── Private helpers ────────────────────────────────────────

  private async getOAuthTokens(): Promise<{
    accessToken: string;
    realmId: string;
    refreshToken: string;
  } | null> {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await supabase
      .from("accounts")
      .select("integrations")
      .eq("id", this.accountId)
      .single();

    const integrations = (data?.integrations ?? {}) as Record<string, unknown>;
    const qb = integrations.quickbooks as Record<string, string> | undefined;

    if (!qb?.access_token || !qb?.realm_id) return null;

    return {
      accessToken: qb.access_token,
      realmId: qb.realm_id,
      refreshToken: qb.refresh_token,
    };
  }

  private async qbFetch(
    tokens: { accessToken: string; realmId: string },
    path: string,
    method: "GET" | "POST",
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/${tokens.realmId}${path}`;
    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      throw new Error(`QB API error ${resp.status}: ${await resp.text()}`);
    }

    return resp.json() as Promise<Record<string, unknown>>;
  }

  private async getCustomerEmail(
    qbCustomerId: string,
    tokens: { accessToken: string; realmId: string }
  ): Promise<string | undefined> {
    try {
      const resp = await this.qbFetch(tokens, `/customer/${qbCustomerId}`, "GET");
      return (resp.Customer as Record<string, unknown>)?.PrimaryEmailAddr as string | undefined;
    } catch {
      return undefined;
    }
  }
}
