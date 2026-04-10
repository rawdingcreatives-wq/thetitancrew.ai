import { FileText, ExternalLink } from "lucide-react";

export function LegalDocumentPanel({ _accountId, accountCreatedAt, plan }: { _accountId?: string; accountCreatedAt: string; plan: string }) {
  const docs = [
    { title: "Terms of Service", url: "https://titancrew.ai/legal/terms", date: "Jan 1, 2026" },
    { title: "Privacy Policy", url: "https://titancrew.ai/legal/privacy", date: "Jan 1, 2026" },
    { title: "TCPA Compliance Policy", url: "https://titancrew.ai/legal/tcpa", date: "Jan 1, 2026" },
    { title: "Data Processing Agreement", url: "https://titancrew.ai/legal/dpa", date: "Jan 1, 2026" },
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-[#1A2744] mb-4 flex items-center gap-2">
        <FileText className="w-4 h-4 text-[#FF6B00]" /> Legal Documents
      </h3>
      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.title} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-[#1A2744]">{d.title}</p>
              <p className="text-xs text-slate-400">Effective {d.date}</p>
            </div>
            <a href={d.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#FF6B00] hover:text-orange-600 font-medium transition-colors">
              View <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Account created: {new Date(accountCreatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Plan: <span className="capitalize font-medium">{plan}</span>
      </p>
    </div>
  );
}
