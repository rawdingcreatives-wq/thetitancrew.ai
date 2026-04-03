// @ts-nocheck
"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AddPartModal } from "./AddPartModal";

export function AddPartButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-[#FF6B00] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        Add Part
      </button>
      {open && <AddPartModal accountId={accountId} onClose={() => setOpen(false)} />}
    </>
  );
}
