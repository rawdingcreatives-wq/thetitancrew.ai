/**
 * TitanCrew · Email Send API Route
 *
 * POST /api/email/send
 *
 * Internal API for sending emails via SendGrid.
 * Used by agents and internal flows. Requires auth or agent secret.
 *
 * Body: { template: string, to: string, data: Record<string, unknown> }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import {
  sendWelcomeEmail,
  sendAgentAlertEmail,
  sendInvoiceEmail,
  sendEmail,
} from "@/lib/email/sendgrid";

const log = createLogger("email-send");

// ─── Types for email data ────────────────────────────────────

interface WelcomeEmailData {
  firstName: string;
  companyName: string;
  loginUrl: string;
}

interface AgentAlertEmailData {
  agentName: string;
  actionSummary: string;
  approvalUrl: string;
}

interface InvoiceEmailData {
  customerName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  payUrl: string;
}

export async function POST(req: NextRequest) {
  // Auth: either user session or agent API secret
  const internalSecret = req.headers.get("x-titancrew-secret");
  const isInternalCall = internalSecret === process.env.AGENT_API_SECRET;

  if (!isInternalCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { template: string; to: string; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.template || !body.to) {
    return NextResponse.json({ error: "template and to are required" }, { status: 400 });
  }

  try {
    let result;

    switch (body.template) {
      case "welcome":
        result = await sendWelcomeEmail(body.to, body.data as unknown as WelcomeEmailData);
        break;

      case "agent_alert":
        result = await sendAgentAlertEmail(body.to, body.data as unknown as AgentAlertEmailData);
        break;

      case "invoice":
        result = await sendInvoiceEmail(body.to, body.data as unknown as InvoiceEmailData);
        break;

      default:
        // Generic send with subject + html
        result = await sendEmail({
          to: body.to,
          subject: (body.data.subject as string) ?? "TitanCrew Notification",
          html: (body.data.html as string) ?? undefined,
          text: (body.data.text as string) ?? undefined,
          categories: [(body.template as string)],
        });
    }

    return NextResponse.json({ success: result.success, messageId: result.messageId });
  } catch (err) {
    log.error({ event: "email_send_error", err: String(err) }, "Email send error");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
