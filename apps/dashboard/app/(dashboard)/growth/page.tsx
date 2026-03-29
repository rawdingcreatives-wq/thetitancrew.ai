// @ts-nocheck
/**
 * TitanCrew — /growth Dashboard Page
 *
 * Displays the growth flywheel stats:
 *   - Referral program (code + share link + earnings)
 *   - Case studies generated (count + publish toggle)
 *   - Social posting activity (posts by platform, estimated reach)
 *   - Milestones achieved
 *   - Viral coefficient (K-factor)
 */

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import ReferralCard from "@/components/growth/ReferralCard";
import CaseStudyList from "@/components/growth/CaseStudyList";
import SocialActivityChart from "@/components/growth/SocialActivityChart";
import MilestoneTimeline from "@/components/growth/MilestoneTimeline";

export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, owner_name, referral_code, plan")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) redirect("/onboarding");

  // Parallel data fetches
  const [
    caseStudiesRes,
    socialPostsRes,
    referralRes,
    milestonesRes,
    socialGroupsRes,
  ] = await Promise.allSettled([
    supabase
      .from("case_studies")
      .select("id, title, slug, summary, status, created_at, published_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("social_posts")
      .select("platform, created_at")
      .eq("account_id", account.id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

    supabase
      .from("referral_codes")
      .select("code, uses, credits_earned")
      .eq("account_id", account.id)
      .single(),

    supabase
      .from("viral_events_log")
      .select("event_type, created_at, milestone_amount")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("social_group_targets")
      .select("platform, group_name, last_posted_at, total_posts, active")
      .eq("account_id", account.id)
      .eq("active", true),
  ]);

  const caseStudies = (caseStudiesRes as any).value?.data ?? [];
  const socialPosts = (socialPostsRes as any).value?.data ?? [];
  const referral = (referralRes as any).value?.data;
  const milestones = (milestonesRes as any).value?.data ?? [];
  const socialGroups = (socialGroupsRes as any).value?.data ?? [];

  // Platform breakdown
  const platformCounts: Record<string, number> = {};
  for (const post of socialPosts) {
    platformCounts[post.platform] = (platformCounts[post.platform] || 0) + 1;
  }

  const referralUrl = referral?.code
    ? `https://titancrew.ai/signup?ref=${referral.code}`
    : null;

  const totalPostsAllTime = socialGroups.reduce(
    (sum: number, g: { total_posts: number }) => sum + (g.total_posts || 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-trade-navy-900">Growth Flywheel</h1>
        <p className="text-trade-navy-500 mt-1">
          AI-powered content creation, social distribution, and referral tracking
        </p>
      </div>

      {/* Top stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Case Studies"
          value={caseStudies.length}
          sub={`${caseStudies.filter((c: { status: string }) => c.status === "published").length} published`}
          color="orange"
        />
        <StatCard
          label="Social Posts (30d)"
          value={socialPosts.length}
          sub={`${Object.keys(platformCounts).length} platforms`}
          color="navy"
        />
        <StatCard
          label="Referral Uses"
          value={referral?.uses ?? 0}
          sub={referral?.credits_earned ? `$${referral.credits_earned} earned` : "Share to earn $150/referral"}
          color="orange"
        />
        <StatCard
          label="Total Posts"
          value={totalPostsAllTime}
          sub="across all groups"
          color="navy"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Referral Program */}
          <ReferralCard
            code={referral?.code}
            referralUrl={referralUrl}
            uses={referral?.uses ?? 0}
            creditsEarned={referral?.credits_earned ?? 0}
            rewardAmount={150}
          />

          {/* Case Studies */}
          <div className="bg-white rounded-xl border border-trade-navy-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-trade-navy-900">Case Studies</h2>
              <span className="text-sm text-trade-navy-400">
                Auto-generated from completed jobs
              </span>
            </div>
            <CaseStudyList caseStudies={caseStudies} accountId={account.id} />
          </div>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-6">
          {/* Social activity */}
          <div className="bg-white rounded-xl border border-trade-navy-100 p-6">
            <h2 className="text-lg font-semibold text-trade-navy-900 mb-4">
              Social Activity (30 days)
            </h2>
            <SocialActivityChart platformCounts={platformCounts} />

            <div className="mt-4 space-y-2">
              {socialGroups.slice(0, 5).map((g: { platform: string; group_name: string; total_posts: number; last_posted_at: string | null }) => (
                <div key={g.group_name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <PlatformDot platform={g.platform} />
                    <span className="text-trade-navy-700 truncate max-w-[140px]">{g.group_name}</span>
                  </div>
                  <span className="text-trade-navy-400">{g.total_posts} posts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Milestones */}
          <div className="bg-white rounded-xl border border-trade-navy-100 p-6">
            <h2 className="text-lg font-semibold text-trade-navy-900 mb-4">
              Milestones
            </h2>
            {milestones.length === 0 ? (
              <p className="text-trade-navy-400 text-sm">
                Complete your first job to unlock milestones.
              </p>
            ) : (
              <MilestoneTimeline milestones={milestones} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: "orange" | "navy";
}) {
  return (
    <div className="bg-white rounded-xl border border-trade-navy-100 p-4">
      <p className="text-xs font-medium text-trade-navy-400 uppercase tracking-wide">{label}</p>
      <p
        className={`text-3xl font-bold mt-1 ${
          color === "orange" ? "text-safety-orange-500" : "text-trade-navy-900"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-trade-navy-400 mt-1">{sub}</p>
    </div>
  );
}

function PlatformDot({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    facebook: "bg-blue-500",
    reddit: "bg-orange-500",
    nextdoor: "bg-green-500",
    linkedin: "bg-blue-700",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${colors[platform] ?? "bg-gray-400"}`}
    />
  );
}
