/**
 * TitanCrew · MetaSwarm — DemoCreatorAgent
 *
 * Auto-generates personalized 30-second demo videos for high-score leads.
 * Pipeline:
 *   1. GPT-4o generates a personalized script (trade type + pain points)
 *   2. ElevenLabs TTS converts script to voice (realistic AI voice)
 *   3. Runway ML Gen-2 generates relevant B-roll visuals
 *   4. FFmpeg assembles: voiceover + visuals + branded outro
 *   5. Supabase Storage uploads final MP4
 *   6. Sends personalized SMS + email with the video link
 *   7. Logs to meta_leads and comms_log tables
 *
 * Triggered by: LeadHunterAgent (high-score leads) or MetaSwarmOrchestrator
 * Fallback: If video generation fails → send text-based personalized demo link
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../apps/dashboard/lib/supabase/types";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ───────────────────────────────────────────────

interface DemoRequest {
  leadId: string;
  businessName?: string;
  ownerName?: string;
  tradeType: string;
  painPoints: string[];
  personalizedHook: string;
  phone?: string;
  email?: string;
  location?: string;
}

interface VideoScript {
  hook: string;            // First 5 seconds — grab attention
  painAgitate: string;     // 5–12 seconds — mirror their pain
  solution: string;        // 12–22 seconds — TitanCrew solves it
  cta: string;             // 22–30 seconds — "Reply YES to see it live"
  fullScript: string;      // Complete narration
  visualPrompts: string[]; // Runway ML prompts for each segment
  thumbnailText: string;   // Text overlay for video thumbnail
}

// ─── Tool Definitions ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "generate_video_script",
    description:
      "Generate a personalized 30-second demo video script for a trade contractor lead. Output includes narration script, visual prompts for video generation, and thumbnail text.",
    input_schema: {
      type: "object" as const,
      properties: {
        businessName: { type: "string" },
        ownerName: { type: "string" },
        tradeType: {
          type: "string",
          enum: ["plumber", "electrician", "hvac", "general_contractor", "roofer", "pest_control"],
        },
        primaryPainPoint: {
          type: "string",
          description: "The #1 pain point to address in the demo",
        },
        secondaryPainPoints: {
          type: "array",
          items: { type: "string" },
          description: "Additional pain points to weave in",
        },
        tone: {
          type: "string",
          enum: ["conversational", "professional", "urgent"],
          description: "Tone of the script",
        },
      },
      required: ["tradeType", "primaryPainPoint"],
    },
  },
  {
    name: "generate_voiceover",
    description:
      "Convert script text to a realistic AI voiceover using ElevenLabs. Returns the audio file path.",
    input_schema: {
      type: "object" as const,
      properties: {
        script: { type: "string", description: "The narration text to convert" },
        voiceId: {
          type: "string",
          description:
            "ElevenLabs voice ID — use 'trade_professional' for blue-collar feel",
        },
        outputPath: { type: "string", description: "Local file path for the MP3" },
      },
      required: ["script", "outputPath"],
    },
  },
  {
    name: "generate_visuals",
    description:
      "Generate video visuals using Runway ML Gen-2. Creates 4 short clips (6–8 seconds each) for the 4 script segments.",
    input_schema: {
      type: "object" as const,
      properties: {
        visualPrompts: {
          type: "array",
          items: { type: "string" },
          description: "Array of 4 Runway ML prompts for each script segment",
        },
        style: {
          type: "string",
          enum: ["realistic", "animated", "screen_recording"],
          description: "Visual style for the demo video",
        },
        outputDir: { type: "string", description: "Directory to save generated clips" },
      },
      required: ["visualPrompts", "outputDir"],
    },
  },
  {
    name: "assemble_video",
    description:
      "Assemble voiceover + visual clips + branded intro/outro into final MP4 using FFmpeg.",
    input_schema: {
      type: "object" as const,
      properties: {
        audioPath: { type: "string" },
        videoClips: { type: "array", items: { type: "string" } },
        outputPath: { type: "string" },
        brandingConfig: {
          type: "object",
          description: "Logo overlay position, color scheme, outro duration",
        },
      },
      required: ["audioPath", "videoClips", "outputPath"],
    },
  },
  {
    name: "upload_video",
    description:
      "Upload the assembled MP4 to Supabase Storage and return the public URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        localPath: { type: "string" },
        leadId: { type: "string" },
        fileName: { type: "string" },
      },
      required: ["localPath", "leadId"],
    },
  },
  {
    name: "send_demo_outreach",
    description:
      "Send personalized SMS + email to the lead with the video link. Includes a call-to-action to book a live demo.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        ownerName: { type: "string" },
        businessName: { type: "string" },
        videoUrl: { type: "string" },
        personalizedHook: { type: "string" },
        tradeType: { type: "string" },
        channel: {
          type: "string",
          enum: ["sms_only", "email_only", "both"],
        },
      },
      required: ["leadId", "videoUrl", "personalizedHook", "tradeType"],
    },
  },
  {
    name: "update_lead_status",
    description: "Update lead status in meta_leads after demo is sent.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        status: {
          type: "string",
          enum: ["demo_sent", "demo_failed", "video_created"],
        },
        videoUrl: { type: "string" },
        sentAt: { type: "string" },
      },
      required: ["leadId", "status"],
    },
  },
  {
    name: "create_fallback_demo_link",
    description:
      "If video generation fails, create a personalized interactive demo link (Loom-style walkthrough or Typeform) instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        tradeType: { type: "string" },
        primaryPainPoint: { type: "string" },
        ownerName: { type: "string" },
      },
      required: ["leadId", "tradeType", "primaryPainPoint"],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "generate_video_script": {
      const { businessName, ownerName, tradeType, primaryPainPoint, secondaryPainPoints, tone = "conversational" } =
        toolInput as {
          businessName?: string;
          ownerName?: string;
          tradeType: string;
          primaryPainPoint: string;
          secondaryPainPoints?: string[];
          tone?: string;
        };

      // Script templates by trade type and pain point
      const tradeEmoji: Record<string, string> = {
        plumber: "🔧",
        electrician: "⚡",
        hvac: "❄️",
        general_contractor: "🏗️",
      };

      const emoji = tradeEmoji[tradeType] ?? "🔧";
      const firstName = ownerName?.split(" ")[0] ?? "Hey";
      const biz = businessName ?? `your ${tradeType} business`;

      const script: VideoScript = {
        hook: `${firstName}, I know you're running ${biz} solo — and right now, ${primaryPainPoint} is costing you real money.`,
        painAgitate: `Every ${tradeType} I talk to says the same thing: jobs get done, but invoices slip through. Calls go unanswered. And you're losing $2–3k a month you've already earned.`,
        solution: `TitanCrew gives you a 6-agent AI crew that handles scheduling, invoicing, customer follow-ups, and parts — automatically. No extra staff. No new software to learn. It just runs.`,
        cta: `Reply YES and I'll show you exactly what your TitanCrew would look like for ${biz}. Takes 5 minutes. ${emoji}`,
        fullScript: `${firstName}, I know you're running ${biz} — and right now, ${primaryPainPoint} is costing you real money. Every ${tradeType} I talk to says the same thing: jobs get done, but invoices slip through. Calls go unanswered. You're losing $2–3k a month you've already earned. TitanCrew gives you a 6-agent AI crew that handles scheduling, invoicing, customer follow-ups, and parts — automatically. No extra staff. No new software to learn. It just runs. Reply YES and I'll show you exactly what your crew would look like for ${biz}. Takes 5 minutes.`,
        visualPrompts: [
          `Close-up of a ${tradeType}'s hands finishing a job, looking stressed, checking phone — cinematic, warm lighting`,
          `Split screen: pile of unpaid invoices on one side, missed calls on phone on other side — dramatic, realistic`,
          `Clean dashboard interface showing AI agents working: green checkmarks, jobs being booked, invoices sent automatically — tech aesthetic`,
          `${tradeType} contractor relaxing, checking phone showing revenue notification, smiling — success feeling, warm tones`,
        ],
        thumbnailText: `${emoji} Your ${tradeType} business on autopilot`,
      };

      return script;
    }

    case "generate_voiceover": {
      const { script, voiceId = "21m00Tcm4TlvDq8ikWAM", outputPath } = toolInput as {
        script: string;
        voiceId?: string;
        outputPath: string;
      };

      const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsKey) {
        console.warn("[DemoCreator] ElevenLabs API key not set — skipping TTS");
        return { success: false, reason: "ELEVENLABS_API_KEY not configured", fallback: true };
      }

      const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsKey,
          },
          body: JSON.stringify({
            text: script,
            model_id: "eleven_turbo_v2",
            voice_settings: { stability: 0.75, similarity_boost: 0.85 },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!resp.ok) {
        return { success: false, reason: `ElevenLabs error: ${resp.status}` };
      }

      const audioBuffer = Buffer.from(await resp.arrayBuffer());
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, audioBuffer);
      return { success: true, outputPath, durationEstimate: "~28s" };
    }

    case "generate_visuals": {
      const { visualPrompts, style = "realistic", outputDir } = toolInput as {
        visualPrompts: string[];
        style?: string;
        outputDir: string;
      };

      const runwayKey = process.env.RUNWAY_API_KEY;
      if (!runwayKey) {
        console.warn("[DemoCreator] Runway API key not set — using placeholder visuals");
        // Create placeholder clips for testing
        fs.mkdirSync(outputDir, { recursive: true });
        return {
          success: false,
          reason: "RUNWAY_API_KEY not configured",
          fallback: true,
          clips: [],
        };
      }

      const clips: string[] = [];
      for (let i = 0; i < visualPrompts.slice(0, 4).length; i++) {
        const prompt = visualPrompts[i];
        // Runway ML Gen-2 API
        const genResp = await fetch("https://api.runwayml.com/v1/image_to_video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runwayKey}`,
          },
          body: JSON.stringify({
            model: "gen2",
            promptText: prompt,
            duration: 7,
            ratio: "16:9",
          }),
          signal: AbortSignal.timeout(60_000),
        });

        const genData = await genResp.json();
        const clipPath = path.join(outputDir, `clip_${i}.mp4`);

        // Poll for completion
        if (genData.id) {
          let completed = false;
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise((r) => setTimeout(r, 5000));
            const statusResp = await fetch(
              `https://api.runwayml.com/v1/tasks/${genData.id}`,
              { headers: { Authorization: `Bearer ${runwayKey}` } }
            );
            const status = await statusResp.json();
            if (status.status === "SUCCEEDED") {
              const videoResp = await fetch(status.output[0]);
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              fs.writeFileSync(clipPath, videoBuffer);
              clips.push(clipPath);
              completed = true;
              break;
            }
          }
          if (!completed) clips.push(""); // placeholder
        }
      }

      return { success: true, clips: clips.filter(Boolean) };
    }

    case "assemble_video": {
      const { audioPath, videoClips, outputPath, brandingConfig } = toolInput as {
        audioPath: string;
        videoClips: string[];
        outputPath: string;
        brandingConfig?: Record<string, unknown>;
      };

      // Check if FFmpeg is available
      try {
        execSync("ffmpeg -version", { stdio: "ignore" });
      } catch {
        return { success: false, reason: "FFmpeg not installed" };
      }

      if (videoClips.length === 0) {
        return { success: false, reason: "No video clips provided" };
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      // Create concat list
      const concatList = path.join(path.dirname(outputPath), "concat.txt");
      fs.writeFileSync(concatList, videoClips.map((c) => `file '${c}'`).join("\n"));

      // Concatenate clips
      const tempVideo = outputPath.replace(".mp4", "_raw.mp4");
      execSync(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${tempVideo}" -y`);

      // Mix audio over video, add fade in/out, overlay logo
      const logoPath = process.env.BRAND_LOGO_PATH ?? "/assets/titancrew_logo.png";
      const hasLogo = fs.existsSync(logoPath);

      const ffmpegCmd = hasLogo
        ? `ffmpeg -i "${tempVideo}" -i "${audioPath}" -i "${logoPath}" -filter_complex "[0:v][2:v] overlay=W-w-20:20 [overlaid]; [overlaid] fade=t=in:st=0:d=0.5,fade=t=out:st=27:d=1.5 [vout]" -map "[vout]" -map 1:a -shortest -c:v libx264 -c:a aac "${outputPath}" -y`
        : `ffmpeg -i "${tempVideo}" -i "${audioPath}" -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=27:d=1.5" -map 0:v -map 1:a -shortest -c:v libx264 -c:a aac "${outputPath}" -y`;

      execSync(ffmpegCmd);

      // Cleanup temp files
      fs.unlinkSync(tempVideo);
      fs.unlinkSync(concatList);

      const stats = fs.statSync(outputPath);
      return {
        success: true,
        outputPath,
        fileSizeBytes: stats.size,
        estimatedDuration: "~30s",
      };
    }

    case "upload_video": {
      const { localPath, leadId, fileName } = toolInput as {
        localPath: string;
        leadId: string;
        fileName?: string;
      };

      if (!fs.existsSync(localPath)) {
        return { success: false, reason: "Video file not found" };
      }

      const videoBuffer = fs.readFileSync(localPath);
      const uploadName = fileName ?? `demo_${leadId}_${Date.now()}.mp4`;

      const { data, error } = await supabase.storage
        .from("lead-demos")
        .upload(`demos/${uploadName}`, videoBuffer, {
          contentType: "video/mp4",
          cacheControl: "3600",
          upsert: true,
        });

      if (error) return { success: false, error: error.message };

      const { data: { publicUrl } } = supabase.storage
        .from("lead-demos")
        .getPublicUrl(`demos/${uploadName}`);

      // Cleanup local file
      fs.unlinkSync(localPath);

      return { success: true, publicUrl, storagePath: data.path };
    }

    case "send_demo_outreach": {
      const {
        leadId,
        phone,
        email,
        ownerName,
        businessName,
        videoUrl,
        personalizedHook,
        tradeType,
        channel = "both",
      } = toolInput as {
        leadId: string;
        phone?: string;
        email?: string;
        ownerName?: string;
        businessName?: string;
        videoUrl: string;
        personalizedHook: string;
        tradeType: string;
        channel?: string;
      };

      const firstName = ownerName?.split(" ")[0] ?? "Hey";
      const smsMessage = `${firstName} — I made this for you: ${videoUrl}\n\nSee how TitanCrew's AI crew could run your ${tradeType} business on autopilot. Reply YES to talk — takes 5 min.`;

      const results: Record<string, unknown> = {};

      // SMS via Twilio
      if (phone && (channel === "sms_only" || channel === "both")) {
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_FROM_NUMBER;

        if (twilioAccountSid && twilioAuthToken && twilioFrom) {
          const formData = new URLSearchParams({
            To: phone,
            From: twilioFrom,
            Body: smsMessage,
          });

          const smsResp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
              },
              body: formData.toString(),
            }
          );
          const smsData = await smsResp.json();
          results.sms = { sent: smsResp.ok, sid: smsData.sid };

          // Log to comms_log
          await supabase.from("comms_log").insert({
            direction: "outbound",
            channel: "sms",
            to_address: phone,
            from_address: twilioFrom,
            body: smsMessage,
            status: smsResp.ok ? "sent" : "failed",
            external_id: smsData.sid,
            ai_generated: true,
          });
        }
      }

      // Email via SendGrid
      if (email && (channel === "email_only" || channel === "both")) {
        const sendgridKey = process.env.SENDGRID_API_KEY;
        if (sendgridKey) {
          const emailResp = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sendgridKey}`,
            },
            body: JSON.stringify({
              to: [{ email, name: ownerName }],
              from: { email: "crew@titancrew.ai", name: "TitanCrew" },
              subject: `${firstName}, I made a 30-sec demo for ${businessName ?? "your business"}`,
              html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #1A2744; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: #FF6B00; margin: 0; font-size: 24px;">TitanCrew</h1>
                    <p style="color: #9FADC9; margin: 8px 0 0; font-size: 14px;">Your AI Business Crew</p>
                  </div>
                  <div style="background: #fff; padding: 32px; border: 1px solid #E2E8F0; border-radius: 0 0 12px 12px;">
                    <p style="font-size: 16px; color: #1A2744;">Hey ${firstName},</p>
                    <p style="color: #374151;">${personalizedHook}</p>
                    <p style="color: #374151;">I made a quick 30-second video showing exactly how TitanCrew's AI crew would handle this for <strong>${businessName ?? `your ${tradeType} business`}</strong>:</p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${videoUrl}" style="display: inline-block; background: #FF6B00; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;">▶ Watch Your Personalized Demo</a>
                    </div>
                    <p style="color: #6B7280; font-size: 14px;">Takes 30 seconds. No signup required.</p>
                    <p style="color: #374151;">If it resonates, just reply to this email and we'll set up a 5-minute live look at your actual TitanCrew.</p>
                    <p style="color: #374151; margin-top: 32px;">— The TitanCrew Team</p>
                  </div>
                </div>
              `,
            }),
          });
          results.email = { sent: emailResp.ok, status: emailResp.status };
        }
      }

      // Update lead status
      await supabase.from("meta_leads")
        .update({ status: "demo_sent", demo_sent_at: new Date().toISOString() })
        .eq("id", leadId);

      return { success: true, leadId, results };
    }

    case "update_lead_status": {
      const { leadId, status, videoUrl, sentAt } = toolInput as {
        leadId: string;
        status: string;
        videoUrl?: string;
        sentAt?: string;
      };

      const updates: Record<string, unknown> = { status };
      if (videoUrl) updates.demo_video_url = videoUrl;
      if (sentAt) updates.demo_sent_at = sentAt;

      const { error } = await supabase
        .from("meta_leads")
        .update(updates)
        .eq("id", leadId);

      return { success: !error, error: error?.message };
    }

    case "create_fallback_demo_link": {
      const { leadId, tradeType, primaryPainPoint, ownerName } = toolInput as {
        leadId: string;
        tradeType: string;
        primaryPainPoint: string;
        ownerName?: string;
      };

      // Generate a Typeform-style personalized link or use a Loom template
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.titancrew.ai";
      const params = new URLSearchParams({
        lead: leadId,
        trade: tradeType,
        pain: primaryPainPoint.replace(/\s+/g, "_").toLowerCase(),
        ...(ownerName ? { name: ownerName.split(" ")[0] } : {}),
      });

      const demoUrl = `${baseUrl}/demo?${params.toString()}`;
      return { success: true, demoUrl, type: "interactive_text_demo" };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── Main Agent Loop ──────────────────────────────────────

export async function runDemoCreatorAgent(request: DemoRequest): Promise<{
  success: boolean;
  videoUrl?: string;
  sentChannels: string[];
}> {
  const systemPrompt = `You are DemoCreatorAgent — the video personalization engine for TitanCrew's autonomous sales pipeline.

YOUR MISSION: Create a highly personalized 30-second demo video for a trade contractor lead and send it to them. The video must feel like it was made specifically for their business — not a generic sales pitch.

LEAD INFO:
- Business: ${request.businessName ?? "unknown"}
- Owner: ${request.ownerName ?? "unknown"}
- Trade: ${request.tradeType}
- Pain Points: ${request.painPoints.join(", ")}
- Hook: ${request.personalizedHook}
- Phone: ${request.phone ?? "not available"}
- Email: ${request.email ?? "not available"}

PROCESS:
1. Generate a personalized video script (hook → pain → solution → CTA)
2. Generate voiceover audio via ElevenLabs
3. Generate visual clips via Runway ML
4. Assemble with FFmpeg (audio + video + branding)
5. Upload to Supabase Storage
6. Send via SMS and/or email (whichever contact info is available)
7. Update lead status in DB

FALLBACK: If video generation fails at any step, create a fallback interactive demo link and send that instead. Never fail silently — always send something.

OUTPUT DIRECTORY: /tmp/titancrew/demos/${request.leadId}/
Be methodical. Execute each step in order. Handle failures gracefully.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Create and send a personalized demo for lead ${request.leadId}. Trade: ${request.tradeType}. Primary pain: ${request.painPoints[0]}. ${request.phone ? `SMS to: ${request.phone}` : ""} ${request.email ? `Email to: ${request.email}` : ""}`,
    },
  ];

  let videoUrl: string | undefined;
  const sentChannels: string[] = [];

  for (let turn = 0; turn < 20; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

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

        // Track key outcomes
        if (block.name === "upload_video" && (result as Record<string, unknown>).success) {
          videoUrl = (result as { publicUrl: string }).publicUrl;
        }
        if (block.name === "send_demo_outreach") {
          const r = result as { results?: { sms?: { sent: boolean }; email?: { sent: boolean } } };
          if (r.results?.sms?.sent) sentChannels.push("sms");
          if (r.results?.email?.sent) sentChannels.push("email");
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return { success: sentChannels.length > 0, videoUrl, sentChannels };
}
