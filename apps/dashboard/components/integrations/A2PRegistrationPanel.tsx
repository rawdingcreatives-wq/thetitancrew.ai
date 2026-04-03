// @ts-nocheck
/**
 * TitanCrew · A2PRegistrationPanel
 * Twilio A2P 10DLC SMS registration status and setup guide.
 */
"use client";

import { useState } from "react";
import { Phone, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface A2PRegistrationPanelProps {
  accountId: string;
  isRegistered: boolean;
  phoneNumber?: string;
  tradeType?: string;
}

const TRADE_DESCRIPTIONS: Record<string, string> = {
  plumbing: "Plumbing service appointment reminders and follow-ups",
  electrical: "Electrical contractor scheduling and job status updates",
  hvac: "HVAC service notifications and maintenance reminders",
  roofing: "Roofing project updates and estimate follow-ups",
  general: "General contractor job coordination and customer updates",
};

export function A2PRegistrationPanel({
  accountId, isRegistered, phoneNumber, tradeType,
}: A2PRegistrationPanelProps) {
  const [expanded, setExpanded] = useState(!isRegistered);

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        isRegistered ? "border-emerald-200 bg-white" : "border-amber-200 bg-amber-50"
      }`}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isRegistered ? "bg-emerald-50 border border-emerald-200" : "bg-amber-100 border border-amber-200"
          }`}>
            <Phone className={`w-6 h-6 ${isRegistered ? "text-emerald-600" : "text-amber-600"}`} />
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-[#1A2744]">Twilio SMS — A2P 10DLC</h3>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isRegistered
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}>
                {isRegistered
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Registered</>
                  : <><AlertCircle className="w-3.5 h-3.5" /> Registration required</>
                }
              </div>
            </div>

            <p className="text-sm text-slate-500 mt-1">
              {isRegistered
                ? `SMS campaign registered. Your crew can send texts to customers.${phoneNumber ? ` Number: ${phoneNumber}` : ""}`
                : "A2P 10DLC registration is required by US carriers to send business SMS. Without it, messages will be blocked."}
            </p>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide details</> : <><ChevronDown className="w-3.5 h-3.5" /> {isRegistered ? "View details" : "How to register"}</>}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-200 px-5 py-4 bg-white space-y-4">
          {isRegistered ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#1A2744]">Registration details</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Phone number</p>
                  <p className="font-medium text-[#1A2744]">{phoneNumber ?? "Configured"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Campaign type</p>
                  <p className="font-medium text-[#1A2744]">Mixed — appointment + follow-up</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <p className="font-medium text-emerald-600">Active ✓</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Monthly limit</p>
                  <p className="font-medium text-[#1A2744]">Unlimited</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                A2P 10DLC registration takes ~2–3 business days. TitanCrew handles the paperwork for you.
              </p>

              <div className="space-y-2">
                {[
                  { step: "1", label: "TitanCrew submits your brand registration to The Campaign Registry" },
                  { step: "2", label: "Campaign verified: appointment reminders + follow-ups" },
                  { step: "3", label: "Carrier approval issued (2–3 business days)" },
                  { step: "4", label: "Your Twilio number is provisioned and activated" },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#FF6B00] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {s.step}
                    </div>
                    <p className="text-sm text-slate-600">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={`/api/integrations/twilio/start-a2p?accountId=${accountId}`}
                  className="flex items-center gap-2 text-sm font-semibold text-white bg-[#FF6B00] hover:bg-orange-600 px-4 py-2.5 rounded-xl transition-colors"
                >
                  Start A2P Registration →
                </a>
                <a
                  href="https://docs.titancrew.ai/integrations/twilio-a2p"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Learn more <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
