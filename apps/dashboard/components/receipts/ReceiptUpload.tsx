"use client";

/**
 * ReceiptUpload — Mobile-first receipt image upload
 *
 * PWA-optimized with large touch targets for gloved use.
 * Supports camera capture + file picker.
 * Auto-triggers parse after upload.
 */
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Job {
  id: string;
  title: string;
  status: string;
}

interface ReceiptUploadProps {
  accountId: string;
  jobs: Job[];
}

export function ReceiptUpload({ accountId, jobs }: ReceiptUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setShowJobPicker(true);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (selectedJobId) {
        formData.append("job_id", selectedJobId);
      }

      // Upload receipt
      const res = await fetch("/api/receipts", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Auto-trigger parse
      const parseRes = await fetch(`/api/receipts/${data.receipt.id}/parse`, {
        method: "POST",
      });
      const parseData = await parseRes.json();

      if (parseRes.ok) {
        setSuccess(
          `Receipt parsed! ${parseData.receipt.line_items_count} items from ${parseData.receipt.vendor_name || "vendor"} — $${parseData.receipt.total_amount?.toFixed(2) || "0.00"}`
        );
      } else {
        setSuccess("Receipt uploaded! Parsing will be retried.");
      }

      // Reset state
      setSelectedFile(null);
      setSelectedJobId("");
      setShowJobPicker(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setSelectedJobId("");
    setShowJobPicker(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Upload Button — large touch target for gloved use */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!showJobPicker && (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-5 py-3 bg-[#FF6B00] text-white font-semibold rounded-xl shadow-md hover:bg-[#e55f00] active:scale-95 transition-all min-h-[48px]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden sm:inline">Upload Receipt</span>
          <span className="sm:hidden">Snap Receipt</span>
        </button>
      )}

      {/* Job Picker + Confirm */}
      {showJobPicker && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-4 w-full sm:w-80 space-y-3">
          <p className="text-sm font-medium text-[#1A2744]">
            {selectedFile?.name}
          </p>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">
              Link to job (optional)
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00] min-h-[44px]"
            >
              <option value="">— No job selected —</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={uploading}
              className="flex-1 px-3 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex-1 px-3 py-2.5 text-sm font-semibold text-white bg-[#FF6B00] rounded-lg hover:bg-[#e55f00] disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Parsing...
                </>
              ) : (
                "Upload & Parse"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}
    </div>
  );
}
