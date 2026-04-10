import { Clock, Phone } from "lucide-react";

export function TCPAConsentTable({ _accountId }: { _accountId: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-[#1A2744] mb-1 flex items-center gap-2">
        <Phone className="w-4 h-4 text-[#FF6B00]" /> TCPA Consent Log
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Every customer who receives SMS from TitanCrew must provide documented TCPA consent. Records appear here as jobs are created.
      </p>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Customer</span><span>Phone</span><span>Consent Date</span><span>Status</span>
        </div>
        <div className="px-4 py-10 text-center">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No consent records yet.</p>
          <p className="text-xs text-slate-300 mt-1">Records appear when customers are booked via SMS.</p>
        </div>
      </div>
    </div>
  );
}
