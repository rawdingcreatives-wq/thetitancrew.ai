/**
 * /receipts — Receipt Management Dashboard
 *
 * Server component that displays uploaded receipts with parsing status,
 * links to jobs, and disposition tracking. Mobile-first PWA design
 * optimized for gloved use in the field.
 */
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ReceiptUpload } from "@/components/receipts/ReceiptUpload";
import { ReceiptList } from "@/components/receipts/ReceiptList";

interface Account {
  id: string;
  business_name: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
}

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  // Fetch account
  const { data: account } = await service
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single() as { data: Account | null; error: any };

  if (!account) redirect("/onboarding");

  // Fetch receipts with line items
  const { data: receipts } = await (service as any)
    .from("receipts")
    .select(`
      id, status, vendor_name, receipt_date, total_amount,
      original_filename, parse_confidence, job_id, created_at,
      receipt_line_items(id, description, quantity, unit_price, line_total, disposition, disposed_quantity)
    `)
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch active jobs for the job picker
  const { data: activeJobs } = await (service as any)
    .from("jobs")
    .select("id, title, status")
    .eq("account_id", account.id)
    .in("status", ["scheduled", "dispatched", "in_progress", "completed"])
    .order("scheduled_start", { ascending: false })
    .limit(50);

  // Stats
  const receiptList = receipts ?? [];
  const totalReceipts = receiptList.length;
  const pendingParse = receiptList.filter((r: any) => r.status === "uploaded").length;
  const parsedReady = receiptList.filter((r: any) => r.status === "parsed").length;
  const disposed = receiptList.filter((r: any) => r.status === "disposed").length;
  const totalSpend = receiptList.reduce(
    (sum: number, r: any) => sum + (r.total_amount || 0),
    0
  );

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2744]">Receipts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload, parse, and track materials from the field
          </p>
        </div>
        <ReceiptUpload
          accountId={account.id}
          jobs={(activeJobs as Job[]) ?? []}
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Receipts" value={totalReceipts} />
        <StatCard label="Pending Parse" value={pendingParse} accent />
        <StatCard label="Ready to Dispose" value={parsedReady} />
        <StatCard
          label="Total Spend"
          value={`$${totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
        />
      </div>

      {/* Receipt List */}
      <ReceiptList
        receipts={receiptList}
        jobs={(activeJobs as Job[]) ?? []}
        accountId={account.id}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-xl font-bold mt-1 ${
          accent ? "text-[#FF6B00]" : "text-[#1A2744]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
