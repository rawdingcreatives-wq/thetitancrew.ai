/**
 * TitanCrew · Onboarding Progress Checklist
 * Fixed bottom-right widget visible on all dashboard pages until onboarding is complete.
 * Fetches live account state from Supabase; auto-hides when everything is done.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Item {
  id: string;
  label: string;
  done: boolean;
  href?: string;
}

export function OnboardingChecklist() {
  const [items, setItems]         = useState<Item[]>([]);
  const [open, setOpen]           = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow]           = useState(false);

  useEffect(() => {
    // Respect per-session dismissal stored in sessionStorage
    if (typeof window !== "undefined" && sessionStorage.getItem("tc_checklist_dismissed")) {
      setDismissed(true);
    }

    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: acc } = await (supabase.from("accounts") as any)
        .select(
          "crew_deployed_at, google_calendar_token, qbo_access_token, onboard_step"
        )
        .eq("owner_user_id", user.id)
        .single();

      if (!acc) return;

      const checklist: Item[] = [
        {
          id:    "calendar",
          label: "Connect Google Calendar",
          done:  !!acc.google_calendar_token,
          href:  "/integrations",
        },
        {
          id:    "qbo",
          label: "Connect QuickBooks",
          done:  !!acc.qbo_access_token,
          href:  "/integrations",
        },
        {
          id:    "deployed",
          label: "Deploy AI crew",
          done:  !!acc.crew_deployed_at,
          href:  acc.crew_deployed_at ? undefined : "/onboarding",
        },
        {
          id:    "team",
          label: "Invite team members",
          done:  false,
          href:  "/settings",
        },
        {
          id:    "video",
          label: "Watch 90-second intro",
          done:  false,
        },
      ];

      setItems(checklist);

      // Show only if something is still pending
      const allDone = checklist.every((i) => i.done);
      setShow(!allDone);
    }

    load();
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("tc_checklist_dismissed", "1");
    }
    setDismissed(true);
  };

  if (!show || dismissed) return null;

  const done  = items.filter((i) => i.done).length;
  const total = items.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="fixed bottom-5 right-5 z-40 w-72 select-none">
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background:    "#1A2744",
          border:        "1px solid rgba(255,255,255,0.1)",
          boxShadow:     "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,0,0.1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#FF6B00] rounded-md flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-white">Setup</span>
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(255,107,0,0.2)", color: "#FF9500" }}
            >
              {done}/{total}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setOpen((o) => !o)}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
              aria-label={open ? "Collapse" : "Expand"}
            >
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF9500] transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Items */}
        {open && (
          <ul className="px-3 py-2 space-y-0.5">
            {items.map((item) => {
              const inner = (
                <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                  {/* Checkbox */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={
                      item.done
                        ? {
                            background: "rgba(16,185,129,0.15)",
                            border: "1px solid rgba(16,185,129,0.4)",
                          }
                        : { border: "1px solid rgba(255,255,255,0.2)" }
                    }
                  >
                    {item.done && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>

                  {/* Label */}
                  <span
                    className={`text-xs flex-1 leading-snug ${
                      item.done
                        ? "text-slate-600 line-through"
                        : "text-slate-300"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.href && !item.done ? (
                    <Link href={item.href}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer CTA */}
        {open && done < total && (
          <div className="px-3 pb-3">
            <Link
              href="/onboarding"
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #FF6B00, #FF9500)",
                boxShadow:  "0 0 16px rgba(255,107,0,0.35)",
              }}
            >
              Continue Setup
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
