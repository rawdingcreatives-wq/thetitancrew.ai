import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format currency: 1500 → "$1,500" */
export function formatCurrency(amount: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** Format large numbers: 12345 → "12.3k" */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/** Relative time: "2 minutes ago", "3 hours ago" */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Map job status to Tailwind color classes */
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    lead: "bg-gray-100 text-gray-700",
    quoted: "bg-blue-100 text-blue-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    invoiced: "bg-purple-100 text-purple-700",
    paid: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

/** Map agent name to display label */
export function agentLabel(agentType: string): string {
  const map: Record<string, string> = {
    scheduler: "Scheduler",
    parts_inventory: "Parts & Inventory",
    customer_comm: "Customer Comms",
    finance_invoice: "Finance & Invoicing",
    foreman_predictor: "Foreman AI",
    tech_dispatch: "Tech Dispatch",
    lead_hunter: "Lead Hunter",
    demo_creator: "Demo Creator",
    onboarder: "Onboarder",
    performance_optimizer: "Performance Optimizer",
    billing_churn_preventer: "Billing & Retention",
  };
  return map[agentType] ?? agentType.replace(/_/g, " ");
}

/** Truncate string: "This is a long…" */
export function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/** Generate a color dot class for agent run status */
export function runStatusDot(status: string): string {
  const map: Record<string, string> = {
    running: "bg-yellow-400 animate-agent-pulse",
    completed: "bg-green-400",
    failed: "bg-red-400",
    pending: "bg-gray-300",
  };
  return map[status] ?? "bg-gray-300";
}
