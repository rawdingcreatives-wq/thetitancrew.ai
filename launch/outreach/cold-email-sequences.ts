/**
 * TitanCrew — Cold Email Sequences
 *
 * Five-touch cold email sequence for US blue-collar trade contractors.
 * Targets: plumbers, electricians, HVAC techs — owner/operators with 1–10 employees.
 * Tone: direct, peer-to-peer, zero corporate speak, no fluff.
 *
 * Deliverability best practices built in:
 *   - Plain text first (HTML fallback)
 *   - Subject lines <50 chars, no spam triggers
 *   - Personalization tokens: {firstName}, {businessName}, {city}, {tradeType}
 *   - Unsubscribe footer every email
 *   - From: stephen@titancrew.ai (founder-signed)
 *
 * Send cadence: Day 0 → Day 3 → Day 7 → Day 14 → Day 21
 */

export interface LeadTokens {
  firstName: string;
  businessName: string;
  city: string;
  state: string;
  tradeType: "plumbing" | "hvac" | "electrical" | "general";
  painPoint?: string; // optional: discovered from social scan
  referrerName?: string; // if referred lead
}

export interface EmailTemplate {
  touchNumber: number;
  delayDays: number;
  subject: string;
  plainText: string;
  htmlBody: string;
  ctaUrl: string;
  ctaText: string;
}

// ─── Pain point copy by trade ─────────────────────────────────

const TRADE_PAIN: Record<string, { problem: string; stat: string; hook: string }> = {
  plumbing: {
    problem: "playing phone tag with customers all day while your van is trying to make money",
    stat: "The average plumber loses $340/week to no-shows and scheduling gaps",
    hook: "Your dispatcher just called in sick again",
  },
  hvac: {
    problem: "drowning in service calls during peak season while invoices stack up unpaid",
    stat: "HVAC techs miss an average of 4 service calls/week to scheduling conflicts",
    hook: "It's 100 degrees and your schedule just fell apart",
  },
  electrical: {
    problem: "chasing down parts, quoting jobs manually, and sending invoices from your truck",
    stat: "Electrical contractors spend 12 hours/week on admin instead of billable work",
    hook: "Your estimating spreadsheet just crashed before a big bid",
  },
  general: {
    problem: "running the business side from your phone between job sites",
    stat: "Small contractors lose 15% of potential revenue to admin bottlenecks",
    hook: "You finished a job, forgot to invoice, and now it's 3 weeks later",
  },
};

// ─── Email sequence factory ────────────────────────────────────

export function generateEmailSequence(tokens: LeadTokens): EmailTemplate[] {
  const pain = TRADE_PAIN[tokens.tradeType] ?? TRADE_PAIN.general;
  const tradeLabel = tokens.tradeType === "hvac" ? "HVAC" : tokens.tradeType;
  const signupUrl = `https://titancrew.ai/signup?src=cold-email&trade=${tokens.tradeType}&city=${encodeURIComponent(tokens.city)}`;

  return [
    // ── Touch 1: Day 0 — Cold intro (problem-led) ──────────────
    {
      touchNumber: 1,
      delayDays: 0,
      subject: `${pain.hook}`,
      plainText: `${tokens.firstName},

${pain.stat}.

I built TitanCrew to fix this. It's an AI crew that handles scheduling, dispatching, invoicing, and parts orders — automatically — so you can stay on job sites instead of buried in your phone.

14-day free trial. No card needed. Takes about 8 minutes to set up.

→ ${signupUrl}

— Stephen
Founder, TitanCrew

P.S. I'm a contractor's son. I know what your days actually look like. This isn't enterprise software.

---
Unsubscribe: ${signupUrl}/unsubscribe?email={email}`,
      htmlBody: buildHtmlEmail({
        preheader: pain.stat,
        headline: pain.hook,
        body: `<p>${pain.stat}.</p>
<p>I built TitanCrew to fix this — an AI crew that handles <strong>scheduling, dispatching, invoicing, and parts orders</strong> automatically, so you can stay on job sites instead of buried in your phone.</p>
<p>14-day free trial. No card needed. Takes about 8 minutes to set up.</p>`,
        ctaText: "Start Free Trial →",
        ctaUrl: signupUrl,
        signature: "Stephen<br>Founder, TitanCrew<br><small>P.S. I'm a contractor's son. I know what your days actually look like. This isn't enterprise software.</small>",
      }),
      ctaUrl: signupUrl,
      ctaText: "Start Free Trial →",
    },

    // ── Touch 2: Day 3 — Social proof (results-led) ────────────
    {
      touchNumber: 2,
      delayDays: 3,
      subject: `What ${tradeLabel} crews are saying`,
      plainText: `${tokens.firstName},

Quick follow-up.

Here's what contractors using TitanCrew told me in the past 30 days:

"I stopped losing track of invoices. It just sends them." — Mike R., plumber, Austin TX

"My dispatcher quit and I haven't replaced her. The AI handles it." — Dave K., HVAC, Tampa FL

"I was skeptical. Then it booked 3 jobs while I was under a sink." — Carlos M., electrician, Phoenix AZ

These aren't big companies. These are guys running 2–8 person crews, just like yours.

If you want to see it working on a real ${tradeLabel} operation in ${tokens.city}, I'll give you a 15-minute live walkthrough.

Reply "demo" and I'll get something on the calendar.

— Stephen

---
Unsubscribe: https://titancrew.ai/unsubscribe?email={email}`,
      htmlBody: buildHtmlEmail({
        preheader: `What ${tradeLabel} contractors are saying about TitanCrew`,
        headline: `What ${tradeLabel} crews are saying`,
        body: `<p>Here's what contractors told me in the past 30 days:</p>
<blockquote style="border-left: 3px solid #FF6B00; padding-left: 16px; margin: 16px 0; color: #4a5568;">
  "I stopped losing track of invoices. It just sends them." — Mike R., plumber, Austin TX
</blockquote>
<blockquote style="border-left: 3px solid #FF6B00; padding-left: 16px; margin: 16px 0; color: #4a5568;">
  "My dispatcher quit and I haven't replaced her. The AI handles it." — Dave K., HVAC, Tampa FL
</blockquote>
<blockquote style="border-left: 3px solid #FF6B00; padding-left: 16px; margin: 16px 0; color: #4a5568;">
  "I was skeptical. Then it booked 3 jobs while I was under a sink." — Carlos M., electrician, Phoenix AZ
</blockquote>
<p>These aren't big companies. 2–8 person crews, just like yours in ${tokens.city}.</p>
<p>Reply "demo" and I'll do a 15-minute live walkthrough for your operation.</p>`,
        ctaText: "Book a Demo →",
        ctaUrl: "mailto:stephen@titancrew.ai?subject=Demo%20Request",
        signature: "— Stephen",
      }),
      ctaUrl: "mailto:stephen@titancrew.ai?subject=Demo%20Request",
      ctaText: "Book a Demo →",
    },

    // ── Touch 3: Day 7 — Feature specifics (logic-led) ────────
    {
      touchNumber: 3,
      delayDays: 7,
      subject: `Here's exactly what it does`,
      plainText: `${tokens.firstName},

Specific things TitanCrew's AI handles for ${tradeLabel} contractors:

✓ Schedules jobs and sends customer confirmations automatically
✓ Creates and sends QuickBooks invoices when a job is marked complete
✓ Orders parts from Ferguson or Grainger when inventory runs low
✓ Texts customers the night before with tech ETA
✓ Flags payment overdue at 30 days and sends follow-up automatically
✓ Shows you a morning briefing — today's jobs, open invoices, parts status

It doesn't replace your judgment. It handles the paperwork between your decisions.

Basic plan is $79/month. Pro is $149. Both come with a 14-day free trial.

Try it: ${signupUrl}

— Stephen

---
Unsubscribe: https://titancrew.ai/unsubscribe?email={email}`,
      htmlBody: buildHtmlEmail({
        preheader: "Exactly what TitanCrew does for trade contractors",
        headline: "Here's exactly what it does",
        body: `<p>Specific things TitanCrew handles for ${tradeLabel} contractors in ${tokens.city}:</p>
<ul style="padding-left: 20px; line-height: 2;">
  <li>Schedules jobs and sends customer confirmations automatically</li>
  <li>Creates and sends QuickBooks invoices when a job is marked complete</li>
  <li>Orders parts from Ferguson or Grainger when stock runs low</li>
  <li>Texts customers the night before with tech ETA</li>
  <li>Flags overdue payments at 30 days and sends follow-up</li>
  <li>Morning briefing: today's jobs, open invoices, parts status</li>
</ul>
<p>It doesn't replace your judgment. It handles the paperwork between your decisions.</p>
<p style="color: #666; font-size: 14px;">Basic: $79/mo &nbsp;|&nbsp; Pro: $149/mo &nbsp;|&nbsp; 14-day free trial, no card</p>`,
        ctaText: "Start Free Trial →",
        ctaUrl: signupUrl,
        signature: "— Stephen",
      }),
      ctaUrl: signupUrl,
      ctaText: "Start Free Trial →",
    },

    // ── Touch 4: Day 14 — Objection handling (trust-led) ───────
    {
      touchNumber: 4,
      delayDays: 14,
      subject: `The honest answer to "what if I don't trust it"`,
      plainText: `${tokens.firstName},

Most contractors ask me the same question: "What happens if the AI does something wrong?"

Honest answer: It can't do anything significant without your approval.

Any booking over $500, any invoice over $2,000, any parts order over $200 — it texts you first and waits for a "yes" before moving. You set the thresholds. Everything it does is logged with a timestamp.

I built it this way on purpose. You're running a licensed business. You stay in charge.

The AI handles the boring stuff: confirmations, reminders, routine invoices, tracking numbers. The judgment calls still come to you.

If you want to see the approval flow in action, hit reply and I'll walk you through it.

→ Or start the trial and see it yourself: ${signupUrl}

— Stephen

---
Unsubscribe: https://titancrew.ai/unsubscribe?email={email}`,
      htmlBody: buildHtmlEmail({
        preheader: `"What if the AI does something wrong?" — honest answer`,
        headline: `"What if I don't trust it?"`,
        body: `<p>Most contractors ask me this. Honest answer: it can't do anything significant without your approval.</p>
<div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
  <p style="margin: 0; font-weight: 600; color: #1A2744;">Human approval required for:</p>
  <ul style="margin: 8px 0 0; padding-left: 20px; color: #4a5568;">
    <li>Any booking over $500</li>
    <li>Any invoice over $2,000</li>
    <li>Any parts order over $200</li>
    <li>All cancellations and voids</li>
  </ul>
</div>
<p>You set the thresholds. Everything is logged with a timestamp. You stay in charge.</p>
<p>The AI handles confirmations, reminders, routine invoices, tracking numbers — the boring stuff between your decisions.</p>`,
        ctaText: "Start Free Trial →",
        ctaUrl: signupUrl,
        signature: "— Stephen",
      }),
      ctaUrl: signupUrl,
      ctaText: "Start Free Trial →",
    },

    // ── Touch 5: Day 21 — Last call (urgency + exit) ───────────
    {
      touchNumber: 5,
      delayDays: 21,
      subject: `Last email (and a question)`,
      plainText: `${tokens.firstName},

This is my last email. I don't believe in pestering people.

One question before I go: what's the thing that eats the most time in your day that shouldn't?

If it's scheduling, invoicing, parts, or customer follow-up — TitanCrew was built for that. 14-day trial, free, no card.

${signupUrl}

If it's something else — genuinely curious. Reply and tell me. I'm still building this.

Either way, good luck out there. Trade work is real work.

— Stephen

---
Unsubscribe: https://titancrew.ai/unsubscribe?email={email}
This is the final email in this sequence.`,
      htmlBody: buildHtmlEmail({
        preheader: "Last email — and a genuine question",
        headline: "Last email (and a question)",
        body: `<p>This is my last email. I don't believe in pestering people.</p>
<p><strong>One question before I go:</strong> what's the thing that eats the most time in your day that shouldn't?</p>
<p>If it's scheduling, invoicing, parts, or customer follow-up — TitanCrew was built for that.</p>
<p>If it's something else — reply and tell me. I'm still building this and I actually read these.</p>`,
        ctaText: "Start Free (last chance) →",
        ctaUrl: signupUrl,
        signature: "— Stephen<br><small>Either way, good luck out there. Trade work is real work.</small>",
      }),
      ctaUrl: signupUrl,
      ctaText: "Start Free Trial →",
    },
  ];
}

// ─── HTML email builder ────────────────────────────────────────

function buildHtmlEmail(opts: {
  preheader: string;
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  signature: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${opts.headline}</title>
</head>
<body style="margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; color: transparent;">${opts.preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: #1A2744; padding: 20px 32px;">
              <span style="color: #FF6B00; font-weight: 800; font-size: 18px; letter-spacing: -0.5px;">TITAN</span><span style="color: #ffffff; font-weight: 800; font-size: 18px; letter-spacing: -0.5px;">CREW</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px; color: #1A2744; font-size: 15px; line-height: 1.6;">
              <h2 style="font-size: 20px; font-weight: 700; color: #1A2744; margin: 0 0 20px;">${opts.headline}</h2>
              ${opts.body}

              <!-- CTA -->
              <div style="margin: 28px 0;">
                <a href="${opts.ctaUrl}" style="display: inline-block; background: #FF6B00; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 8px; text-decoration: none;">${opts.ctaText}</a>
              </div>

              <p style="color: #4a5568; font-size: 14px;">${opts.signature}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                TitanCrew · AI for Trade Contractors · Austin, TX<br>
                <a href="https://titancrew.ai/unsubscribe?email={email}" style="color: #94a3b8;">Unsubscribe</a> · <a href="https://titancrew.ai/privacy" style="color: #94a3b8;">Privacy Policy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Exports ───────────────────────────────────────────────────

export function renderSequenceForLead(tokens: LeadTokens): EmailTemplate[] {
  return generateEmailSequence(tokens);
}

// Example usage / preview helper
export function previewSequence(tokens: LeadTokens): void {
  const sequence = generateEmailSequence(tokens);
  for (const email of sequence) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Touch ${email.touchNumber} (Day ${email.delayDays})`);
    console.log(`Subject: ${email.subject}`);
    console.log(`\n${email.plainText.slice(0, 300)}...`);
  }
}
