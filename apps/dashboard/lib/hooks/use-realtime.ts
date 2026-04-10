"use client";

/**
 * TitanCrew · Supabase Realtime Hooks
 *
 * Custom hooks for real-time subscriptions to Supabase tables.
 * Table names match Phase 0 schema:
 *   - agent_instances (not account_agents)
 *   - hil_confirmations (not hil_queue)
 *   - trade_customers (not customers)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

// ─── useRealtimeQuery ────────────────────────────────────────

interface RealtimeQueryOptions {
  select?: string;
  filter?: { column: string; value: string | number };
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export function useRealtimeQuery<T = unknown>(
  table: string,
  options: RealtimeQueryOptions = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const filterColumnRef = useRef(options.filter?.column);
  const filterValueRef = useRef(options.filter?.value);
  const orderByColumnRef = useRef(options.orderBy?.column);
  const selectRef = useRef(options.select);
  const limitRef = useRef(options.limit);

  const fetchData = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    let query = supabase.from(table).select(selectRef.current ?? "*");
    if (filterColumnRef.current && filterValueRef.current !== undefined) {
      query = query.eq(filterColumnRef.current, filterValueRef.current);
    }
    if (orderByColumnRef.current) {
      query = query.order(orderByColumnRef.current, { ascending: options.orderBy?.ascending ?? false });
    }
    if (limitRef.current) query = query.limit(limitRef.current);

    const { data: result, error: queryError } = await query;
    if (queryError) setError(queryError.message);
    else { setData((result ?? []) as T[]); setError(null); }
    setLoading(false);
  }, [table, options.orderBy?.ascending]);

  useEffect(() => {
    filterColumnRef.current = options.filter?.column;
    filterValueRef.current = options.filter?.value;
    orderByColumnRef.current = options.orderBy?.column;
    selectRef.current = options.select;
    limitRef.current = options.limit;
  }, [options.filter?.column, options.filter?.value, options.orderBy?.column, options.select, options.limit]);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    fetchData();

    const channelName = `realtime:${table}:${filterColumnRef.current ?? "all"}:${filterValueRef.current ?? "all"}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        ...(filterColumnRef.current && filterValueRef.current !== undefined ? { filter: `${filterColumnRef.current}=eq.${filterValueRef.current}` } : {}),
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ─── useRealtimeKPIs ─────────────────────────────────────────

interface AccountKPIs {
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  totalRevenue: number;
  avgJobValue: number;
  activeAgents: number;
  pendingApprovals: number;
  customerCount: number;
}

export function useRealtimeKPIs(accountId: string) {
  const [kpis, setKpis] = useState<AccountKPIs>({
    totalJobs: 0, completedJobs: 0, pendingJobs: 0, totalRevenue: 0,
    avgJobValue: 0, activeAgents: 0, pendingApprovals: 0, customerCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const accountIdRef = useRef(accountId);

  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);

  const fetchKpis = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    const [jobsRes, agentsRes, approvalsRes, customersRes] = await Promise.all([
      supabase.from("jobs").select("id, status, invoice_amount").eq("account_id", accountIdRef.current) as unknown as Promise<{data: Array<{id: string; status: string; invoice_amount: number | null}> | null}>,
      supabase.from("agent_instances").select("agent_type").eq("account_id", accountIdRef.current).eq("is_enabled", true) as unknown as Promise<{data: Array<{agent_type: string}> | null}>,
      supabase.from("hil_confirmations").select("id").eq("account_id", accountIdRef.current).eq("status", "pending") as unknown as Promise<{data: Array<{id: string}> | null}>,
      supabase.from("trade_customers").select("id").eq("account_id", accountIdRef.current) as unknown as Promise<{data: Array<{id: string}> | null}>,
    ]);

    const jobs: Array<{ id: string; status: string; invoice_amount: number | null }> = jobsRes.data ?? [];
    const completed = jobs.filter((j) => j.status === "completed" || j.status === "invoiced" || j.status === "paid");
    const pending = jobs.filter((j) => j.status === "scheduled" || j.status === "dispatched" || j.status === "in_progress");
    const revenue = completed.reduce((sum, j) => sum + (j.invoice_amount ?? 0), 0);

    setKpis({
      totalJobs: jobs.length,
      completedJobs: completed.length,
      pendingJobs: pending.length,
      totalRevenue: revenue,
      avgJobValue: completed.length > 0 ? revenue / completed.length : 0,
      activeAgents: agentsRes.data?.length ?? 0,
      pendingApprovals: approvalsRes.data?.length ?? 0,
      customerCount: customersRes.data?.length ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    fetchKpis();

    const tables = ["jobs", "agent_instances", "hil_confirmations", "trade_customers"];
    const channels = tables.map((t) =>
      supabase.channel(`kpis:${t}:${accountIdRef.current}`)
        .on("postgres_changes", { event: "*", schema: "public", table: t, filter: `account_id=eq.${accountIdRef.current}` }, () => fetchKpis())
        .subscribe()
    );
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)); };
  }, [fetchKpis]);

  return { kpis, loading, refetch: fetchKpis };
}

// ─── useRealtimeAdminKPIs ────────────────────────────────────

interface AdminKPIs {
  totalAccounts: number;
  activeAccounts: number;
  totalMRR: number;
  trialingAccounts: number;
  pastDueAccounts: number;
  pendingApprovals: number;
}

export function useRealtimeAdminKPIs() {
  const [kpis, setKpis] = useState<AdminKPIs>({
    totalAccounts: 0, activeAccounts: 0, totalMRR: 0,
    trialingAccounts: 0, pastDueAccounts: 0, pendingApprovals: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const fetchKpis = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    const [accountsRes, approvalsRes] = await Promise.all([
      supabase.from("accounts").select("id, subscription_status, mrr, plan") as unknown as Promise<{data: Array<{id: string; subscription_status: string; mrr: number | null}> | null}>,
      supabase.from("hil_confirmations").select("id").eq("status", "pending") as unknown as Promise<{data: Array<{id: string}> | null}>,
    ]);

    const accounts: Array<{ id: string; subscription_status: string; mrr: number | null }> = accountsRes.data ?? [];
    setKpis({
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter((a) => a.subscription_status === "active").length,
      totalMRR: accounts.reduce((sum, a) => sum + (a.mrr ?? 0), 0),
      trialingAccounts: accounts.filter((a) => a.subscription_status === "trialing").length,
      pastDueAccounts: accounts.filter((a) => a.subscription_status === "past_due").length,
      pendingApprovals: approvalsRes.data?.length ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    fetchKpis();

    const channel = supabase.channel("admin-kpis")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, () => fetchKpis())
      .on("postgres_changes", { event: "*", schema: "public", table: "hil_confirmations" }, () => fetchKpis())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchKpis]);

  return { kpis, loading, refetch: fetchKpis };
}
