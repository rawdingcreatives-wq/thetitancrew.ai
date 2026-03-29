// @ts-nocheck
/**
 * TitanCrew — CaseStudyList component
 * Shows generated case studies with publish toggles and copy buttons.
 */

"use client";

import { useState } from "react";

interface CaseStudy {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: "draft" | "published" | "testimonial_requested";
  created_at: string;
  published_at?: string;
}

interface Props {
  caseStudies: CaseStudy[];
  accountId: string;
}

export default function CaseStudyList({ caseStudies, accountId }: Props) {
  const [studies, setStudies] = useState(caseStudies);
  const [publishing, setPublishing] = useState<string | null>(null);

  const handlePublishToggle = async (study: CaseStudy) => {
    setPublishing(study.id);
    const newStatus = study.status === "published" ? "draft" : "published";

    try {
      const res = await fetch(`/api/growth/case-studies/${study.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setStudies((prev) =>
          prev.map((s) =>
            s.id === study.id
              ? { ...s, status: newStatus, published_at: newStatus === "published" ? new Date().toISOString() : undefined }
              : s
          )
        );
      }
    } catch {
      // Silently fail
    } finally {
      setPublishing(null);
    }
  };

  const copySnippet = (summary: string) => {
    navigator.clipboard.writeText(summary);
  };

  if (studies.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-trade-navy-600 font-medium">No case studies yet</p>
        <p className="text-sm text-trade-navy-400 mt-1">
          Case studies are auto-generated when jobs are marked complete.
        </p>
      </div>
    );
  }

  const statusLabel = {
    draft: { label: "Draft", color: "bg-trade-navy-100 text-trade-navy-600" },
    published: { label: "Published", color: "bg-green-100 text-green-700" },
    testimonial_requested: { label: "Review Requested", color: "bg-safety-orange-100 text-safety-orange-700" },
  };

  return (
    <div className="space-y-3">
      {studies.map((study) => (
        <div
          key={study.id}
          className="flex items-start gap-4 p-4 rounded-lg border border-trade-navy-100 hover:border-trade-navy-200 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusLabel[study.status].color}`}
              >
                {statusLabel[study.status].label}
              </span>
              <span className="text-xs text-trade-navy-400">
                {new Date(study.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <p className="text-sm font-medium text-trade-navy-900 truncate">{study.title}</p>
            <p className="text-xs text-trade-navy-500 mt-0.5 line-clamp-2">{study.summary}</p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => copySnippet(study.summary)}
              className="text-xs px-2 py-1 border border-trade-navy-200 rounded hover:bg-trade-navy-50 transition-colors text-trade-navy-600"
              title="Copy social proof snippet"
            >
              Copy
            </button>
            <button
              onClick={() => handlePublishToggle(study)}
              disabled={publishing === study.id}
              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                study.status === "published"
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-safety-orange-500 text-white hover:bg-safety-orange-600"
              } disabled:opacity-50`}
            >
              {publishing === study.id
                ? "..."
                : study.status === "published"
                ? "Unpublish"
                : "Publish"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
