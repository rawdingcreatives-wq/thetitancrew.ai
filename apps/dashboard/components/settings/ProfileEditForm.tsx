"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { updateProfile } from "@/app/(dashboard)/settings/actions";

const TRADE_LABELS: Record<string, string> = {
  plumbing:     "Plumbing",
  electrical:   "Electrical",
  hvac:         "HVAC",
  snow_plow:    "Snow Plow",
  junk_removal: "Junk Removal",
  general:      "General Contractor",
  roofing:      "Roofing",
  other:        "Other",
};

interface AccountProfile {
  business_name: string | null;
  owner_name: string | null;
  trade_type: string | null;
  phone: string | null;
  created_at: string | null;
}

interface Props {
  account: AccountProfile;
  userEmail: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const INPUT_CLS =
  "mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 " +
  "text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#FF6B00] bg-white";

const LABEL_CLS =
  "text-xs text-slate-500 font-semibold uppercase tracking-wider";

const VALUE_CLS =
  "text-sm font-semibold text-[#1A2744] mt-1";

export default function ProfileEditForm({ account, userEmail }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setErrorMsg(null);
    const result = await updateProfile(formData);
    setSaving(false);
    if (result.success) {
      setIsEditing(false);
    } else {
      setErrorMsg(result.error);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#1A2744]" />
          <h2 className="text-sm font-bold text-[#1A2744] uppercase tracking-wider">
            Business Profile
          </h2>
        </div>
        {!isEditing && (
          <button
            onClick={() => { setIsEditing(true); setErrorMsg(null); }}
            className="text-xs font-semibold text-[#FF6B00] hover:underline transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>

      {isEditing ? (
        /* ---- EDIT MODE ---- */
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Business Name</label>
              <input
                name="business_name"
                defaultValue={account.business_name ?? ""}
                className={INPUT_CLS}
                required
                maxLength={100}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Owner</label>
              <input
                name="owner_name"
                defaultValue={account.owner_name ?? ""}
                className={INPUT_CLS}
                required
                maxLength={100}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Trade Type</label>
              <select
                name="trade_type"
                defaultValue={account.trade_type ?? ""}
                className={INPUT_CLS}
              >
                {Object.entries(TRADE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Phone</label>
              <input
                name="phone"
                type="tel"
                defaultValue={account.phone ?? ""}
                className={INPUT_CLS}
                maxLength={20}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Email</label>
              <p className={VALUE_CLS}>{userEmail || "—"}</p>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 font-semibold">{errorMsg}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-white bg-[#FF6B00] rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => { setIsEditing(false); setErrorMsg(null); }}
              className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ---- DISPLAY MODE ---- */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Business Name</label>
            <p className={VALUE_CLS}>{account.business_name || "—"}</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Owner</label>
            <p className={VALUE_CLS}>{account.owner_name || "—"}</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Trade Type</label>
            <p className={VALUE_CLS}>
              {TRADE_LABELS[account.trade_type ?? ""] ?? account.trade_type ?? "—"}
            </p>
          </div>
          <div>
            <label className={LABEL_CLS}>Phone</label>
            <p className={VALUE_CLS}>{account.phone || "—"}</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <p className={VALUE_CLS}>{userEmail || "—"}</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Member Since</label>
            <p className={VALUE_CLS}>
              {account.created_at ? formatDate(account.created_at) : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
