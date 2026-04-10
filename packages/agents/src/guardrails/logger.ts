/**
 * TitanCrew · Agent-side Structured Logger
 *
 * Mirrors the dashboard logger contract: JSON in production, readable in dev.
 * Kept in the agents package so agent-side code has zero dependency on the dashboard.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  service: string;
  event?: string;
  accountId?: string;
  agentType?: string;
  runId?: string;
  jobId?: string;
  integration?: string;
  confirmationId?: string;
  twilioMessageSid?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? "info"];
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function emit(level: LogLevel, ctx: LogContext, message: string, error?: unknown): void {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;

  if (IS_PRODUCTION) {
    const entry: Record<string, unknown> = { timestamp: new Date().toISOString(), level, message, ...ctx };
    if (error instanceof Error) {
      entry.error = { name: error.name, message: error.message, stack: error.stack };
    } else if (error !== undefined) {
      entry.error = String(error);
    }
    const line = JSON.stringify(entry);
    level === "error" ? console.error(line) : level === "warn" ? console.warn(line) : console.log(line);
  } else {
    const ts = new Date().toISOString().slice(11, 23);
    const ids = [
      ctx.accountId && `acct=${ctx.accountId}`,
      ctx.agentType && `agent=${ctx.agentType}`,
      ctx.confirmationId && `hil=${ctx.confirmationId}`,
    ].filter(Boolean).join(" ");
    const prefix = `[${ts}] [${level.toUpperCase()}] [${ctx.service}${ctx.event ? `:${ctx.event}` : ""}]`;
    const idStr = ids ? ` (${ids})` : "";
    const errStr = error instanceof Error ? `\n  Error: ${error.message}\n  ${error.stack}` : "";
    const line = `${prefix}${idStr} ${message}${errStr}`;
    level === "error" ? console.error(line) : level === "warn" ? console.warn(line) : console.log(line);
  }
}

export function createLogger(service: string) {
  return {
    debug: (ctx: Omit<LogContext, "service">, msg: string, err?: unknown) => emit("debug", { ...ctx, service }, msg, err),
    info:  (ctx: Omit<LogContext, "service">, msg: string, err?: unknown) => emit("info",  { ...ctx, service }, msg, err),
    warn:  (ctx: Omit<LogContext, "service">, msg: string, err?: unknown) => emit("warn",  { ...ctx, service }, msg, err),
    error: (ctx: Omit<LogContext, "service">, msg: string, err?: unknown) => emit("error", { ...ctx, service }, msg, err),
  };
}
