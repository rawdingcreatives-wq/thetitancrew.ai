/**
 * TitanCrew — Cold DM Templates
 *
 * Platform-specific DM scripts for direct outreach to trade contractors.
 *
 * Platforms:
 *   - Facebook (Messenger DMs from contractor groups)
 *   - Reddit (DMs after engaging in trade subreddits)
 *   - Nextdoor (Direct messages to local businesses)
 *   - Instagram (DM to @handle from local search)
 *   - LinkedIn (InMail to contractor pages)
 *   - SMS (cold text — TCPA-compliant first-touch)
 *
 * Rules:
 *   - First message never pitches. It asks or compliments.
 *   - Maximum 3 DM touches per person across all platforms
 *   - Never DM someone who has already been emailed (dedup in CRM)
 *   - Always provide value or a question before any ask
 *
 * Personalization tokens: {firstName}, {businessName}, {city}, {tradeType}, {painSignal}
 */

export interface DMTemplate {
  platform: string;
  touchNumber: 1 | 2 | 3;
  message: string;
  character_count: number;
  follow_up_delay_days: number;
  notes: string;
}

// ─── Facebook DM ──────────────────────────────────────────────

export const FACEBOOK_DMS: DMTemplate[] = [
  {
    platform: "facebook",
    touchNumber: 1,
    message: `Hey {firstName} — saw you in the {groupName} group. Quick question: do you handle your own scheduling or do you have someone for that?

Not pitching anything — I'm building a tool for {tradeType} contractors and genuinely trying to understand what the pain is.`,
    character_count: 220,
    follow_up_delay_days: 4,
    notes: "Opens with curiosity, not pitch. References shared group for context.",
  },
  {
    platform: "facebook",
    touchNumber: 2,
    message: `Thanks for getting back to me. That's exactly the pattern I kept hearing — {painSignal}.

I built TitanCrew for this. It's an AI that handles scheduling, invoicing, and parts orders for {tradeType} contractors automatically. 14-day free trial if you want to poke around: titancrew.ai

No pressure either way.`,
    character_count: 285,
    follow_up_delay_days: 7,
    notes: "Only sent if Touch 1 got a reply. References their stated pain.",
  },
  {
    platform: "facebook",
    touchNumber: 3,
    message: `Hey — last message from me. If the admin side ever becomes a bigger problem, TitanCrew is there: titancrew.ai/signup

Appreciate your time. Good luck with {businessName}.`,
    character_count: 145,
    follow_up_delay_days: 0,
    notes: "Graceful exit with no hard sell. Leaves door open.",
  },
];

// ─── Reddit DM ────────────────────────────────────────────────

export const REDDIT_DMS: DMTemplate[] = [
  {
    platform: "reddit",
    touchNumber: 1,
    message: `Hey u/{redditHandle} — saw your comment in r/{subreddit} about {painSignal}. Dealing with the same thing?

I've been building something for {tradeType} contractors that handles exactly that kind of headache automatically. Happy to show you if you're curious.`,
    character_count: 250,
    follow_up_delay_days: 3,
    notes: "References specific comment/post for credibility. Non-intrusive.",
  },
  {
    platform: "reddit",
    touchNumber: 2,
    message: `Following up — it's called TitanCrew. 14-day free trial, no card: titancrew.ai

Happy to answer any questions here or hop on a quick call. No sales pitch — just showing you what it does.`,
    character_count: 175,
    follow_up_delay_days: 0,
    notes: "Only send if no reply to Touch 1 after 3 days. Brief, no pressure.",
  },
  {
    platform: "reddit",
    touchNumber: 3,
    message: `Last thing from me — titancrew.ai if you ever want to try it. Good luck with the business.`,
    character_count: 90,
    follow_up_delay_days: 0,
    notes: "Absolute last touch. Very short, no ask.",
  },
];

// ─── Instagram DM ─────────────────────────────────────────────

export const INSTAGRAM_DMS: DMTemplate[] = [
  {
    platform: "instagram",
    touchNumber: 1,
    message: `Hey {firstName} — love the work you're sharing on here. Quick question: biggest headache running {businessName} day to day — is it scheduling, invoicing, or something else?`,
    character_count: 168,
    follow_up_delay_days: 5,
    notes: "Opens with genuine compliment. Single question only.",
  },
  {
    platform: "instagram",
    touchNumber: 2,
    message: `That tracks — I hear that constantly from {tradeType} contractors. I built TitanCrew to handle exactly that. AI that runs your scheduling + invoicing automatically while you're on the job. Free trial at titancrew.ai if you're curious.`,
    character_count: 230,
    follow_up_delay_days: 0,
    notes: "Bridge from their pain to solution. Keep it short — IG DMs are skimmed.",
  },
  {
    platform: "instagram",
    touchNumber: 3,
    message: `Hey — last message from me. titancrew.ai if it ever makes sense. Keep up the great work 🔧`,
    character_count: 85,
    follow_up_delay_days: 0,
    notes: "Exit message. Emoji appropriate for IG culture.",
  },
];

// ─── LinkedIn InMail ──────────────────────────────────────────

export const LINKEDIN_INMAILS: DMTemplate[] = [
  {
    platform: "linkedin",
    touchNumber: 1,
    message: `Hi {firstName},

I work with {tradeType} contractors and noticed {businessName} on LinkedIn — looks like a solid operation in {city}.

Quick question: how are you currently handling job scheduling and invoicing? Software, spreadsheets, dispatcher?

Not selling anything yet — researching what the biggest bottlenecks are for contractors your size.

— Stephen`,
    character_count: 340,
    follow_up_delay_days: 5,
    notes: "LinkedIn allows longer messages. Research framing reduces defensive responses.",
  },
  {
    platform: "linkedin",
    touchNumber: 2,
    message: `Hi {firstName},

Following up. Based on what I typically hear from {tradeType} contractors, the biggest time drain is usually [scheduling conflicts / invoice tracking / parts ordering].

I built TitanCrew to automate all three for small crews (1–10 employees). It connects to QuickBooks, syncs with your calendar, and handles parts orders from Ferguson and Grainger automatically.

14-day free trial: titancrew.ai/signup

Happy to demo it on a 15-minute call if you'd like to see it running on a real {tradeType} workflow.

— Stephen Rawding, Founder`,
    character_count: 490,
    follow_up_delay_days: 0,
    notes: "Full value proposition. Direct link. Calendar offer.",
  },
  {
    platform: "linkedin",
    touchNumber: 3,
    message: `{firstName} — last note from me. If the back-office side ever becomes a bigger issue, titancrew.ai is there. Best of luck with {businessName}.`,
    character_count: 145,
    follow_up_delay_days: 0,
    notes: "Professional exit. No hard close.",
  },
];

// ─── Nextdoor Business Message ────────────────────────────────

export const NEXTDOOR_DMS: DMTemplate[] = [
  {
    platform: "nextdoor",
    touchNumber: 1,
    message: `Hi {firstName} — I saw {businessName} listed as a local {tradeType} business here in {city}. I'm a founder building software specifically for trade contractors in this area.

Quick question: is keeping your schedule organized the biggest headache, or is it more the invoicing side?`,
    character_count: 275,
    follow_up_delay_days: 4,
    notes: "Local angle is highly effective on Nextdoor. Single question to open dialogue.",
  },
  {
    platform: "nextdoor",
    touchNumber: 2,
    message: `Thanks for responding. I built TitanCrew for exactly what you're describing — it handles scheduling confirmations, invoices, and parts orders for {tradeType} contractors automatically. Free trial at titancrew.ai. Would love to get your thoughts as a local contractor.`,
    character_count: 270,
    follow_up_delay_days: 0,
    notes: "Frame trial as research/feedback, not sales. Local contractors respond to this.",
  },
  {
    platform: "nextdoor",
    touchNumber: 3,
    message: `Last message — titancrew.ai if you ever want to try it. Appreciate your time, {firstName}.`,
    character_count: 80,
    follow_up_delay_days: 0,
    notes: "Short graceful exit.",
  },
];

// ─── Cold SMS (TCPA-compliant) ────────────────────────────────

export const COLD_SMS_TEMPLATES: DMTemplate[] = [
  {
    platform: "sms",
    touchNumber: 1,
    message: `Hi {firstName}, I'm Stephen — founder of TitanCrew. I'm reaching out to {tradeType} contractors in {city} about AI-powered scheduling + invoicing automation. Interested in a 14-day free trial? Reply YES or STOP to opt out.`,
    character_count: 220,
    follow_up_delay_days: 3,
    notes: `TCPA-compliant first touch:
- Must be sent 8am-9pm recipient local time
- Includes STOP opt-out
- Business name and sender identity disclosed
- Do NOT send to numbers on suppression list
- Source: must have obtained number from public business listing`,
  },
  {
    platform: "sms",
    touchNumber: 2,
    message: `Hey {firstName} — following up on TitanCrew. It handles your scheduling, invoices, and parts orders automatically while you're on jobs. Free 14 days: titancrew.ai. Reply STOP to opt out.`,
    character_count: 185,
    follow_up_delay_days: 0,
    notes: "Only send if Touch 1 was replied to with YES, or no reply after 3 days. One follow-up max.",
  },
  {
    platform: "sms",
    touchNumber: 3,
    message: `{firstName} — last text from me. titancrew.ai/signup if you want to try it free. Reply STOP to opt out.`,
    character_count: 95,
    follow_up_delay_days: 0,
    notes: "Final touch. Absolute minimum. STOP always included.",
  },
];

// ─── DM selector utility ───────────────────────────────────────

export type PlatformKey = "facebook" | "reddit" | "instagram" | "linkedin" | "nextdoor" | "sms";

export function getDMSequence(platform: PlatformKey): DMTemplate[] {
  const map: Record<PlatformKey, DMTemplate[]> = {
    facebook: FACEBOOK_DMS,
    reddit: REDDIT_DMS,
    instagram: INSTAGRAM_DMS,
    linkedin: LINKEDIN_INMAILS,
    nextdoor: NEXTDOOR_DMS,
    sms: COLD_SMS_TEMPLATES,
  };
  return map[platform] ?? [];
}

export function fillTokens(
  template: string,
  tokens: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? `{${key}}`);
}

// ─── TCPA guardrail for SMS ────────────────────────────────────

export function isSMSSendAllowed(recipientTimezone: string): boolean {
  const now = new Date();
  const recipientTime = new Date(
    now.toLocaleString("en-US", { timeZone: recipientTimezone })
  );
  const hour = recipientTime.getHours();
  return hour >= 8 && hour < 21; // 8am–9pm
}

export function buildSMSComplianceCheck(phone: string, timezone: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!isSMSSendAllowed(timezone)) {
    return { allowed: false, reason: `Outside TCPA quiet hours in ${timezone}` };
  }
  // Additional checks would include suppression list lookup
  return { allowed: true };
}
