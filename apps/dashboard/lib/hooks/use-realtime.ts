// @ts-nocheck
"use client";

/**
 * TitanCrew · Supabase Realtime Hooks
 *
 * Custom hooks for real-time subscriptions to Supabase tables.
 * Used across the dashboard for live KPIs, agent status, job updates.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

// useRealtimeQuery - Subscribe to any table and get live updates

interface RealtimeQueryOptions {
  select?: string;
  filter?: { column: string; value: string | number };
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export function useRealtimeQuery<T = any>(table: string, options: RealtimeQueryOptions = {}) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const fetchData = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    let query = supabase.from(table).select(options.select ?? "*");
    if (options.filter) query = query.eq(options.filter.column, options.filter.value);
    if (options.orderBy) query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? false });
    if (options.limit) query = query.limit(options.limit);

    const { data: result, error: queryError } = await query;
    if (queryError) { setError(queryError.message); }
    else { setData((result ?? []) as T[]); setError(null); }
    setLoading(false);
  }, [table, options.select, options.filter?.column, options.filter?.value, options.orderBy?.column, options.limit]);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    fetchData();

    const channelName = "realtime:" + table + ":" + (options.filter?.column ?? "all") + ":" + (options.filter?.value ?? "all");
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*", schema: "public", table,
        ...(options.filter ? { filter: options.filter.column + "=eq." + options.filter.value } : {}),
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// useRealtimeKPIs - Real-time dashboard KPIs for a specific account

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

  const fetchKpis = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    const [jobsRes, agentsRes, approvalsRes, customersRes] = await Promise.all([
      supabase.from("jobs").select("id, status, amount").eq("account_id", accountId),
      supabase.from("account_agents").select("agent_type").eq("account_id", accountId).eq("enabled", true),
      supabase.from("hil_queue").select("id").eq("account_id", accountId).eq("status", "pending"),
      supabase.from("customers").select("id").eq("account_id", accountId),
    ]);

    const jobs = jobsRes.data ?? [];
    const completed = jobs.filter((j) => j.status === "completed");
    const pending = jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress");
    const revenue = completed.reduce((sum, j) => sum + (j.amount ?? 0), 0);

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
  }, [accountId]);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    fetchKpis();

    const tables = ["jobs", "account_agents", "hil_queue", "customers"];
    const channels = tables.map((t) =>
      supabase.channel("kpis:" + t + ":" + accountId)
        .on("postgres_changes", { event: "*", schema: "public", table: t, filter: "account_id=eq." + accountId }, () => fetchKpis())
        .subscribe()
    );
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)); };
  }, [accountId, fetchKpis]);

  return { kpis, loading, refetch: fetchKpis };
}

// useRealtimeAdminKPIs - Global admin dashboard KPIs

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
      supabase.from("accounts").select("id, subscription_status, mrr, plan"),
      supabase.from("hil_queue").select("id").eq("status", "pending"),
    ]);

    const accounts = accountsRes.data ?? [];
    const active = accounts.filter((a) => a.subscription_status === "active");
    const trialing = accounts.filter((a) => a.subscription_status === "trialing");
    const pastDue = accounts.filter((a) => a.subscription_status === "past_due");
    const mrr = accounts.reduce((sum, a) => sum + (a.mrr ?? 0), 0);

    setKpis({
      totalAccounts: accounts.length,
      activeAccounts: active.length,
      totalMRR: mrr,
      trialingAccounts: trialing.length,
      pastDueAccounts: pastDue.length,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "hil_queue" }, () => fetchKpis())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchKpis]);

  return { kpis, loading, refetch: fetchKpis };
}
