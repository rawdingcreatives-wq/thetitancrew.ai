// @ts-nocheck
/**
 * TitanCrew · Morning Briefing Email Template
 *
 * Sent daily at 6am local time by the Foreman Agent.
 * This is the #1 "aha moment" for new users — it proves the AI crew
 * is working overnight while they sleep.
 */

export interface MorningBriefingData {
  ownerFirstName: string;
  businessName: string;
  date: string; // "Tuesday, April 1"

  // KPI summary
  jobsToday: number;
  jobsThisWeek: number;
  revenueThisWeek: number;
  outstandingInvoices: number;
  outstandingAmount: number;

  // Agent activity overnight
  agentActions: {
    icon: string; // emoji
    agent: string;
    action: string;
    detail: string;
  }[];

  // Schedule preview
  todaySchedule: {
    time: string;
    customer: string;
    service: string;
    tech: string;
    amount: number;
  }[];

  // Alerts
  alerts: {
    type: "warning" | "info" | "success";
    message: string;
  }[];

  // Action items needing approval
  pendingApprovals: number;
  approvalUrl: string;
  dashboardUrl: string;
}

export function buildMorningBriefingHtml(data: MorningBriefingData): string {
  const alertColors = {
    warning: { bg: "#FFF3E0", border: "#FF6B00", text: "#E65100" },
    info: { bg: "#E3F2FD", border: "#1A2744", text: "#0D47A1" },
    success: { bg: "#E8F5E9", border: "#2E7D32", text: "#1B5E20" },
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Morning Briefing — ${data.businessName}</title>
</head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1A2744 0%,#FF6B00 150%);padding:32px 32px 24px;">
            <table width="100%"><tr>
              <td>
                <div style="font-size:28px;font-weight:800;color:#FF6B00;letter-spacing:-0.5px;">TitanCrew</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:2px;">AI Crew Report</div>
              </td>
              <td align="right" style="color:rgba(255,255,255,0.7);font-size:13px;">
                ${data.date}
              </td>
            </tr></table>
            <div style="margin-top:20px;font-size:22px;font-weight:700;color:#FFFFFF;">
              Good morning, ${data.ownerFirstName} 👋
            </div>
            <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:6px;">
              Here's what your AI crew handled overnight and what's on deck today.
            </div>
          </td>
        </tr>

        <!-- KPI Cards -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="25%" style="padding:0 6px 0 0;">
                  <div style="background:rgba(255,107,0,0.1);border:1px solid rgba(255,107,0,0.2);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#FF6B00;">${data.jobsToday}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">Jobs Today</div>
                  </div>
                </td>
                <td width="25%" style="padding:0 6px;">
                  <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#FFFFFF;">${data.jobsThisWeek}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">This Week</div>
                  </div>
                </td>
                <td width="25%" style="padding:0 6px;">
                  <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:#22C55E;">$${data.revenueThisWeek.toLocaleString()}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">Revenue</div>
                  </div>
                </td>
                <td width="25%" style="padding:0 0 0 6px;">
                  <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:800;color:${data.outstandingAmount > 0 ? '#FBBF24' : '#22C55E'};">$${data.outstandingAmount.toLocaleString()}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">Outstanding</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Alerts -->
        ${data.alerts.length > 0 ? `
        <tr>
          <td style="padding:20px 32px 0;">
            ${data.alerts.map(alert => `
              <div style="background:${alertColors[alert.type].bg};border-left:4px solid ${alertColors[alert.type].border};padding:12px 16px;border-radius:4px;margin-bottom:8px;">
                <span style="font-size:13px;color:${alertColors[alert.type].text};font-weight:600;">${alert.message}</span>
              </div>
            `).join("")}
          </td>
        </tr>` : ""}

        <!-- Agent Activity -->
        ${data.agentActions.length > 0 ? `
        <tr>
          <td style="padding:24px 32px 0;">
            <div style="font-size:15px;font-weight:700;color:#FFFFFF;margin-bottom:12px;">🤖 Crew Activity Overnight</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${data.agentActions.map(a => `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                  <table width="100%"><tr>
                    <td width="32" style="font-size:18px;vertical-align:top;padding-top:2px;">${a.icon}</td>
                    <td>
                      <div style="font-size:13px;font-weight:600;color:#FFFFFF;">${a.agent}: ${a.action}</div>
                      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${a.detail}</div>
                    </td>
                  </tr></table>
                </td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>` : ""}

        <!-- Today's Schedule -->
        ${data.todaySchedule.length > 0 ? `
        <tr>
          <td style="padding:24px 32px 0;">
            <div style="font-size:15px;font-weight:700;color:#FFFFFF;margin-bottom:12px;">📅 Today's Schedule</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
              <tr style="background:rgba(255,255,255,0.05);">
                <td style="padding:8px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">TIME</td>
                <td style="padding:8px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">CUSTOMER</td>
                <td style="padding:8px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">SERVICE</td>
                <td style="padding:8px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">TECH</td>
                <td align="right" style="padding:8px 12px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">AMOUNT</td>
              </tr>
              ${data.todaySchedule.map(job => `
              <tr>
                <td style="padding:10px 12px;font-size:13px;color:#FFFFFF;border-top:1px solid rgba(255,255,255,0.05);">${job.time}</td>
                <td style="padding:10px 12px;font-size:13px;color:#FFFFFF;border-top:1px solid rgba(255,255,255,0.05);">${job.customer}</td>
                <td style="padding:10px 12px;font-size:13px;color:rgba(255,255,255,0.6);border-top:1px solid rgba(255,255,255,0.05);">${job.service}</td>
                <td style="padding:10px 12px;font-size:13px;color:rgba(255,255,255,0.6);border-top:1px solid rgba(255,255,255,0.05);">${job.tech}</td>
                <td align="right" style="padding:10px 12px;font-size:13px;font-weight:600;color:#22C55E;border-top:1px solid rgba(255,255,255,0.05);">$${job.amount.toFixed(0)}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>` : ""}

        <!-- Pending Approvals CTA -->
        ${data.pendingApprovals > 0 ? `
        <tr>
          <td style="padding:24px 32px 0;">
            <div style="background:rgba(255,107,0,0.1);border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px;text-align:center;">
              <div style="font-size:14px;color:#FF6B00;font-weight:700;margin-bottom:8px;">
                ${data.pendingApprovals} action${data.pendingApprovals > 1 ? "s" : ""} waiting for your approval
              </div>
              <a href="${data.approvalUrl}" style="display:inline-block;background:#FF6B00;color:#FFFFFF;font-size:14px;font-weight:700;padding:10px 28px;border-radius:6px;text-decoration:none;">
                Review & Approve
              </a>
            </div>
          </td>
        </tr>` : ""}

        <!-- Dashboard CTA -->
        <tr>
          <td style="padding:24px 32px;" align="center">
            <a href="${data.dashboardUrl}" style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#FFFFFF;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none;">
              Open Dashboard →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.05);">
            <table width="100%"><tr>
              <td style="font-size:11px;color:rgba(255,255,255,0.3);">
                ${data.businessName} · Powered by TitanCrew AI
              </td>
              <td align="right" style="font-size:11px;color:rgba(255,255,255,0.3);">
                <a href="${data.dashboardUrl}/settings" style="color:rgba(255,255,255,0.3);text-decoration:underline;">Manage notifications</a>
              </td>
            </tr></table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildMorningBriefingText(data: MorningBriefingData): string {
  const lines: string[] = [
    `Good morning, ${data.ownerFirstName}! Here's your ${data.businessName} daily briefing for ${data.date}.`,
    "",
    `📊 TODAY: ${data.jobsToday} jobs | THIS WEEK: ${data.jobsThisWeek} jobs | REVENUE: $${data.revenueThisWeek.toLocaleString()}`,
    `💰 OUTSTANDING: ${data.outstandingInvoices} invoices ($${data.outstandingAmount.toLocaleString()})`,
    "",
  ];

  if (data.alerts.length) {
    lines.push("⚠️ ALERTS:");
    data.alerts.forEach(a => lines.push(`  • ${a.message}`));
    lines.push("");
  }

  if (data.agentActions.length) {
    lines.push("🤖 CREW ACTIVITY OVERNIGHT:");
    data.agentActions.forEach(a => lines.push(`  ${a.icon} ${a.agent}: ${a.action} — ${a.detail}`));
    lines.push("");
  }

  if (data.todaySchedule.length) {
    lines.push("📅 TODAY'S SCHEDULE:");
    data.todaySchedule.forEach(j => lines.push(`  ${j.time} — ${j.customer} (${j.service}) → ${j.tech} — $${j.amount}`));
    lines.push("");
  }

  if (data.pendingApprovals > 0) {
    lines.push(`🔔 ${data.pendingApprovals} action(s) waiting for your approval: ${data.approvalUrl}`);
    lines.push("");
  }

  lines.push(`Open Dashboard: ${data.dashboardUrl}`);
  return lines.join("\n");
}
