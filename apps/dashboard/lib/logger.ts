/**
 * TitanCrew · Structured Logger
 *
 * Lightweight operational logger for API routes and server-side code.
 * JSON in production, human-readable in development.
 * Every log includes service context and optional correlation IDs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  service: string;
  event?: string;
  requestId?: string;
  accountId?: string;
  agentType?: string;
  runId?: string;
  jobId?: string;
  integration?: string;
  confirmationId?: string;
  stripeEventType?: string;
  twilioMessageSid?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? "info"];
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= MIN_LEVEL;
}

function formatDev(level: LogLevel, ctx: LogContext, message: string, error?: unknown): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const ids = [
    ctx.requestId && `req=${ctx.requestId}`,
    ctx.accountId && `acct=${ctx.accountId}`,
    ctx.agentType && `agent=${ctx.agentType}`,
    ctx.runId && `run=${ctx.runId}`,
    ctx.stripeEventType && `stripe=${ctx.stripeEventType}`,
    ctx.twilioMessageSid && `twilio=${ctx.twilioMessageSid}`,
  ]
    .filter(Boolean)
    .join(" ");

  const prefix = `[${ts}] [${level.toUpperCase()}] [${ctx.service}:${ctx.event}]`;
  const idStr = ids ? ` (${ids})` : "";
  const errStr = error instanceof Error ? `\n  Error: ${error.message}\n  ${error.stack}` : "";
  return `${prefix}${idStr} ${message}${errStr}`;
}

function formatJson(level: LogLevel, ctx: LogContext, message: string, error?: unknown): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...ctx,
  };
  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else if (error !== undefined) {
    entry.error = String(error);
  }
  return JSON.stringify(entry);
}

function emit(level: LogLevel, ctx: LogContext, message: string, error?: unknown): void {
  if (!shouldLog(level)) return;

  const line = IS_PRODUCTION
    ? formatJson(level, ctx, message, error)
    : formatDev(level, ctx, message, error);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

/**
 * Create a scoped logger for a specific service.
 *
 * Usage:
 *   const log = createLogger("twilio-webhook");
 *   log.info({ event: "sms_received", twilioMessageSid: sid }, "Inbound SMS");
 *   log.error({ event: "db_write_failed", accountId }, "Failed to save", error);
 */
export function createLogger(service: string) {
  return {
    debug: (ctx: Omit<LogContext, "service">, message: string, error?: unknown) =>
      emit("debug", { ...ctx, service }, message, error),
    info: (ctx: Omit<LogContext, "service">, message: string, error?: unknown) =>
      emit("info", { ...ctx, service }, message, error),
    warn: (ctx: Omit<LogContext, "service">, message: string, error?: unknown) =>
      emit("warn", { ...ctx, service }, message, error),
    error: (ctx: Omit<LogContext, "service">, message: string, error?: unknown) =>
      emit("error", { ...ctx, service }, message, error),
  };
}

/**
 * Generate a short request correlation ID.
 * Format: "req_<8 hex chars>" — short enough for logs, unique enough for tracing.
 */
export function generateRequestId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return "req_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
