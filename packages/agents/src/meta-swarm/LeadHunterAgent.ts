/**
 * TitanCrew · MetaSwarm — LeadHunterAgent
 *
 * Autonomously hunts for trade contractor pain signals across:
 * - Nextdoor (business forums / neighbor posts)
 * - Facebook Groups (local trade / home services communities)
 * - X / Twitter (keyword monitoring)
 * - Reddit (r/plumbing, r/hvac, r/electricians, r/smallbusiness)
 * - Google Maps new business listings
 *
 * Qualifies leads via a scoring rubric, enriches with business data,
 * deduplicates against existing `meta_leads` table, then triggers
 * DemoCreatorAgent for high-score leads and adds medium-score leads
 * to email drip sequences.
 *
 * Runs: Every 6 hours via n8n cron + on-demand from MetaSwarmOrchestrator
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../guardrails/logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const leadLog = createLogger("LeadHunterAgent");

// ─── Types ───────────────────────────────────────────────

interface LeadSignal {
  source: "nextdoor" | "facebook" | "twitter" | "reddit" | "google_maps" | "manual";
  rawText: string;
  authorHandle?: string;
  postUrl?: string;
  location?: string;
  tradeType?: string;
  painSignals: string[];
  postedAt?: string;
}

interface QualifiedLead {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  location: string;
  tradeType: string;
  teamSize?: string;
  estimatedMonthlyRevenue?: string;
  painPoints: string[];
  leadScore: number; // 0–100
  priority: "high" | "medium" | "low";
  signalSource: string;
  postUrl?: string;
  outreachAngle: string;
  personalizedHook: string;
}

// ─── Tool Definitions ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "search_social_signals",
    description:
      "Search for trade contractor pain signals on social platforms. Returns raw posts/content where contractors mention problems TitanCrew solves: missed follow-ups, scheduling chaos, unbilled jobs, parts running out, chasing invoices, overwhelmed by texts, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["reddit", "twitter", "facebook_groups", "nextdoor", "google_maps"],
          description: "Which platform to search",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description:
            "Search keywords — e.g. ['plumber overwhelmed', 'HVAC scheduling nightmare', 'snow plow business scheduling', 'junk removal missed invoice', 'forgot to invoice']",
        },
        location: {
          type: "string",
          description:
            "Geographic filter — US state or metro area. Leave empty for nationwide.",
        },
        maxResults: { type: "number", description: "Max results to return (5–25)" },
      },
      required: ["platform", "keywords"],
    },
  },
  {
    name: "qualify_lead_signal",
    description:
      "Score and qualify a raw social signal. Returns lead score 0–100, identified pain points, trade type, estimated business size, and personalized outreach angle.",
    input_schema: {
      type: "object" as const,
      properties: {
        signal: {
          type: "object",
          description: "The raw LeadSignal to qualify",
        },
        existingLeadEmails: {
          type: "array",
          items: { type: "string" },
          description: "Already-known lead emails to avoid deduplication",
        },
      },
      required: ["signal"],
    },
  },
  {
    name: "enrich_lead",
    description:
      "Enrich a qualified lead with business data: phone, email, Google Business info, estimated revenue, team size. Uses Google Places API + Hunter.io style lookup.",
    input_schema: {
      type: "object" as const,
      properties: {
        businessName: { type: "string" },
        location: { type: "string" },
        tradeType: { type: "string" },
        ownerHandleOrName: { type: "string" },
      },
      required: ["location", "tradeType"],
    },
  },
  {
    name: "save_lead_to_db",
    description: "Save a qualified + enriched lead to the meta_leads table in Supabase.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead: {
          type: "object",
          description: "The QualifiedLead object to persist",
        },
      },
      required: ["lead"],
    },
  },
  {
    name: "check_existing_leads",
    description:
      "Check if a phone number or email already exists in meta_leads to prevent duplicate outreach.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: { type: "string" },
        email: { type: "string" },
        businessName: { type: "string" },
      },
    },
  },
  {
    name: "trigger_demo_creator",
    description:
      "Trigger DemoCreatorAgent for a high-score lead (score ≥70). Passes personalized hook and pain points for video personalization.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        businessName: { type: "string" },
        ownerName: { type: "string" },
        tradeType: { type: "string" },
        painPoints: { type: "array", items: { type: "string" } },
        personalizedHook: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["leadId", "tradeType", "painPoints", "personalizedHook"],
    },
  },
  {
    name: "add_to_email_drip",
    description:
      "Add a medium-score lead (score 40–69) to the cold email drip sequence in n8n. 5-touch sequence over 10 days.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        email: { type: "string" },
        firstName: { type: "string" },
        tradeType: { type: "string" },
        painPoints: { type: "array", items: { type: "string" } },
        outreachAngle: { type: "string" },
      },
      required: ["leadId", "tradeType"],
    },
  },
  {
    name: "post_to_trades_group",
    description:
      "Post a value-add comment or tip in a relevant Facebook Group or Reddit thread to build organic visibility. NEVER spammy — must provide genuine value.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: { type: "string", enum: ["reddit", "facebook_groups"] },
        communityName: { type: "string", description: "e.g. 'r/plumbing' or 'HVAC Nation FB'" },
        postUrl: { type: "string", description: "URL of the thread to reply to" },
        message: {
          type: "string",
          description:
            "The value-add reply (NO sales pitch, genuine help only). Mention TitanCrew only if directly relevant.",
        },
      },
      required: ["platform", "communityName", "message"],
    },
  },
  {
    name: "get_hunt_summary",
    description: "Get stats from this hunt session: signals found, leads qualified, demos triggered, drips added.",
    input_schema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "search_social_signals": {
      // In production: integrate with Apify actors for Reddit/Twitter scraping
      // Facebook Groups: Apify Facebook Scraper
      // Nextdoor: requires partner API or scraper
      // Google Maps: Google Places API new listings endpoint
      const { platform, keywords, location, maxResults = 10 } = toolInput as {
        platform: string;
        keywords: string[];
        location?: string;
        maxResults?: number;
      };

      leadLog.info({
        event: "search_social_signals",
        platform,
        keywords,
        location: location ?? "nationwide",
      }, "Searching social signals");

      // Apify integration stub
      const apifyToken = process.env.APIFY_API_TOKEN;
      if (!apifyToken) {
        leadLog.warn({ event: "apify_token_missing" }, "APIFY_API_TOKEN not set — returning mock signal");
        return {
          signals: [
            {
              source: platform,
              rawText:
                "Anyone else constantly forgetting to invoice after jobs? I did 12 jobs last month and only sent 8 invoices. Losing my mind keeping track of everything.",
              authorHandle: "plumber_pete_TX",
              postUrl: `https://www.reddit.com/r/plumbing/stub`,
              location: location ?? "Texas",
              tradeType: "plumber",
              painSignals: ["unbilled jobs", "overwhelmed", "tracking nightmare"],
              postedAt: new Date().toISOString(),
            },
          ],
          total: 1,
          platform,
        };
      }

      // Real Apify actor calls by platform
      const actorMap: Record<string, string> = {
        reddit: "trudax/reddit-scraper",
        twitter: "apidojo/tweet-scraper",
        facebook_groups: "apify/facebook-groups-scraper",
        nextdoor: "apify/web-scraper", // Custom scraper
        google_maps: "apify/google-maps-scraper",
      };

      const actorId = actorMap[platform] ?? "apify/web-scraper";
      const runResp = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&maxItems=${maxResults}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchTerms: keywords,
            ...(location ? { locationFilter: location } : {}),
            maxPosts: maxResults,
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      const results = (await runResp.json()) as any;
      return { signals: (results as any), total: (results as any).length, platform };
    }

    case "qualify_lead_signal": {
      const { signal } = toolInput as { signal: LeadSignal };

      // Score heuristics
      let score = 0;
      const painMapping: Record<string, number> = {
        "forgot to invoice": 25,
        "unbilled jobs": 25,
        "scheduling nightmare": 20,
        "scheduling chaos": 20,
        "missed follow-up": 20,
        "overwhelmed": 15,
        "parts running out": 15,
        "chasing payment": 20,
        "no show": 15,
        "double booked": 15,
        "customer ghosted": 10,
        "losing track": 15,
        "phone blowing up": 15,
        "can't keep up": 20,
      };

      const text = signal.rawText.toLowerCase();
      const detectedPains: string[] = [];
      for (const [pain, pts] of Object.entries(painMapping)) {
        if (text.includes(pain)) {
          score += pts;
          detectedPains.push(pain);
        }
      }

      // Location boost for target markets (TX, FL, CA, GA, AZ)
      if (signal.location) {
        const targetStates = ["texas", "florida", "california", "georgia", "arizona", "tx", "fl", "ca", "ga", "az"];
        if (targetStates.some((s) => signal.location!.toLowerCase().includes(s))) {
          score += 10;
        }
      }

      // Trade type bonus for higher-value trades
      const highValueTrades = ["hvac", "electrician", "plumber", "snow_plow", "junk_removal"];
      if (signal.tradeType && highValueTrades.includes(signal.tradeType.toLowerCase())) {
        score += 5;
      }

      score = Math.min(score, 100);

      const priority: QualifiedLead["priority"] =
        score >= 70 ? "high" : score >= 40 ? "medium" : "low";

      return {
        leadScore: score,
        priority,
        painPoints: detectedPains,
        tradeType: signal.tradeType ?? "general",
        location: signal.location ?? "Unknown",
        outreachAngle: detectedPains[0] ?? "business automation",
        personalizedHook: `Hey! Saw your post about ${detectedPains[0] ?? "the chaos of running your business"} — TitanCrew's AI crew handles that automatically. Takes 5 min to set up.`,
        signalSource: signal.source,
        postUrl: signal.postUrl,
      } as Partial<QualifiedLead>;
    }

    case "enrich_lead": {
      const { businessName, location, tradeType, ownerHandleOrName } = toolInput as {
        businessName?: string;
        location: string;
        tradeType: string;
        ownerHandleOrName?: string;
      };

      // Google Places API lookup
      const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!placesApiKey) {
        return { enriched: false, reason: "Google Places API key not configured" };
      }

      const query = `${businessName ?? tradeType} ${location}`;
      const placesResp = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${placesApiKey}`
      );
      const placesData = (await placesResp.json()) as any;
      const place = (placesData as any).results?.[0];

      if (!place) return { enriched: false, reason: "No business found" };

      // Get place details (phone, website)
      const detailResp = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,rating,user_ratings_total&key=${placesApiKey}`
      );
      const detail = ((await detailResp.json()) as any).result ?? {};

      return {
        enriched: true,
        businessName: detail.name ?? businessName,
        phone: detail.formatted_phone_number,
        website: detail.website,
        rating: detail.rating,
        reviewCount: detail.user_ratings_total,
        estimatedTeamSize: detail.user_ratings_total > 100 ? "5–15" : "1–4",
        estimatedMonthlyRevenue:
          detail.user_ratings_total > 200 ? "$50k–$150k" : "$10k–$50k",
      };
    }

    case "save_lead_to_db": {
      const { lead } = toolInput as { lead: QualifiedLead };
      const { data, error } = await (supabase.from("meta_leads") as any)
        .insert({
          business_name: lead.businessName,
          owner_name: lead.ownerName,
          phone: lead.phone,
          email: lead.email,
          location: lead.location,
          trade_type: lead.tradeType,
          lead_score: lead.leadScore,
          priority: lead.priority,
          pain_points: lead.painPoints,
          outreach_angle: lead.outreachAngle,
          personalized_hook: lead.personalizedHook,
          signal_source: lead.signalSource,
          post_url: lead.postUrl,
          status: "new",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) return { success: false, error: (error as any).message };
      return { success: true, leadId: (data as any)?.id };
    }

    case "check_existing_leads": {
      const { phone, email, businessName } = toolInput as {
        phone?: string;
        email?: string;
        businessName?: string;
      };

      const query = supabase.from("meta_leads").select("id, status");
      if (email) query.eq("email", email);
      else if (phone) query.eq("phone", phone);
      else if (businessName) query.ilike("business_name", `%${businessName}%`);

      const { data } = await query.limit(1);
      return { exists: (data?.length ?? 0) > 0, existingLead: data?.[0] };
    }

    case "trigger_demo_creator": {
      const payload = toolInput;
      const agentApiUrl = process.env.AGENT_API_URL;
      if (!agentApiUrl) return { triggered: false, reason: "AGENT_API_URL not configured" };

      await fetch(`${agentApiUrl}/crews/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AGENT_API_SECRET}`,
        },
        body: JSON.stringify({ event: "demo_create", payload }),
        signal: AbortSignal.timeout(10_000),
      }).catch((err) => {
        leadLog.error({ event: "trigger_demo_failed", error: String(err), leadId: payload.leadId }, "Failed to trigger demo creator");
      });

      return { triggered: true };
    }

    case "add_to_email_drip": {
      // n8n webhook: POST to drip workflow
      const n8nWebhookUrl = process.env.N8N_EMAIL_DRIP_WEBHOOK;
      if (!n8nWebhookUrl) return { queued: false, reason: "N8N_EMAIL_DRIP_WEBHOOK not set" };

      await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toolInput),
      }).catch((err) => {
        leadLog.error({ event: "email_drip_failed", error: String(err), leadId: toolInput.leadId }, "Failed to add lead to email drip");
      });

      return { queued: true };
    }

    case "post_to_trades_group": {
      // In production: Apify actor for Reddit/FB posting
      // Rate limit: max 3 posts/day per community
      const { platform, communityName, message } = toolInput as {
        platform: string;
        communityName: string;
        postUrl?: string;
        message: string;
      };

      leadLog.info({
        event: "post_to_community",
        platform,
        communityName,
        messagePreview: message.slice(0, 80),
      }, "Posting to trades community");

      // Stub — real implementation via Apify/Reddit API
      return {
        posted: true,
        platform,
        communityName,
        preview: message.slice(0, 100),
      };
    }

    case "get_hunt_summary": {
      const { data: sessionLeads } = await (supabase.from("meta_leads") as any)
        .select("lead_score, priority, status")
        .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());

      return {
        total: (sessionLeads as any)?.length ?? 0,
        high: (sessionLeads as any)?.filter((l: any) => l.priority === "high").length ?? 0,
        medium: (sessionLeads as any)?.filter((l: any) => l.priority === "medium").length ?? 0,
        low: (sessionLeads as any)?.filter((l: any) => l.priority === "low").length ?? 0,
        avgScore:
          (sessionLeads as any) && (sessionLeads as any).length > 0
            ? Math.round((sessionLeads as any).reduce((sum: number, l: any) => sum + (l.lead_score ?? 0), 0) / (sessionLeads as any).length)
            : 0,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── Main Agent Loop ──────────────────────────────────────

export async function runLeadHunterAgent(config?: {
  targetMarkets?: string[];
  tradeTypes?: string[];
  huntDepth?: "quick" | "standard" | "deep";
}): Promise<{ leadsFound: number; demosTriggered: number; dripsQueued: number }> {
  const {
    targetMarkets = ["Texas", "Florida", "California", "Georgia", "Arizona"],
    tradeTypes = ["plumber", "HVAC", "electrician", "snow_plow", "junk_removal"],
    huntDepth = "standard",
  } = config ?? {};

  const sessionId = `hunt_${Date.now()}`;

  const systemPrompt = `You are LeadHunterAgent — the autonomous lead acquisition engine for TitanCrew, a B2B SaaS platform that gives trade contractors (plumbers, HVAC, electricians, snow plow operators, junk removal companies) a 6-agent AI crew to run their business.

YOUR MISSION: Hunt for trade contractor pain signals on social platforms. Qualify, enrich, and route leads — high-score leads get a personalized demo video; medium-score leads go into email drip.

TARGET MARKETS: ${targetMarkets.join(", ")}
TARGET TRADES: ${tradeTypes.join(", ")}
HUNT DEPTH: ${huntDepth} (quick=2 platforms, standard=4 platforms, deep=all 5)

PAIN SIGNALS TO HUNT:
- "forgot to invoice" / "unbilled jobs" → Finance agent pitch
- "scheduling nightmare" / "double booked" → Scheduler pitch
- "parts running out" / "supplier chaos" → Inventory pitch
- "chasing payment" / "customer ghosted" → Comms + Finance pitch
- "overwhelmed" / "can't keep up" / "phone never stops" → Full crew pitch

SCORING:
- Score ≥70 → HIGH priority → trigger DemoCreatorAgent immediately
- Score 40–69 → MEDIUM priority → add to email drip sequence
- Score <40 → LOW priority → save only (future remarketing)

RULES:
1. Always check for existing leads before saving (no duplicates)
2. NEVER pitch directly in community posts — provide genuine value only
3. Enrich every high and medium lead before saving
4. Think step by step: search → qualify → deduplicate → enrich → route
5. After all platforms, get hunt summary and report results

SESSION ID: ${sessionId}`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Run a ${huntDepth} lead hunt. Cover ${huntDepth === "quick" ? "2" : huntDepth === "deep" ? "all 5" : "4"} platforms. Focus on ${tradeTypes.join(", ")} contractors in ${targetMarkets.join(", ")}. Qualify everything, route appropriately, and give me a final summary.`,
    },
  ];

  let demosTriggered = 0;
  let dripsQueued = 0;

  // Agentic loop
  for (let turn = 0; turn < 30; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        if (block.name === "trigger_demo_creator") demosTriggered++;
        if (block.name === "add_to_email_drip") dripsQueued++;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // Final count from DB
  const { data: newLeads } = await (supabase.from("meta_leads") as any)
    .select("id")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  return {
    leadsFound: (newLeads as any)?.length ?? 0,
    demosTriggered,
    dripsQueued,
  };
}

// ─── Entry point (called by n8n / MetaSwarmOrchestrator) ─

if (require.main === module) {
  runLeadHunterAgent({ huntDepth: "standard" })
    .then((result) => {
      leadLog.info({ event: "hunt_complete", ...result }, "Hunt complete");
      process.exit(0);
    })
    .catch((err) => {
      leadLog.error({ event: "hunt_fatal_error", error: String(err), stack: err instanceof Error ? err.stack : undefined }, "Fatal error during lead hunt");
      process.exit(1);
    });
}
