/**
 * TitanCrew — CaseStudyGeneratorAgent
 *
 * Pulls completed jobs + QuickBooks revenue data and auto-generates:
 *   1. Long-form SEO case study (Markdown + HTML)
 *   2. Short social proof snippet (1–2 sentences)
 *   3. SMS testimonial request to customer
 *   4. Google Review request link
 *   5. LinkedIn / Facebook post copy
 *
 * Triggers:
 *   - Job marked status = 'completed' (webhook from CustomerCrew)
 *   - Weekly batch run (GrowthOrchestrator cron)
 *
 * Output stored in: Supabase `case_studies` table + Storage bucket
 */

import Anthropic from "@anthropic-ai/sdk";
// @ts-ignore
import { createServiceClient } from "@/lib/supabase/service";
// @ts-ignore
import { auditLog } from "@titancrew/agents/src/guardrails/AuditLogger";
// @ts-ignore
import { createLogger } from "../guardrails/logger";
// @ts-ignore
import { integrationOrchestrator } from "@titancrew/agents/src/tools/integrations/IntegrationOrchestrator";
import twilio from "twilio";

// ─── Types ────────────────────────────────────────────────────

interface CompletedJob {
  id: string;
  account_id: string;
  job_type: string;
  description: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  customer_state: string;
  completed_at: string;
  invoice_amount: number;
  qbo_invoice_id?: string;
  technician_name?: string;
  parts_used?: string[];
  problem_description?: string;
  resolution_description?: string;
  time_to_complete_hours?: number;
  before_photos?: string[];
  after_photos?: string[];
  customer_rating?: number;
}

interface AccountProfile {
  id: string;
  business_name: string;
  trade_type: string; // plumbing | hvac | electrical | general
  owner_name: string;
  city: string;
  state: string;
  years_in_business?: number;
  website?: string;
  google_place_id?: string;
}

export interface CaseStudy {
  id: string;
  account_id: string;
  job_id: string;
  title: string;
  slug: string;
  summary: string; // 1-2 sentence social proof snippet
  full_markdown: string; // long-form SEO article
  full_html: string; // rendered HTML version
  social_post_facebook: string;
  social_post_linkedin: string;
  social_post_reddit: string;
  sms_review_request: string;
  google_review_url?: string;
  keywords: string[];
  status: "draft" | "published" | "testimonial_requested";
  created_at: string;
  published_at?: string;
}

export interface CaseStudyRequest {
  accountId: string;
  jobId: string;
  forceRegenerate?: boolean;
}

// ─── Agent ────────────────────────────────────────────────────

export async function runCaseStudyGeneratorAgent(
  req: CaseStudyRequest
): Promise<CaseStudy | null> {
  const supabase = createServiceClient();
  const client = new Anthropic();
  const runId = crypto.randomUUID();
  const csLog = createLogger("CaseStudyGeneratorAgent");

  await auditLog({
    accountId: req.accountId,
    agentName: "CaseStudyGeneratorAgent",
    eventType: "agent_run_started",
    details: { jobId: req.jobId, runId },
  });

  try {
    // ── 1. Check if case study already exists ──────────────────
    if (!req.forceRegenerate) {
      const { data: existing } = await (supabase.from("case_studies") as any)
        .select("id")
        .eq("job_id", req.jobId)
        .single();

      if (existing) {
        csLog.info({ event: "case_study_already_exists", jobId: req.jobId }, "Already exists for job");
        return null;
      }
    }

    // ── 2. Fetch job data ──────────────────────────────────────
    const { data: job, error: jobErr } = await (supabase.from("jobs") as any)
      .select("*")
      .eq("id", req.jobId)
      .eq("account_id", req.accountId)
      .single();

    if (jobErr || !job) {
      csLog.error({ event: "job_not_found", jobId: req.jobId, err: jobErr?.message }, "Job not found");
      return null;
    }

    // Only generate for completed, invoiced jobs with good data
    if (job.status !== "completed" || !job.invoice_amount || job.invoice_amount < 100) {
      csLog.warn({ event: "job_not_eligible", jobId: req.jobId, status: job.status, amount: job.invoice_amount }, "Job not eligible");
      return null;
    }

    // ── 3. Fetch account profile ───────────────────────────────
    const { data: account } = await (supabase.from("accounts") as any)
      .select("id, business_name, trade_type, owner_name, city, state, years_in_business, website, google_place_id")
      .eq("id", req.accountId)
      .single();

    if (!account) {
      csLog.error({ event: "account_not_found", accountId: req.accountId }, "Account not found");
      return null;
    }

    // ── 4. Enrich with QBO revenue data ───────────────────────
    let invoiceData = null;
    if (job.qbo_invoice_id) {
      try {
        const statuses = await integrationOrchestrator.getPaymentStatuses(
          req.accountId,
          [req.jobId]
        );
        invoiceData = statuses[0] ?? null;
      } catch {
        // Non-blocking
      }
    }

    // ── 5. Generate case study content with Claude ────────────
    const jobProfile = buildJobProfile(job, account, invoiceData);
    const content = await generateCaseStudyContent(client, jobProfile);

    // ── 6. Assemble CaseStudy object ───────────────────────────
    const caseStudyId = crypto.randomUUID();
    const slug = buildSlug(content.title, account.city, account.state, job.job_type);

    const googleReviewUrl = account.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${account.google_place_id}`
      : undefined;

    const caseStudy: Omit<CaseStudy, "id"> = {
      account_id: req.accountId,
      job_id: req.jobId,
      title: content.title,
      slug,
      summary: content.summary,
      full_markdown: content.fullMarkdown,
      full_html: markdownToHtml(content.fullMarkdown),
      social_post_facebook: content.facebookPost,
      social_post_linkedin: content.linkedinPost,
      social_post_reddit: content.redditPost,
      sms_review_request: content.smsReviewRequest,
      google_review_url: googleReviewUrl,
      keywords: content.keywords,
      status: "draft",
      created_at: new Date().toISOString(),
    };

    // ── 7. Save to Supabase ────────────────────────────────────
    const { data: saved, error: saveErr } = await (supabase.from("case_studies") as any)
      .insert({ id: caseStudyId, ...caseStudy })
      .select()
      .single();

    if (saveErr) {
      csLog.error({ event: "case_study_save_failed", jobId: req.jobId, accountId: req.accountId, err: saveErr.message }, "Save failed");
      return null;
    }

    // ── 8. Send testimonial request SMS (if rating not yet collected) ──
    if (!job.customer_rating && job.customer_phone) {
      await sendTestimonialRequestSMS(
        job.customer_phone,
        job.customer_name,
        account.business_name,
        content.smsReviewRequest,
        googleReviewUrl,
        req.accountId,
        req.jobId
      );

      await (supabase.from("case_studies") as any)
        .update({ status: "testimonial_requested" })
        .eq("id", caseStudyId);
    }

    await auditLog({
      accountId: req.accountId,
      agentName: "CaseStudyGeneratorAgent",
      eventType: "case_study_generated",
      details: {
        runId,
        caseStudyId,
        jobId: req.jobId,
        title: content.title,
        slug,
        keywordsCount: content.keywords.length,
        smsReviewSent: !job.customer_rating && !!job.customer_phone,
      },
    });

    return saved;
  } catch (err) {
    csLog.error({ event: "case_study_generation_fatal_error", jobId: req.jobId, accountId: req.accountId, err: String(err) }, "Fatal error");
    await auditLog({
      accountId: req.accountId,
      agentName: "CaseStudyGeneratorAgent",
      eventType: "agent_run_failed",
      details: { runId, jobId: req.jobId, error: String(err) },
    });
    return null;
  }
}

// ─── Batch runner (weekly cron) ────────────────────────────────

export async function runWeeklyCaseStudyBatch(): Promise<void> {
  const supabase = createServiceClient();
  const batchLog = createLogger("CaseStudyBatch");

  // Find completed jobs from the past 7 days that don't have case studies yet
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: newJobs } = await (supabase.from("jobs") as any)
    .select("id, account_id")
    .eq("status", "completed")
    .gte("completed_at", sevenDaysAgo)
    .gte("invoice_amount", 100)
    .not("id", "in", (
      supabase.from("case_studies").select("job_id")
    ) as any);

  if (!newJobs || newJobs.length === 0) {
    batchLog.info({ event: "no_eligible_jobs_found" }, "No new eligible jobs found");
    return;
  }

  batchLog.info({ event: "processing_batch", jobCount: newJobs.length }, "Processing batch");

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < newJobs.length; i += 5) {
    const batch = newJobs.slice(i, i + 5);
    await Promise.allSettled(
      batch.map((job: any) =>
        runCaseStudyGeneratorAgent({ accountId: job.account_id, jobId: job.id })
      )
    );
    if (i + 5 < newJobs.length) {
      await delay(2000); // 2s between batches
    }
  }

  batchLog.info({ event: "batch_complete", totalJobs: newJobs.length }, "Batch complete");
}

// ─── Content Generation ────────────────────────────────────────

interface JobProfile {
  businessName: string;
  tradeType: string;
  ownerName: string;
  city: string;
  state: string;
  yearsInBusiness: number;
  jobType: string;
  problemDescription: string;
  resolutionDescription: string;
  customerFirstName: string;
  customerCity: string;
  invoiceAmount: number;
  timeToCompleteHours: number;
  partsUsed: string[];
  technicianName: string;
  website?: string;
}

function buildJobProfile(
  job: CompletedJob,
  account: AccountProfile,
  _invoiceData: unknown
): JobProfile {
  return {
    businessName: account.business_name,
    tradeType: account.trade_type ?? "plumbing",
    ownerName: account.owner_name,
    city: account.city ?? job.customer_city,
    state: account.state ?? job.customer_state,
    yearsInBusiness: account.years_in_business ?? 5,
    jobType: job.job_type,
    problemDescription: job.problem_description ?? job.description ?? `${job.job_type} issue`,
    resolutionDescription: job.resolution_description ?? `Completed ${job.job_type} service`,
    customerFirstName: (job.customer_name ?? "").split(" ")[0] || "Customer",
    customerCity: job.customer_city ?? account.city,
    invoiceAmount: job.invoice_amount,
    timeToCompleteHours: job.time_to_complete_hours ?? 2,
    partsUsed: job.parts_used ?? [],
    technicianName: job.technician_name ?? account.owner_name,
    website: account.website,
  };
}

interface GeneratedContent {
  title: string;
  summary: string;
  fullMarkdown: string;
  facebookPost: string;
  linkedinPost: string;
  redditPost: string;
  smsReviewRequest: string;
  keywords: string[];
}

async function generateCaseStudyContent(
  client: Anthropic,
  profile: JobProfile
): Promise<GeneratedContent> {
  const systemPrompt = `You are a professional content writer specializing in SEO case studies for home service and trade contractor businesses.
You write compelling, real-sounding content that ranks in local Google searches and builds trust with homeowners.
Always write in a professional but friendly tone. Use specific details to make content feel authentic.
Return valid JSON only — no markdown fences, no extra text.`;

  const userPrompt = `Generate a complete case study package for this trade job:

Business: ${profile.businessName} (${profile.tradeType})
Owner: ${profile.ownerName}
Location: ${profile.city}, ${profile.state}
Years in business: ${profile.yearsInBusiness}
Job type: ${profile.jobType}
Problem: ${profile.problemDescription}
Resolution: ${profile.resolutionDescription}
Customer first name: ${profile.customerFirstName}
Customer city: ${profile.customerCity}
Invoice amount: $${profile.invoiceAmount.toFixed(2)}
Time to complete: ${profile.timeToCompleteHours} hours
Parts used: ${profile.partsUsed.length > 0 ? profile.partsUsed.join(", ") : "standard materials"}
Technician: ${profile.technicianName}

Return a JSON object with these exact keys:
{
  "title": "SEO-optimized H1 title (70 chars max, include city + trade + problem type)",
  "summary": "1-2 sentence social proof snippet. Start with the outcome. Include dollar amount saved or value delivered if relevant.",
  "fullMarkdown": "Full case study in Markdown. Must include: ## The Problem, ## Our Approach, ## The Solution, ## The Results, ## Why Choose [BusinessName]. Use h2 and h3 headings. Include a blockquote with a fictional but realistic customer quote from ${profile.customerFirstName}. 400-600 words. Include specific technical details about the ${profile.jobType}. Mention ${profile.city} location naturally for SEO.",
  "facebookPost": "Facebook post (150-200 chars). Conversational. Include emoji. End with 'Comment or call for a free quote!'",
  "linkedinPost": "LinkedIn post (200-250 chars). Professional tone. Mention the business outcome. Hashtags: #${profile.tradeType} #HomeServices #${profile.city.replace(/ /g, '')}",
  "redditPost": "Reddit post body for r/HomeImprovement or r/DIY (200-300 chars). Educational/helpful tone, no hard sell. Share the lesson learned or the technique used.",
  "smsReviewRequest": "SMS message (160 chars max). Ask ${profile.customerFirstName} for a Google review. Friendly, brief. No links in this field.",
  "keywords": ["array", "of", "8-12", "SEO", "keywords", "include city state trade type and job type variations"]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const text = (response.content[0] as { type: string; text: string }).text;

  try {
    return JSON.parse(text) as GeneratedContent;
  } catch {
    // Fallback: extract JSON from possible wrapper text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as GeneratedContent;
    throw new Error("Failed to parse Claude content generation response");
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function buildSlug(title: string, city: string, state: string, jobType: string): string {
  const base = `${title}-${city}-${state}-${jobType}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

function markdownToHtml(markdown: string): string {
  // Basic MD → HTML conversion (production should use marked or remark)
  return markdown
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>")
    .concat("</p>");
}

async function sendTestimonialRequestSMS(
  phone: string,
  customerName: string,
  businessName: string,
  smsBody: string,
  googleReviewUrl: string | undefined,
  accountId: string,
  jobId: string
): Promise<void> {
  const smsLog = createLogger("CaseStudyGeneratorAgent");
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const message = googleReviewUrl
    ? `${smsBody}\n\n⭐ Leave a review: ${googleReviewUrl}`
    : smsBody;

  try {
    await twilioClient.messages.create({
      body: message.slice(0, 480), // SMS safe
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phone,
    });

    await auditLog({
      accountId,
      agentName: "CaseStudyGeneratorAgent",
      eventType: "sms_review_request_sent",
      details: { jobId, customerName, hasGoogleLink: !!googleReviewUrl },
    });
  } catch (err) {
    smsLog.error({ event: "sms_send_failed", jobId, accountId, customerPhone: phone, err: String(err) }, "SMS send failed");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
