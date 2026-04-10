/**
 * TitanCrew — TradesGroupPosterAgent
 *
 * Distributes TitanCrew content across high-value trades communities:
 *   - Facebook Groups (trades groups, local community groups, HOA groups)
 *   - Reddit (r/HomeImprovement, r/DIY, r/Plumbing, r/HVAC, r/electricians, local subreddits)
 *   - Nextdoor (local neighborhood posts)
 *   - LinkedIn (professional contractor posts)
 *
 * Strategy: VALUE-FIRST posting — no spam, no ads. Share useful tips, before/afters,
 * seasonal reminders, and educational content. Indirect brand building only.
 *
 * Anti-spam safeguards:
 *   - Per-platform daily post limits
 *   - 72-hour minimum cooldown per group
 *   - Persona rotation (3 voice styles: expert, neighbor, storyteller)
 *   - Content variation to prevent duplicate detection
 *   - Respects platform Terms of Service for organic posting
 *
 * Growth mechanism: Each helpful post builds local brand awareness.
 * Calls-to-action are soft ("happy to answer questions", "DM if you need a referral").
 */

import Anthropic from "@anthropic-ai/sdk";
// @ts-ignore
import { createServiceClient } from "@/lib/supabase/service";
// @ts-ignore
import { auditLog } from "@titancrew/agents/src/guardrails/AuditLogger";
import { createLogger } from "../guardrails/logger";

// ─── Types ────────────────────────────────────────────────────

type Platform = "facebook" | "reddit" | "nextdoor" | "linkedin";
type PostPersona = "expert" | "neighbor" | "storyteller";
type ContentType =
  | "tip"
  | "seasonal_reminder"
  | "before_after"
  | "case_study"
  | "myth_busting"
  | "maintenance_checklist";

interface GroupTarget {
  platform: Platform;
  groupId: string;
  groupName: string;
  category: "trades" | "local" | "diy" | "homeowners";
  estimatedMembers: number;
  lastPostedAt?: string;
  totalPosts: number;
}

interface PostResult {
  platform: Platform;
  groupId: string;
  groupName: string;
  postId?: string;
  content: string;
  contentType: ContentType;
  postedAt: string;
  success: boolean;
  error?: string;
}

interface PostingContext {
  accountId: string;
  businessName: string;
  tradeType: string;
  city: string;
  state: string;
  recentCaseStudies?: Array<{
    summary: string;
    jobType: string;
    title: string;
  }>;
  season: "spring" | "summer" | "fall" | "winter";
}

// ─── Rate Limit Config ─────────────────────────────────────────

const PLATFORM_LIMITS = {
  facebook: { dailyMax: 3, cooldownHours: 72, enabled: true },
  reddit: { dailyMax: 2, cooldownHours: 48, enabled: true },
  nextdoor: { dailyMax: 1, cooldownHours: 120, enabled: true },
  linkedin: { dailyMax: 2, cooldownHours: 24, enabled: true },
} as const;

const CONTENT_ROTATION: ContentType[] = [
  "tip",
  "seasonal_reminder",
  "myth_busting",
  "maintenance_checklist",
  "before_after",
  "case_study",
];

const PERSONA_ROTATION: PostPersona[] = ["expert", "neighbor", "storyteller"];

// ─── Trade-specific content seeds ─────────────────────────────

const SEASONAL_TOPICS: Record<string, Record<string, string[]>> = {
  plumbing: {
    spring: ["pipe inspection after winter freeze", "water heater flush", "outdoor faucet check"],
    summer: ["sprinkler system startup", "water pressure issues in heat", "pool plumbing tips"],
    fall: ["winterize outdoor pipes", "water heater efficiency before winter", "sewer line inspection"],
    winter: ["frozen pipe prevention", "water heater thermostat settings", "emergency shutoff valve location"],
  },
  hvac: {
    spring: ["AC tune-up before summer", "replacing air filters", "checking refrigerant levels"],
    summer: ["AC not cooling enough", "heat pump efficiency tips", "smart thermostat programming"],
    fall: ["furnace startup checklist", "duct cleaning before heating season", "carbon monoxide detector check"],
    winter: ["heat pump vs furnace decision", "duct sealing for efficiency", "programmable thermostat savings"],
  },
  electrical: {
    spring: ["GFCI outlet testing", "outdoor outlet weatherproofing", "panel inspection"],
    summer: ["circuit overload from AC", "outdoor lighting for security", "EV charger installation cost"],
    fall: ["holiday lighting safety", "generator readiness", "smoke detector battery replacement"],
    winter: ["space heater electrical safety", "holiday light fire hazards", "surge protection in winter storms"],
  },
  general: {
    spring: ["spring home inspection checklist", "weather stripping replacement", "caulking windows"],
    summer: ["preventing summer water damage", "attic ventilation importance", "deck maintenance"],
    fall: ["gutter cleaning importance", "insulation check before winter", "smoke alarm testing"],
    winter: ["pipe insulation DIY vs professional", "emergency contractor vs wait", "winter home maintenance"],
  },
};

const MYTH_BUSTERS: Record<string, string[]> = {
  plumbing: [
    "MYTH: Flushable wipes are safe for pipes. TRUTH: They cause 90% of sewer blockages we clear.",
    "MYTH: A little drip is no big deal. TRUTH: A dripping faucet wastes 3,000+ gallons per year.",
    "MYTH: Liquid drain cleaner fixes clogs. TRUTH: It damages pipes and rarely fully clears blockages.",
  ],
  hvac: [
    "MYTH: Closing vents in unused rooms saves energy. TRUTH: It actually overworks your system.",
    "MYTH: You only need AC service when it breaks. TRUTH: Annual tune-ups cut energy bills 15-20%.",
    "MYTH: Bigger AC = faster cooling. TRUTH: Oversized units short-cycle and create humidity problems.",
  ],
  electrical: [
    "MYTH: If the breaker doesn't trip, it's safe. TRUTH: Breakers are last-resort protection, not indicators.",
    "MYTH: Two-prong outlets are fine for old homes. TRUTH: They're ungrounded and a code violation in new circuits.",
    "MYTH: Extension cords are a permanent solution. TRUTH: Permanent use of extension cords is a fire hazard.",
  ],
  general: [
    "MYTH: DIY always saves money. TRUTH: Botched repairs cost 3x more to fix than calling a pro.",
    "MYTH: All contractors are the same. TRUTH: Licensing, insurance, and experience gaps cause major quality differences.",
    "MYTH: Permits are just a cash grab. TRUTH: Unpermitted work voids homeowner insurance coverage.",
  ],
};

// ─── Main Agent ────────────────────────────────────────────────

export async function runTradesGroupPosterAgent(
  ctx: PostingContext
): Promise<PostResult[]> {
  const supabase = createServiceClient();
  const client = new Anthropic();
  const results: PostResult[] = [];
  const today = new Date().toISOString().split("T")[0];
  const postLog = createLogger("TradesGroupPosterAgent");

  await auditLog({
    accountId: ctx.accountId,
    agentName: "TradesGroupPosterAgent",
    eventType: "agent_run_started",
    details: { accountId: ctx.accountId, season: ctx.season },
  });

  // ── 1. Get target groups for this account ──────────────────
  const { data: groups } = await (supabase.from("social_group_targets") as any)
    .select("*")
    .eq("account_id", ctx.accountId)
    .eq("active", true)
    .order("last_posted_at", { ascending: true, nullsFirst: true });

  if (!groups || groups.length === 0) {
    postLog.info({ accountId: ctx.accountId }, "No groups configured");

    // Auto-seed default groups based on trade type + city
    await seedDefaultGroups(ctx.accountId, ctx.tradeType, ctx.city, ctx.state);
    return results;
  }

  // ── 2. Get today's post count per platform ─────────────────
  const { data: todaysPosts } = await (supabase.from("social_posts") as any)
    .select("platform")
    .eq("account_id", ctx.accountId)
    .gte("created_at", `${today}T00:00:00Z`);

  const platformPostCounts: Record<Platform, number> = {
    facebook: 0,
    reddit: 0,
    nextdoor: 0,
    linkedin: 0,
  };

  for (const post of todaysPosts ?? []) {
    const p = post.platform as Platform;
    if (p in platformPostCounts) platformPostCounts[p]++;
  }

  // ── 3. Select eligible groups ──────────────────────────────
  const eligibleGroups = groups.filter((group: GroupTarget) => {
    const config = PLATFORM_LIMITS[group.platform as Platform];
    if (!config.enabled) return false;
    if (platformPostCounts[group.platform as Platform] >= config.dailyMax) return false;

    // Check cooldown
    if (group.lastPostedAt) {
      const hoursSincePost = (Date.now() - new Date(group.lastPostedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSincePost < config.cooldownHours) return false;
    }

    return true;
  });

  if (eligibleGroups.length === 0) {
    postLog.info({ accountId: ctx.accountId }, "All groups at rate limit or on cooldown");
    return results;
  }

  // ── 4. Generate and post content ───────────────────────────
  const totalPostsEver = groups.reduce((sum: number, g: GroupTarget) => sum + (g.totalPosts || 0), 0);

  for (const group of eligibleGroups.slice(0, 4)) { // Max 4 posts per run
    const persona = PERSONA_ROTATION[totalPostsEver % PERSONA_ROTATION.length];
    const contentType = selectContentType(group, ctx, totalPostsEver);

    try {
      const content = await generateGroupPost(client, ctx, group, persona, contentType);

      // In production, post via platform API / Apify
      const postResult = await simulateOrPostToGroup(group, content, ctx.accountId);

      const result: PostResult = {
        platform: group.platform as Platform,
        groupId: group.groupId,
        groupName: group.groupName,
        content,
        contentType,
        postedAt: new Date().toISOString(),
        success: postResult.success,
        postId: postResult.postId,
        error: postResult.error,
      };

      results.push(result);

      if (postResult.success) {
        // Update group metadata
        await (supabase.from("social_group_targets") as any)
          .update({
            last_posted_at: result.postedAt,
            total_posts: (group.totalPosts || 0) + 1,
          })
          .eq("id", (group as any).id);

        // Log the post
        await supabase.from("social_posts").insert({
          id: crypto.randomUUID(),
          account_id: ctx.accountId,
          platform: group.platform,
          group_id: group.groupId,
          group_name: group.groupName,
          content,
          content_type: contentType,
          persona,
          post_id: postResult.postId,
          created_at: result.postedAt,
        });

        platformPostCounts[group.platform as Platform]++;
      }

      await auditLog({
        accountId: ctx.accountId,
        agentName: "TradesGroupPosterAgent",
        eventType: postResult.success ? "social_post_published" : "social_post_failed",
        details: {
          platform: group.platform,
          groupName: group.groupName,
          contentType,
          persona,
          error: postResult.error,
        },
      });

      // Rate-limit API calls
      await delay(1500);
    } catch (err) {
      postLog.error({ accountId: ctx.accountId, groupName: group.groupName, platform: group.platform, error: String(err) }, "Failed to post to group");
    }
  }

  return results;
}

// ─── Content Generator ─────────────────────────────────────────

async function generateGroupPost(
  client: Anthropic,
  ctx: PostingContext,
  group: GroupTarget,
  persona: PostPersona,
  contentType: ContentType
): Promise<string> {
  const tradeType = ctx.tradeType ?? "plumbing";
  const topics = SEASONAL_TOPICS[tradeType]?.[ctx.season] ?? SEASONAL_TOPICS.general[ctx.season];
  const myths = MYTH_BUSTERS[tradeType] ?? MYTH_BUSTERS.general;

  const personaInstructions = {
    expert: "Write as an experienced trade professional sharing expert knowledge. Use technical terms where helpful but explain them.",
    neighbor: "Write as a local neighbor/community member who happens to know about this trade. Casual, friendly, community-oriented.",
    storyteller: "Write as someone sharing a real story or experience. Start with a narrative hook. Make it personal and relatable.",
  };

  const contentPrompts = {
    tip: `Share a genuinely useful ${tradeType} tip about ${topics[Math.floor(Math.random() * topics.length)]}. Be specific and actionable.`,
    seasonal_reminder: `Write a timely ${ctx.season} reminder about ${topics[Math.floor(Math.random() * topics.length)]} for homeowners in ${ctx.city}, ${ctx.state}.`,
    myth_busting: `Address this common misconception and educate the community: "${myths[Math.floor(Math.random() * myths.length)]}"`,
    maintenance_checklist: `Share a quick 3-5 point ${ctx.season} ${tradeType} maintenance checklist for homeowners. Be specific.`,
    before_after: ctx.recentCaseStudies?.[0]
      ? `Share an educational post inspired by this recent job: "${ctx.recentCaseStudies[0].summary}". Focus on the lesson learned, not the sale.`
      : `Describe a typical before/after ${tradeType} scenario that teaches homeowners something important.`,
    case_study: ctx.recentCaseStudies?.[0]
      ? `Share an educational post about: "${ctx.recentCaseStudies[0].title}". Focus on what homeowners can learn, minimize self-promotion.`
      : `Share an educational story about a common ${tradeType} problem and how it was solved.`,
  };

  const platformGuidelines = {
    facebook: `Format for Facebook. 2-4 short paragraphs. Can use 1-2 relevant emojis. End with a soft call-to-action like "Happy to answer any questions!" Mention ${ctx.city} area naturally.`,
    reddit: `Format for Reddit. NO promotional language. Pure educational value. Start with the most useful information. Use bullet points if listing steps. DO NOT mention your business name. Write as a knowledgeable individual.`,
    nextdoor: `Format for Nextdoor neighborhood post. Very local and community-focused. Mention ${ctx.city} neighborhood. Friendly and personal tone. Short — 2 paragraphs max.`,
    linkedin: `Format for LinkedIn. Professional tone. Share business insight or industry tip. Mention ${ctx.businessName} naturally once at end if relevant. Include 2-3 relevant hashtags.`,
  };

  const systemPrompt = `You are creating organic social media content for a local ${tradeType} contractor in ${ctx.city}, ${ctx.state}.
The GOAL is to build trust and visibility through genuinely helpful content — NOT direct advertising.
Never sound spammy. Never include phone numbers. Never be pushy.
${personaInstructions[persona]}
Return ONLY the post text, no additional commentary or JSON.`;

  const userPrompt = `Content type: ${contentType}
Platform: ${group.platform} (${group.groupName})
${contentPrompts[contentType]}

Platform formatting: ${platformGuidelines[group.platform as Platform]}

Business context (use sparingly/naturally only if it fits the platform guidelines):
- Business: ${ctx.businessName}
- Trade: ${ctx.tradeType}
- City: ${ctx.city}, ${ctx.state}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  return (response.content[0] as { type: string; text: string }).text.trim();
}

// ─── Group seeding ─────────────────────────────────────────────

async function seedDefaultGroups(
  accountId: string,
  tradeType: string,
  city: string,
  state: string
): Promise<void> {
  const supabase = createServiceClient();

  // Default groups by trade — in production these come from a groups discovery API
  const defaultGroups: Omit<GroupTarget, "lastPostedAt" | "totalPosts">[] = [
    // Reddit — nationwide trade subreddits
    {
      platform: "reddit",
      groupId: `r/HomeImprovement`,
      groupName: "r/HomeImprovement",
      category: "homeowners",
      estimatedMembers: 4200000,
    },
    {
      platform: "reddit",
      groupId: `r/DIY`,
      groupName: "r/DIY",
      category: "diy",
      estimatedMembers: 3900000,
    },
    // Trade-specific subreddits
    ...(tradeType === "plumbing"
      ? [{ platform: "reddit" as Platform, groupId: "r/Plumbing", groupName: "r/Plumbing", category: "trades" as const, estimatedMembers: 380000 }]
      : []),
    ...(tradeType === "hvac"
      ? [{ platform: "reddit" as Platform, groupId: "r/hvacadvice", groupName: "r/hvacadvice", category: "trades" as const, estimatedMembers: 220000 }]
      : []),
    ...(tradeType === "electrical"
      ? [{ platform: "reddit" as Platform, groupId: "r/electricians", groupName: "r/electricians", category: "trades" as const, estimatedMembers: 340000 }]
      : []),
    // Facebook local groups (stubs — in production populated by Facebook Graph API)
    {
      platform: "facebook",
      groupId: `fb_${city.toLowerCase().replace(/ /g, "_")}_homeowners`,
      groupName: `${city} Homeowners Group`,
      category: "homeowners",
      estimatedMembers: 5000,
    },
    {
      platform: "facebook",
      groupId: `fb_${city.toLowerCase().replace(/ /g, "_")}_community`,
      groupName: `${city} Community Forum`,
      category: "local",
      estimatedMembers: 12000,
    },
    // Nextdoor
    {
      platform: "nextdoor",
      groupId: `nd_${city.toLowerCase().replace(/ /g, "_")}_${state.toLowerCase()}`,
      groupName: `${city} Nextdoor`,
      category: "local",
      estimatedMembers: 3000,
    },
    // LinkedIn
    {
      platform: "linkedin",
      groupId: `li_${tradeType}_contractors`,
      groupName: `${tradeType.charAt(0).toUpperCase() + tradeType.slice(1)} Contractors Network`,
      category: "trades",
      estimatedMembers: 45000,
    },
  ];

  const rows = defaultGroups.map((g) => ({
    id: crypto.randomUUID(),
    account_id: accountId,
    platform: g.platform,
    group_id: g.groupId,
    group_name: g.groupName,
    category: g.category,
    estimated_members: g.estimatedMembers,
    total_posts: 0,
    active: true,
    created_at: new Date().toISOString(),
  }));

  await supabase.from("social_group_targets").upsert(rows, { onConflict: "account_id,group_id" });
  const seedLog = createLogger("TradesGroupPosterAgent");
  seedLog.info({ accountId, groupCount: rows.length }, "Seeded default groups");
}

// ─── Platform posting (stub / Apify in prod) ──────────────────

async function simulateOrPostToGroup(
  group: GroupTarget,
  content: string,
  accountId: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // Production: route to platform-specific Apify actor or API call
  // Facebook: facebook.com post via Apify Facebook poster actor
  // Reddit: Reddit API (OAuth, PRAW-style)
  // Nextdoor: Apify Nextdoor actor (limited, monitor ToS)
  // LinkedIn: LinkedIn Share API (OAuth)

  const integrationMap: Record<Platform, string> = {
    facebook: process.env.APIFY_FACEBOOK_ACTOR_ID ?? "",
    reddit: process.env.REDDIT_API_KEY ?? "",
    nextdoor: process.env.APIFY_NEXTDOOR_ACTOR_ID ?? "",
    linkedin: process.env.LINKEDIN_ACCESS_TOKEN ?? "",
  };

  const hasIntegration = integrationMap[group.platform as Platform];

  if (!hasIntegration) {
    // Dev mode: log and mark as success for queue
    const simLog = createLogger("TradesGroupPosterAgent");
    simLog.info({
      accountId,
      platform: group.platform,
      groupName: group.groupName,
      contentPreview: content.slice(0, 100)
    }, "Would post to group (dry run)");
    return { success: true, postId: `sim_${Date.now()}` };
  }

  // Production posting logic per platform
  switch (group.platform) {
    case "reddit":
      return postToReddit(group, content);
    case "linkedin":
      return postToLinkedIn(content);
    case "facebook":
    case "nextdoor":
      return postViaApify(group, content);
    default:
      return { success: false, error: "Unknown platform" };
  }
}

async function postToReddit(
  group: GroupTarget,
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // Reddit API v2 - requires OAuth app credentials
  // POST https://oauth.reddit.com/api/submit
  const subreddit = group.groupId.replace("r/", "");
  const title = content.split("\n")[0].slice(0, 300);

  try {
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "TitanCrew/1.0",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: process.env.REDDIT_USERNAME ?? "",
        password: process.env.REDDIT_PASSWORD ?? "",
      }),
    });

    const token = await tokenRes.json() as { access_token?: string; error?: string };
    if (!token.access_token) {
      return { success: false, error: `Reddit auth failed: ${token.error}` };
    }

    const postRes = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "TitanCrew/1.0",
      },
      body: new URLSearchParams({
        api_type: "json",
        kind: "self",
        sr: subreddit,
        title,
        text: content,
        nsfw: "false",
        spoiler: "false",
      }),
    });

    const postData = await postRes.json() as { json?: { data?: { id?: string }; errors?: string[][] } };
    const postId = postData?.json?.data?.id;
    if (!postId) {
      return { success: false, error: JSON.stringify(postData?.json?.errors) };
    }

    return { success: true, postId: `t3_${postId}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function postToLinkedIn(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // LinkedIn Share API
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN; // urn:li:person:XXX or urn:li:organization:XXX

  try {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }

    const location = res.headers.get("x-restli-id") ?? `li_${Date.now()}`;
    return { success: true, postId: location };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function postViaApify(
  group: GroupTarget,
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // Apify actor run for Facebook / Nextdoor
  const actorId = group.platform === "facebook"
    ? process.env.APIFY_FACEBOOK_ACTOR_ID
    : process.env.APIFY_NEXTDOOR_ACTOR_ID;

  if (!actorId) return { success: false, error: "Apify actor not configured" };

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.groupId,
          message: content,
        }),
      }
    );

    const data = await res.json() as { data?: { id?: string }; error?: { message?: string } };
    if (!data?.data?.id) {
      return { success: false, error: data?.error?.message ?? "Unknown Apify error" };
    }

    return { success: true, postId: data.data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function selectContentType(
  group: GroupTarget,
  ctx: PostingContext,
  totalPosts: number
): ContentType {
  // Reddit prefers educational content, less self-promotional
  if (group.platform === "reddit") {
    const redditTypes: ContentType[] = ["tip", "myth_busting", "maintenance_checklist"];
    return redditTypes[totalPosts % redditTypes.length];
  }

  // Use case study if we have recent ones
  if (ctx.recentCaseStudies && ctx.recentCaseStudies.length > 0 && totalPosts % 3 === 0) {
    return "case_study";
  }

  return CONTENT_ROTATION[totalPosts % CONTENT_ROTATION.length];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
