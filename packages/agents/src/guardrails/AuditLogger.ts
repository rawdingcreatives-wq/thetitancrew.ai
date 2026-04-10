/**
 * TradeBrain · AuditLogger
 * Immutable append-only log of every agent action.
 * Written to Supabase audit_log table (INSERT-only via RLS).
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/types/database.types";
import { createLogger } from "./logger";

const logger = createLogger("AuditLogger");

export interface AuditEntry {
  accountId?: string;
  agentRunId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  private supabase: ReturnType<typeof createClient<Database>>;

  constructor(supabase: ReturnType<typeof createClient<Database>>) {
    this.supabase = supabase;
  }

  async log(entry: AuditEntry): Promise<void> {
    try {
      await (this.supabase.from("audit_log") as any).insert({
        account_id: entry.accountId,
        agent_run_id: entry.agentRunId,
        user_id: entry.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        before_state: entry.beforeState,
        after_state: entry.afterState,
        metadata: entry.metadata,
      });
    } catch (err) {
      // Audit failures must never crash the agent — log to logger instead
      logger.error({ error: err, entry }, "Failed to write audit log");
    }
  }

  async logBatch(entries: AuditEntry[]): Promise<void> {
    try {
      await (this.supabase.from("audit_log") as any).insert(
        entries.map((e) => ({
          account_id: e.accountId,
          agent_run_id: e.agentRunId,
          action: e.action,
          entity_type: e.entityType,
          entity_id: e.entityId,
          before_state: e.beforeState,
          after_state: e.afterState,
          metadata: e.metadata,
        }))
      );
    } catch (err) {
      logger.error({ error: err }, "Batch write failed");
    }
  }
}
