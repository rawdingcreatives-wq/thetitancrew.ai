/**
 * TradeBrain · AgentMemory
 * Shared vector memory layer backed by Supabase pgvector.
 * Agents read/write memories so the crew accumulates domain knowledge over time.
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../../shared/types/database.types";
import { createLogger } from "../guardrails/logger";

const logger = createLogger("AgentMemory");

export type MemoryType =
  | "customer_pref"
  | "job_pattern"
  | "pricing"
  | "objection"
  | "win_pattern"
  | "supplier_intel"
  | "scheduling_pattern"
  | "comm_preference"
  | "churn_signal";

export interface MemoryEntry {
  id: string;
  memoryType: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  similarity?: number;
}

export interface MemorySearchOptions {
  memoryType?: MemoryType;
  limit?: number;
  minSimilarity?: number;
  includeGlobal?: boolean; // include platform-wide memories (account_id IS NULL)
}

export class AgentMemory {
  private supabase: ReturnType<typeof createClient<Database>>;
  private accountId: string;
  private embedClient: Anthropic;

  constructor(
    supabase: ReturnType<typeof createClient<Database>>,
    accountId: string
  ) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.embedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }

  /**
   * Store a memory with auto-generated embedding.
   * Agents call this after learning something worth remembering.
   */
  async store(
    content: string,
    memoryType: MemoryType,
    metadata: Record<string, unknown> = {},
    sourceAgent?: string
  ): Promise<string> {
    const embedding = await this.embed(content);

    const { data, error } = await (this.supabase
      .from("agent_memory") as any)
      .insert({
        account_id: this.accountId,
        memory_type: memoryType,
        source_agent: sourceAgent as never,
        content,
        metadata: metadata as never,
        embedding: embedding as never,
        relevance_score: 1.0,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Memory store failed: ${error.message}`);
    return data!.id;
  }

  /**
   * Semantic search over memories relevant to a query.
   * Returns top-k most relevant memories ordered by cosine similarity.
   */
  async search(
    query: string,
    options: MemorySearchOptions = {}
  ): Promise<MemoryEntry[]> {
    const {
      memoryType,
      limit = 8,
      minSimilarity = 0.70,
      includeGlobal = true,
    } = options;

    const queryEmbedding = await this.embed(query);

    // Use the RPC function defined in the schema
    const { data, error } = await (this.supabase.rpc as any)("search_agent_memory", {
      p_account_id: this.accountId,
      p_query_embedding: queryEmbedding,
      p_memory_type: memoryType ?? null,
      p_limit: limit,
    });

    if (error) {
      logger.error({ error }, "Search failed");
      return [];
    }

    return ((data as any) ?? [])
      .filter((m: any) => m.similarity >= minSimilarity)
      .map((m: any) => ({
        id: m.id,
        memoryType: memoryType ?? "job_pattern",
        content: m.content,
        metadata: m.metadata ?? {},
        similarity: m.similarity,
      }));
  }

  /**
   * Format top memories for injection into an agent's context.
   * Returns a ready-to-use string block.
   */
  async getContextBlock(
    query: string,
    options: MemorySearchOptions = {}
  ): Promise<string> {
    const memories = await this.search(query, options);
    if (memories.length === 0) return "";

    const lines = memories.map(
      (m, i) =>
        `[Memory ${i + 1} | ${m.memoryType} | relevance: ${(m.similarity! * 100).toFixed(0)}%]\n${m.content}`
    );

    return `\n--- Relevant Agent Memories ---\n${lines.join("\n\n")}\n--- End Memories ---\n`;
  }

  /**
   * Update relevance score (decay unused memories over time).
   */
  async updateRelevance(memoryId: string, score: number): Promise<void> {
    await (this.supabase
      .from("agent_memory") as any)
      .update({
        relevance_score: score,
        last_accessed: new Date().toISOString(),
        access_count: 1,
      })
      .eq("id", memoryId);
  }

  /**
   * Delete a specific memory (e.g., if it becomes outdated).
   */
  async delete(memoryId: string): Promise<void> {
    await (this.supabase.from("agent_memory") as any).delete().eq("id", memoryId);
  }

  /**
   * Embed text using OpenAI-compatible embedding via Anthropic or a local model.
   * For production: use text-embedding-3-small via OpenAI (cheapest, best pgvector perf).
   * Fallback: use a simple hash-based mock for testing.
   */
  private async embed(text: string): Promise<number[]> {
    // Production: use OpenAI embeddings (1536-dim, pgvector optimized)
    // For now — stub that works with the schema dimensions
    // Replace with: OpenAI('text-embedding-3-small') when openai package is added
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (openaiApiKey) {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
        }),
      });
      const json = (await resp.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0].embedding;
    }

    // Dev fallback: deterministic pseudo-embedding (NOT for production)
    logger.warn({}, "No OPENAI_API_KEY — using mock embeddings (dev only)");
    return this.mockEmbed(text);
  }

  private mockEmbed(text: string): number[] {
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < text.length; i++) {
      embedding[i % 1536] += text.charCodeAt(i) / 1000;
    }
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map((v) => v / (norm || 1));
  }
}
