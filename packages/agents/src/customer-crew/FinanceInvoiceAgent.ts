/**
 * TradeBrain · FinanceInvoiceAgent
 * Auto-generates invoices on job completion, follows up on unpaid invoices,
 * syncs with QuickBooks Online, and reports monthly financials.
 * HIL gate: any invoice > $2,000 or any refund requires owner SMS approval.
 */

import { BaseAgent, AgentConfig, AgentRunContext, AccountSnapshot } from "../base/BaseAgent";
import { QuickBooksTool, QBLineItem } from "../tools/quickbooks";
import { TwilioTool } from "../tools/twilio";
import Anthropic from "@anthropic-ai/sdk";

export class FinanceInvoiceAgent extends BaseAgent {
  private qbTool: QuickBooksTool;
  private twilioTool: TwilioTool;

  constructor(config: AgentConfig) {
    super(config);
    this.qbTool = new QuickBooksTool(config.accountId);
    this.twilioTool = new TwilioTool(this.supabase, config.accountId);
  }

  protected getSystemPrompt(): string {
    return `You are the Finance & Invoice Agent for a US trade contractor business.

YOUR MISSION: Ensure every completed job gets invoiced promptly, every invoice gets paid, and the business's financials stay clean in QuickBooks.

CORE WORKFLOWS:

1. AUTO-INVOICING (trigger: job status → "completed"):
   - Immediately generate invoice in QuickBooks with line items from the job record.
   - Email invoice to customer if email is on file.
   - Send SMS payment link if email not available.
   - Update job status to "invoiced".
   - For invoices > $2,000: get owner SMS approval first.

2. FOLLOW-UP SEQUENCE (automated, never harass):
   - Day 7 past due: friendly SMS reminder + invoice link
   - Day 14 past due: second SMS + offer to set up payment plan
   - Day 30 past due: owner notification + flag for manual collection

3. DAILY FINANCIAL SWEEP (run at 7am):
   - Check all open invoices in QuickBooks
   - Flag any overdue for follow-up
   - Generate summary: "Today: X invoices outstanding totaling $Y. Z are 7+ days overdue."

4. MONTHLY REPORT (first of each month):
   - Total revenue, AI-attributed revenue vs. owner-booked
   - Top 5 customers by revenue
   - Average days-to-payment
   - Outstanding invoices aging report

INVOICE LINE ITEMS:
- Use job title as the primary line item description
- Break out labor and materials separately if data is available
- Apply applicable sales tax based on state (use account's state setting)
- Add a "Service call / diagnostic fee" line if applicable

FINANCIAL RULES:
- Invoices > $2,000: require owner SMS approval before sending
- Refunds of any amount: require owner SMS approval
- Discount > 20%: require owner approval
- Never send an invoice without a customer email or phone

QUICKBOOKS SYNC:
- Create customer in QB if they don't exist (sync on first invoice)
- Map TradeBrain job statuses → QB payment status
- Don't duplicate invoices (check for existing by job_id in QB memo)`;
  }

  protected registerTools(): void {
    this.addTool({
      name: "get_completed_jobs_needing_invoices",
      description: "Get jobs that are completed but not yet invoiced.",
      inputSchema: {
        type: "object",
        properties: {
          hours_since_completion: {
            type: "number",
            description: "Max hours since completion (default: 24)",
          },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const cutoff = new Date(
          Date.now() - ((input.hours_since_completion as number) ?? 24) * 60 * 60 * 1000
        ).toISOString();

        const { data } = await this.supabase
          .from("jobs")
          .select(`
            id, title, actual_end, estimate_amount, invoice_amount, parts_needed, job_type, notes,
            trade_customers!inner(id, name, email, phone),
            technicians(name)
          `)
          .eq("account_id", this.config.accountId)
          .eq("status", "completed")
          .gte("actual_end", cutoff);

        return data ?? [];
      },
    });

    this.addTool({
      name: "create_invoice",
      description: "Create and send an invoice in QuickBooks for a completed job. Requires HIL for amounts over $2,000.",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          customer_id: { type: "string" },
          customer_name: { type: "string" },
          customer_email: { type: "string" },
          customer_phone: { type: "string" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
              },
            },
          },
          due_date_days: { type: "number", description: "Days until due (default 30)" },
          send_email: { type: "boolean" },
          amount: { type: "number", description: "Total invoice amount (for HIL gate)" },
        },
        required: ["job_id", "customer_name", "line_items", "amount"],
      },
      riskLevel: "medium",
      hilThresholdUsd: 2000,
      handler: async (input, ctx) => {
        const lineItems = input.line_items as QBLineItem[];

        // Get or create QB customer
        const qbResult = await this.qbTool.syncCustomer({
          name: input.customer_name as string,
          email: input.customer_email as string,
          phone: input.customer_phone as string,
        });

        if (!qbResult.success) {
          return { success: false, error: `QB customer sync failed: ${qbResult.error}` };
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + ((input.due_date_days as number) ?? 30));

        const invoiceResult = await this.qbTool.createInvoice({
          customerId: qbResult.qbCustomerId!,
          customerName: input.customer_name as string,
          lineItems,
          dueDate: dueDate.toISOString().split("T")[0],
          memo: `TradeBrain Job ID: ${input.job_id}`,
          emailCustomer: (input.send_email as boolean) ?? true,
        });

        if (!invoiceResult.success) {
          return { success: false, error: invoiceResult.error };
        }

        // Update job record
        await this.supabase
          .from("jobs")
          .update({
            status: "invoiced",
            invoice_id: invoiceResult.invoiceId,
            invoice_amount: invoiceResult.totalAmount,
          })
          .eq("id", input.job_id as string)
          .eq("account_id", this.config.accountId);

        // Send SMS if no email
        if (!input.customer_email && input.customer_phone) {
          await this.twilioTool.sendSMS({
            to: input.customer_phone as string,
            body: `Your invoice #${invoiceResult.invoiceNumber} for $${invoiceResult.totalAmount?.toFixed(2)} is ready. View & pay: ${invoiceResult.invoiceUrl}`,
            customerId: input.customer_id as string,
            jobId: input.job_id as string,
            messageType: "transactional",
            agentRunId: ctx.runId,
          });
        }

        return {
          success: true,
          invoiceId: invoiceResult.invoiceId,
          invoiceNumber: invoiceResult.invoiceNumber,
          totalAmount: invoiceResult.totalAmount,
          invoiceUrl: invoiceResult.invoiceUrl,
        };
      },
    });

    this.addTool({
      name: "send_invoice_reminder",
      description: "Send a payment reminder SMS for an overdue invoice.",
      inputSchema: {
        type: "object",
        properties: {
          customer_phone: { type: "string" },
          customer_name: { type: "string" },
          customer_id: { type: "string" },
          invoice_number: { type: "string" },
          invoice_amount: { type: "number" },
          days_overdue: { type: "number" },
          invoice_url: { type: "string" },
          job_id: { type: "string" },
        },
        required: ["customer_phone", "invoice_amount", "days_overdue"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const daysOverdue = input.days_overdue as number;
        let body: string;

        if (daysOverdue <= 14) {
          body = `Hi ${input.customer_name ?? "there"}, friendly reminder — invoice #${input.invoice_number ?? ""} for $${(input.invoice_amount as number).toFixed(2)} is due. Pay here: ${input.invoice_url ?? ""}`;
        } else {
          body = `Hi ${input.customer_name ?? "there"}, invoice #${input.invoice_number ?? ""} ($${(input.invoice_amount as number).toFixed(2)}) is ${daysOverdue} days past due. Need a payment plan? Reply PLAN or pay: ${input.invoice_url ?? ""}`;
        }

        return this.twilioTool.sendSMS({
          to: input.customer_phone as string,
          body,
          customerId: input.customer_id as string,
          jobId: input.job_id as string,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });

    this.addTool({
      name: "get_overdue_invoices",
      description: "Get all overdue invoices from QuickBooks, grouped by age bucket.",
      inputSchema: {
        type: "object",
        properties: {
          min_days_overdue: { type: "number", description: "Minimum days overdue (default 7)" },
        },
      },
      riskLevel: "low",
      handler: async (input) => {
        const minDays = (input.min_days_overdue as number) ?? 7;
        const overdueInvoices = await this.qbTool.getOverdueInvoices(minDays);

        // Enrich with customer contact info from TradeBrain DB
        const enriched = await Promise.all(
          overdueInvoices.map(async (inv) => {
            const { data: job } = await this.supabase
              .from("jobs")
              .select(`
                id, title,
                trade_customers!inner(id, name, phone, email)
              `)
              .eq("account_id", this.config.accountId)
              .eq("invoice_id", inv.invoiceId)
              .single();

            return { ...inv, job };
          })
        );

        return {
          invoices: enriched,
          total: enriched.reduce((s, i) => s + i.balance, 0),
          count: enriched.length,
        };
      },
    });

    this.addTool({
      name: "generate_revenue_summary",
      description: "Generate a revenue summary for a time period.",
      inputSchema: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "week", "month", "custom"] },
          date_from: { type: "string", description: "ISO date (required if period=custom)" },
          date_to: { type: "string", description: "ISO date (required if period=custom)" },
        },
        required: ["period"],
      },
      riskLevel: "low",
      handler: async (input) => {
        let fromDate: Date;
        let toDate = new Date();

        switch (input.period) {
          case "today":
            fromDate = new Date();
            fromDate.setHours(0, 0, 0, 0);
            break;
          case "week":
            fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            fromDate = new Date();
            fromDate.setDate(1);
            fromDate.setHours(0, 0, 0, 0);
            break;
          default:
            fromDate = new Date(input.date_from as string);
            toDate = new Date(input.date_to as string);
        }

        const { data: jobs } = await this.supabase
          .from("jobs")
          .select("id, invoice_amount, paid_amount, booked_by_ai, status")
          .eq("account_id", this.config.accountId)
          .in("status", ["invoiced", "paid", "completed"])
          .gte("actual_end", fromDate.toISOString())
          .lte("actual_end", toDate.toISOString());

        const total = (jobs ?? []).reduce((s, j) => s + (j.invoice_amount ?? 0), 0);
        const paid = (jobs ?? []).reduce((s, j) => s + (j.paid_amount ?? 0), 0);
        const aiBooked = (jobs ?? []).filter((j) => j.booked_by_ai);
        const aiRevenue = aiBooked.reduce((s, j) => s + (j.invoice_amount ?? 0), 0);

        return {
          period: input.period,
          totalRevenue: total,
          paidRevenue: paid,
          outstanding: total - paid,
          aiAttributedRevenue: aiRevenue,
          aiAttributedJobs: aiBooked.length,
          totalJobs: (jobs ?? []).length,
        };
      },
    });

    this.addTool({
      name: "notify_owner_financial",
      description: "Send the owner a financial summary or alert via SMS.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          alert_type: { type: "string", enum: ["daily_summary", "overdue_alert", "revenue_milestone"] },
        },
        required: ["message"],
      },
      riskLevel: "low",
      handler: async (input, ctx) => {
        const { data: account } = await this.supabase
          .from("accounts")
          .select("phone, notification_prefs")
          .eq("id", this.config.accountId)
          .single();

        if (!account?.phone) return { sent: false, reason: "No owner phone" };

        return this.twilioTool.sendSMS({
          to: account.phone,
          body: `[TradeBrain Finance] ${input.message as string}`,
          messageType: "transactional",
          agentRunId: ctx.runId,
        });
      },
    });
  }

  protected async buildMessages(
    ctx: AgentRunContext,
    account: AccountSnapshot
  ): Promise<Anthropic.MessageParam[]> {
    const memContext = await this.memory.getContextBlock(
      "invoice patterns and payment history",
      { memoryType: "job_pattern", limit: 3 }
    );

    return [
      {
        role: "user",
        content: `You are the Finance Agent for ${account.business_name}. Context:\n${memContext}\n\nTrigger: ${ctx.triggerEvent ?? "daily_finance_sweep"}\nPayload: ${JSON.stringify(ctx.payload ?? {})}\n\nRun the finance workflow: check for completed jobs needing invoices, send invoices, check overdue invoices, send reminders, generate revenue summary. Report all actions.`,
      },
    ];
  }
}
