// @ts-nocheck
/**
 * TitanCrew Admin API — Overview Stats
 *
 * GET /api/admin — Returns platform-wide KPIs for the admin dashboard.
 * Requires admin_users membership.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify admin
    const { data: admin } = await (supabase.from("admin_users") as any)
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch stats in parallel
    const [
      totalAccounts,
      activeAccounts,
      trialAccounts,
      canceledAccounts,
      mrrData,
      agentsRunning,
      agentsError,
      openTickets,
      churnRisk,
    ] = await Promise.all([
      (supabase.from("accounts") as any).select("id", { count: "exact", head: true }),
      (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
      (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "trialing"),
      (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
      (supabase.from("accounts") as any).select("mrr"),
      (supabase.from("agent_instances") as any).select("id", { count: "exact", head: true }).eq("status", "running"),
      (supabase.from("agent_instances") as any).select("id", { count: "exact", head: true }).eq("status", "error"),
      (supabase.from("support_tickets") as any).select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      (supabase.from("accounts") as any).select("id", { count: "exact", head: true }).gte("churn_risk_score", 0.7),
    ]);

    const totalMRR = (mrrData.data ?? []).reduce((sum: number, a: any) => sum + (parseFloat(a.mrr) || 0), 0);

    return NextResponse.json({
      totalAccounts: totalAccounts.count ?? 0,
      activeAccounts: activeAccounts.count ?? 0,
      trialAccounts: trialAccounts.count ?? 0,
      canceledAccounts: canceledAccounts.count ?? 0,
      mrr: totalMRR,
      arr: totalMRR * 12,
      agentsRunning: agentsRunning.count ?? 0,
      agentsError: agentsError.count ?? 0,
      openTickets: openTickets.count ?? 0,
      churnRiskAccounts: churnRisk.count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
