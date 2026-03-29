// @ts-nocheck
/**
 * TitanCrew — Audit Log CSV Export
 * GET /api/audit-log/export?accountId={id}&format=csv&from={date}&to={date}
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "csv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  let query = supabase
    .from("audit_log")
    .select("id, event_type, actor, details, created_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(10000); // Max export size

  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(to + "T23:59:59").toISOString());

  const { data: entries, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === "csv") {
    const headers = ["Timestamp", "Agent", "Action", "Details", "Entry ID"];
    const rows = (entries ?? []).map((entry) => [
      new Date(entry.created_at!).toISOString(),
      entry.actor ?? "",
      entry.event_type ?? "",
      JSON.stringify(entry.details ?? {}).replace(/"/g, '""'),
      entry.id,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const filename = `titancrew-audit-log-${account.business_name?.replace(/\s+/g, "-") ?? "export"}-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ entries });
}
