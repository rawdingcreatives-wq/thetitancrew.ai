/**
 * TitanCrew · SendGrid Email Service
 *
 * Centralized email sending with template support.
 * All outbound email flows through this module.
 *
 * Templates:
 *   welcome          — new signup welcome
 *   job_confirmation — customer job booking confirmation
 *   invoice_sent     — invoice delivery
 *   payment_reminder — overdue payment nudge
 *   review_request   — post-job review solicitation
 *   agent_alert      — agent needs approval / error notification
 */

import { createLogger } from "@/lib/logger";
import { guardKillSwitch } from "@/lib/kill-switches";

const log = createLogger("sendgrid");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "crew@titancrew.ai";
const FROM_NAME  = process.env.SENDGRID_FROM_NAME  ?? "TitanCrew";

// ─── Template IDs (set in SendGrid dashboard) ────────────────

export const TEMPLATE_IDS: Record<string, string> = {
  welcome:          process.env.SG_TEMPLATE_WELCOME          ?? "",
  job_confirmation: process.env.SG_TEMPLATE_JOB_CONFIRMATION ?? "",
  invoice_sent:     process.env.SG_TEMPLATE_INVOICE_SENT     ?? "",
  payment_reminder: process.env.SG_TEMPLATE_PAYMENT_REMINDER ?? "",
  review_request:   process.env.SG_TEMPLATE_REVIEW_REQUEST   ?? "",
  agent_alert:      process.env.SG_TEMPLATE_AGENT_ALERT      ?? "",
};

// ─── Types ───────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  /** Plain text body (fallback) */
  text?: string;
  /** HTML body */
  html?: string;
  /** SendGrid dynamic template ID */
  templateId?: string;
  /** Dynamic template data */
  templateData?: Record<string, unknown>;
  /** Reply-to address */
  replyTo?: string;
  /** Categories for analytics */
  categories?: string[];
}

export interface SendEmailResult {
  success: boolean;
  statusCode: number;
  messageId?: string;
  error?: string;
}

// ─── Send email ──────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Kill switch: block all outbound email during incidents
  if (guardKillSwitch("KILL_OUTBOUND_EMAIL", { event: "email_send", to: recipients, subject: options.subject })) {
    return { success: false, statusCode: 0, error: "Kill switch KILL_OUTBOUND_EMAIL is active" };
  }

  if (!SENDGRID_API_KEY) {
    log.warn({ event: "api_key_missing" }, "SendGrid API key not configured — email skipped");
    return { success: false, statusCode: 0, error: "SENDGRID_API_KEY not set" };
  }

  const personalizations = recipients.map((email) => ({
    to: [{ email }],
    ...(options.templateData ? { dynamic_template_data: options.templateData } : {}),
  }));

  const payload: Record<string, unknown> = {
    personalizations,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    ...(options.replyTo ? { reply_to: { email: options.replyTo } } : {}),
    ...(options.categories?.length ? { categories: options.categories } : {}),
  };

  // Template or raw content
  if (options.templateId) {
    payload.template_id = options.templateId;
  } else {
    payload.subject = options.subject;
    payload.content = [];
    if (options.text) {
      (payload.content as Array<{ type: string; value: string }>).push({ type: "text/plain", value: options.text });
    }
    if (options.html) {
      (payload.content as Array<{ type: string; value: string }>).push({ type: "text/html", value: options.html });
    }
    if ((payload.content as unknown[]).length === 0) {
      return { success: false, statusCode: 0, error: "No content or template provided" };
    }
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get("X-Message-Id") ?? undefined;
      return { success: true, statusCode: response.status, messageId };
    }

    const errorBody = await response.text();
    log.error({ event: "send_failed", statusCode: response.status, to: recipients }, `SendGrid ${response.status}: ${errorBody}`);
    return { success: false, statusCode: response.status, error: errorBody };
  } catch (err) {
    log.error({ event: "network_error", to: recipients }, "SendGrid network error", err);
    return { success: false, statusCode: 0, error: String(err) };
  }
}

// ─── Convenience helpers ─────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  data: { firstName: string; companyName: string; loginUrl: string }
): Promise<SendEmailResult> {
  const templateId = TEMPLATE_IDS.welcome;

  if (templateId) {
    return sendEmail({
      to,
      subject: "Welcome to TitanCrew!",
      templateId,
      templateData: data,
      categories: ["welcome", "onboarding"],
    });
  }

  // Fallback: inline HTML
  return sendEmail({
    to,
    subject: "Welcome to TitanCrew — Your AI Crew is Ready!",
    html: buildWelcomeHtml(data),
    categories: ["welcome", "onboarding"],
  });
}

export async function sendAgentAlertEmail(
  to: string,
  data: { agentName: string; actionSummary: string; approvalUrl: string }
): Promise<SendEmailResult> {
  const templateId = TEMPLATE_IDS.agent_alert;

  if (templateId) {
    return sendEmail({
      to,
      subject: `TitanCrew: ${data.agentName} needs your approval`,
      templateId,
      templateData: data,
      categories: ["agent_alert", "hil"],
    });
  }

  return sendEmail({
    to,
    subject: `TitanCrew: ${data.agentName} needs your approval`,
    html: buildAgentAlertHtml(data),
    categories: ["agent_alert", "hil"],
  });
}

export async function sendInvoiceEmail(
  to: string,
  data: { customerName: string; invoiceNumber: string; amount: string; dueDate: string; payUrl: string }
): Promise<SendEmailResult> {
  const templateId = TEMPLATE_IDS.invoice_sent;

  if (templateId) {
    return sendEmail({
      to,
      subject: `Invoice ${data.invoiceNumber} from TitanCrew`,
      templateId,
      templateData: data,
      categories: ["invoice", "billing"],
    });
  }

  return sendEmail({
    to,
    subject: `Invoice ${data.invoiceNumber} — ${data.amount} due ${data.dueDate}`,
    html: buildInvoiceHtml(data),
    categories: ["invoice", "billing"],
  });
}

// ─── Inline HTML builders (fallback when no SendGrid template) ─

function buildWelcomeHtml(data: { firstName: string; companyName: string; loginUrl: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0F1B2D;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <tr><td style="text-align:center;padding-bottom:30px;">
      <span style="font-size:24px;font-weight:bold;color:#fff;">Titan<span style="color:#FF6B00;">Crew</span></span>
    </td></tr>
    <tr><td style="background:#1A2744;border-radius:12px;padding:40px 30px;">
      <h1 style="color:#fff;font-size:22px;margin:0 0 16px;">Welcome aboard, ${data.firstName}!</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;">
        Your AI crew for <strong style="color:#fff;">${data.companyName}</strong> is ready to deploy.
        We're going to automate your scheduling, invoicing, customer comms, and parts ordering
        so you can focus on the work that pays.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td style="background:#FF6B00;border-radius:8px;padding:12px 28px;">
          <a href="${data.loginUrl}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
            Go to Your Dashboard
          </a>
        </td></tr>
      </table>
      <p style="color:#64748b;font-size:13px;">Questions? Reply to this email or reach us at support@titancrew.ai</p>
    </td></tr>
    <tr><td style="text-align:center;padding-top:20px;">
      <p style="color:#475569;font-size:11px;">TitanCrew AI Inc.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAgentAlertHtml(data: { agentName: string; actionSummary: string; approvalUrl: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0F1B2D;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <tr><td style="text-align:center;padding-bottom:30px;">
      <span style="font-size:24px;font-weight:bold;color:#fff;">Titan<span style="color:#FF6B00;">Crew</span></span>
    </td></tr>
    <tr><td style="background:#1A2744;border-radius:12px;padding:40px 30px;">
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Action Required: ${data.agentName}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;">${data.actionSummary}</p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td style="background:#FF6B00;border-radius:8px;padding:12px 28px;">
          <a href="${data.approvalUrl}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
            Review &amp; Approve
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildInvoiceHtml(data: { customerName: string; invoiceNumber: string; amount: string; dueDate: string; payUrl: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0F1B2D;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <tr><td style="text-align:center;padding-bottom:30px;">
      <span style="font-size:24px;font-weight:bold;color:#fff;">Titan<span style="color:#FF6B00;">Crew</span></span>
    </td></tr>
    <tr><td style="background:#1A2744;border-radius:12px;padding:40px 30px;">
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Invoice ${data.invoiceNumber}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;">
        Hi ${data.customerName},<br/><br/>
        Amount due: <strong style="color:#FF6B00;font-size:18px;">${data.amount}</strong><br/>
        Due date: <strong style="color:#fff;">${data.dueDate}</strong>
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td style="background:#FF6B00;border-radius:8px;padding:12px 28px;">
          <a href="${data.payUrl}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
            Pay Now
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
