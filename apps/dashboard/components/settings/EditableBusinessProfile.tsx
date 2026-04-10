"use client";

/**
 * TitanCrew · Editable Business Profile
 * Inline editing for Settings page business profile fields.
 * Click any field to edit. Saves on blur or Enter. Esc to cancel.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Building2, Pencil, Check, X, Loader2, ExternalLink } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccountData {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  phone: string | null;
  trade_type: string | null;
  created_at: string | null;
}

interface EditableBusinessProfileProps {
  account: AccountData;
  email: string;
  _tradeLabel: string;
}

/* ------------------------------------------------------------------ */
/*  Trade options for dropdown                                         */
/* ------------------------------------------------------------------ */

const TRADE_OPTIONS: { value: string; label: string }[] = [
  { value: "plumbing",     label: "Plumbing" },
  { value: "electrical",   label: "Electrical" },
  { value: "hvac",         label: "HVAC" },
  { value: "snow_plow",    label: "Snow Plow" },
  { value: "junk_removal", label: "Junk Removal" },
  { value: "general",      label: "General Contractor" },
  { value: "roofing",      label: "Roofing" },
  { value: "other",        label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Inline Editable Field                                              */
/* ------------------------------------------------------------------ */

function InlineField({
  label,
  value,
  field,
  onSave,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  field: string;
  onSave: (field: string, value: string) => Promise<boolean>;
  type?: "text" | "tel" | "select";
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = useCallback(async () => {
    if (draft === displayValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const success = await onSave(field, draft);
    setSaving(false);
    if (success) {
      setDisplayValue(draft);
      setEditing(false);
    }
  }, [draft, displayValue, field, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(displayValue);
    setEditing(false);
  }, [displayValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  if (readOnly) {
    return (
      <div>
        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
          {label}
        </label>
        <p className="text-sm font-semibold text-[#1A2744] mt-1">{value || "\u2014"}</p>
      </div>
    );
  }

  return (
    <div className="group">
      <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
        {label}
      </label>

      {editing ? (
        <div className="flex items-center gap-1.5 mt-1">
          {type === "select" ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // Small delay to allow button clicks
                setTimeout(() => {
                  if (editing) handleSave();
                }, 150);
              }}
              className="text-sm font-semibold text-[#1A2744] border border-[#FF6B00]/40 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30 bg-orange-50/30 w-full"
            >
              {TRADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                setTimeout(() => {
                  if (editing) handleSave();
                }, 150);
              }}
              className="text-sm font-semibold text-[#1A2744] border border-[#FF6B00]/40 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30 bg-orange-50/30 w-full"
            />
          )}
          {saving ? (
            <Loader2 className="w-4 h-4 text-[#FF6B00] animate-spin flex-shrink-0" />
          ) : (
            <>
              <button
                onClick={handleSave}
                className="p-1 rounded hover:bg-emerald-50 text-emerald-600 flex-shrink-0"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 rounded hover:bg-red-50 text-red-400 flex-shrink-0"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div
          className="flex items-center gap-1.5 mt-1 cursor-pointer group/field"
          onClick={() => {
            setDraft(displayValue);
            setEditing(true);
          }}
        >
          <p className="text-sm font-semibold text-[#1A2744]">
            {type === "select"
              ? TRADE_OPTIONS.find((o) => o.value === displayValue)?.label ?? displayValue ?? "\u2014"
              : displayValue || "\u2014"}
          </p>
          <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover/field:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function EditableBusinessProfile({
  account,
  email,
  _tradeLabel,
}: EditableBusinessProfileProps) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSave = useCallback(
    async (field: string, value: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/account/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast({ message: data.error || "Failed to save", type: "error" });
          setTimeout(() => setToast(null), 3000);
          return false;
        }
        setToast({ message: `${field.replace("_", " ")} updated`, type: "success" });
        setTimeout(() => setToast(null), 2000);
        return true;
      } catch {
        setToast({ message: "Network error. Please try again.", type: "error" });
        setTimeout(() => setToast(null), 3000);
        return false;
      }
    },
    []
  );

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 relative">
      {/* Toast notification */}
      {toast && (
        <div
          className={`absolute top-3 right-3 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-[#1A2744]" />
        <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">
          Business Profile
        </h2>
        <span className="text-[10px] text-slate-400 ml-auto font-medium">Click any field to edit</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InlineField
          label="Business Name"
          value={account.business_name || ""}
          field="business_name"
          onSave={handleSave}
        />
        <InlineField
          label="Owner"
          value={account.owner_name || ""}
          field="owner_name"
          onSave={handleSave}
        />
        <InlineField
          label="Trade Type"
          value={account.trade_type || "other"}
          field="trade_type"
          onSave={handleSave}
          type="select"
        />
        <InlineField
          label="Phone"
          value={account.phone || ""}
          field="phone"
          onSave={handleSave}
          type="tel"
        />
        <InlineField
          label="Email"
          value={email || ""}
          field="email"
          onSave={handleSave}
          readOnly
        />
        <InlineField
          label="Member Since"
          value={account.created_at ? formatDate(account.created_at) : "\u2014"}
          field="created_at"
          onSave={handleSave}
          readOnly
        />
      </div>

      <a
        href="/onboarding"
        className="inline-flex items-center gap-2 mt-2 text-xs font-semibold text-[#FF6B00] hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Full setup wizard
      </a>
    </div>
  );
}
