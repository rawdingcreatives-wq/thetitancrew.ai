/**
 * TitanCrew — MilestoneTimeline
 * Vertical timeline showing viral milestones achieved.
 */

"use client";

interface Milestone {
  event_type: string;
  created_at: string;
  milestone_amount?: number;
}

interface Props {
  milestones: Milestone[];
}

const MILESTONE_META: Record<string, { emoji: string; label: (amount: number) => string }> = {
  monthly_revenue_milestone: {
    emoji: "💰",
    label: (amount) => `$${amount.toLocaleString()} month`,
  },
  jobs_milestone: {
    emoji: "🔧",
    label: (amount) => `${amount} jobs completed`,
  },
  first_job_completed: {
    emoji: "🎉",
    label: () => "First job completed",
  },
  referral_converted: {
    emoji: "🤝",
    label: () => "Referral activated",
  },
  trial_converted: {
    emoji: "🚀",
    label: () => "Upgraded to paid",
  },
  anniversary: {
    emoji: "🏆",
    label: (amount) => `${amount} year anniversary`,
  },
  positive_google_review: {
    emoji: "⭐",
    label: () => "5-star Google review",
  },
};

export default function MilestoneTimeline({ milestones }: Props) {
  return (
    <div className="space-y-3">
      {milestones.slice(0, 8).map((m, i) => {
        const meta = MILESTONE_META[m.event_type];
        if (!meta) return null;

        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-safety-orange-50 flex items-center justify-center text-lg shrink-0">
              {meta.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-trade-navy-800">
                {meta.label(m.milestone_amount ?? 0)}
              </p>
              <p className="text-xs text-trade-navy-400">
                {new Date(m.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
