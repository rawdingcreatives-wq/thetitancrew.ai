import { Activity, Bot, Tag, Building2 } from "lucide-react";

interface AuditLogSummaryProps {
  totalActions: number;
  uniqueAgents: number;
  eventCategories: string[];
  accountName: string;
}

export function AuditLogSummary({ totalActions, uniqueAgents, eventCategories, accountName }: AuditLogSummaryProps) {
  const stats = [
    { icon: Activity, label: "Total Actions", value: totalActions.toLocaleString(), color: "text-[#FF6B00]" },
    { icon: Bot, label: "Active Agents", value: uniqueAgents.toString(), color: "text-blue-600" },
    { icon: Tag, label: "Event Types", value: eventCategories.length.toString(), color: "text-purple-600" },
    { icon: Building2, label: "Business", value: accountName, color: "text-emerald-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s) => { const Icon = s.icon; return (
        <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
            <Icon className={`w-5 h-5 ${s.color}`} />
          </div>
          <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-sm font-bold text-[#1A2744] truncate max-w-[110px]">{s.value}</p></div>
        </div>
      ); })}
    </div>
  );
}
