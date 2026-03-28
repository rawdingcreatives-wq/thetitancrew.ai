/**
 * TitanCrew · Jobs Pipeline Page
 * Kanban-style job board across all statuses.
 * Server-rendered with real-time refresh capability.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { JobKanban } from "@/components/jobs/JobKanban";
import { JobsHeader } from "@/components/jobs/JobsHeader";

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/login");

  const { data: jobs } = await supabase
    .from("jobs")
    .select(`
      id, title, status, priority, scheduled_start, scheduled_end,
      estimate_amount, invoice_amount, paid_amount, booked_by_ai, source,
      job_type, address, created_at,
      trade_customers(id, name, phone),
      technicians(id, name)
    `)
    .eq("account_id", account.id)
    .not("status", "in", '("paid","canceled")')
    .order("priority", { ascending: true })
    .order("scheduled_start", { ascending: true })
    .limit(200);

  const { data: techs } = await supabase
    .from("technicians")
    .select("id, name")
    .eq("account_id", account.id)
    .eq("is_active", true);

  return (
    <div className="flex flex-col h-full">
      <JobsHeader
        accountId={account.id}
        technicians={techs ?? []}
      />
      <div className="flex-1 overflow-x-auto p-4 lg:p-6">
        <JobKanban jobs={jobs ?? []} accountId={account.id} />
      </div>
    </div>
  );
}
