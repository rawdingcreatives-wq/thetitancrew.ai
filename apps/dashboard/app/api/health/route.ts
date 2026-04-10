/**
 * TitanCrew · Health & Readiness Endpoint
 *
 * GET /api/health          → liveness (always 200 if process is up)
 * GET /api/health?deep=1   → readiness (checks Supabase, env, kill switches)
 *
 * Use the shallow check for load balancer probes.
 * Use the deep check for deployment verification and monitoring dashboards.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKillSwitchStatus } from "@/lib/kill-switches";
import { createLogger, generateRequestId } from "@/lib/logger";

const log = createLogger("health");

interface CheckResult {
  status: "ok" | "degraded" | "down";
  message?: string;
  latencyMs?: number;
}

/** Required env vars for the system to function. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

/** Optional but important env vars — system is degraded without them. */
const OPTIONAL_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "SENDGRID_API_KEY",
] as const;

async function checkSupabase(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { status: "down", message: "Missing Supabase credentials" };
  }
  const start = Date.now();
  try {
    const supabase = createClient(url, key);
    const { error } = await supabase.from("accounts").select("id").limit(1);
    const latencyMs = Date.now() - start;
    if (error) {
      return { status: "degraded", message: `Query error: ${error.message}`, latencyMs };
    }
    return { status: "ok", latencyMs };
  } catch (err) {
    return {
      status: "down",
      message: err instanceof Error ? err.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}

function checkEnv(): { required: CheckResult; optional: CheckResult; missing: string[] } {
  const missingRequired = REQUIRED_ENV.filter((k) => !process.env[k]);
  const missingOptional = OPTIONAL_ENV.filter((k) => !process.env[k]);

  return {
    required: missingRequired.length === 0
      ? { status: "ok" }
      : { status: "down", message: `Missing: ${missingRequired.join(", ")}` },
    optional: missingOptional.length === 0
      ? { status: "ok" }
      : { status: "degraded", message: `Missing: ${missingOptional.join(", ")}` },
    missing: [...missingRequired, ...missingOptional],
  };
}

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get("deep") === "1";

  // Shallow liveness — always 200 if the process is up
  if (!deep) {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    });
  }

  // Deep readiness check
  const [supabase, env] = await Promise.all([checkSupabase(), Promise.resolve(checkEnv())]);

  const killSwitches = getKillSwitchStatus();
  const activeKillSwitches = Object.entries(killSwitches)
    .filter(([, active]) => active)
    .map(([name]) => name);

  // Overall status: worst of all checks
  let overall: "ok" | "degraded" | "down" = "ok";
  if (supabase.status === "down" || env.required.status === "down") {
    overall = "down";
  } else if (
    supabase.status === "degraded" ||
    env.optional.status === "degraded" ||
    activeKillSwitches.length > 0
  ) {
    overall = "degraded";
  }

  const result = {
    status: overall,
    timestamp: new Date().toISOString(),
    requestId,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks: {
      supabase,
      envRequired: env.required,
      envOptional: env.optional,
    },
    killSwitches: {
      active: activeKillSwitches,
      all: killSwitches,
    },
  };

  log.info(
    { event: "readiness_check", requestId, overallStatus: overall },
    `Deep health check: ${overall} (supabase=${supabase.status}, env=${env.required.status})`
  );

  const httpStatus = overall === "down" ? 503 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
