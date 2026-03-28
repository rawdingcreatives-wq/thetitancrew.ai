/**
 * TitanCrew — ReferralCard component
 * Displays the contractor's unique referral link + earnings summary.
 * Includes copy-to-clipboard and native share API support.
 */

"use client";

import { useState } from "react";

interface ReferralCardProps {
  code?: string;
  referralUrl: string | null;
  uses: number;
  creditsEarned: number;
  rewardAmount: number;
}

export default function ReferralCard({
  code,
  referralUrl,
  uses,
  creditsEarned,
  rewardAmount,
}: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    if (!referralUrl) return;
    if (navigator.share) {
      navigator.share({
        title: "Try TitanCrew — AI for contractors",
        text: `I've been using TitanCrew to automate scheduling, invoicing, and parts ordering. Check it out — first 14 days free.`,
        url: referralUrl,
      });
    } else {
      handleCopy();
    }
  };

  if (!code || !referralUrl) {
    return (
      <div className="bg-white rounded-xl border border-trade-navy-100 p-6">
        <h2 className="text-lg font-semibold text-trade-navy-900 mb-2">Referral Program</h2>
        <p className="text-sm text-trade-navy-400">
          Your referral code is being generated. It will appear here after your first job is
          completed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-trade-navy-100 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-trade-navy-900">Referral Program</h2>
          <p className="text-sm text-trade-navy-500 mt-0.5">
            Earn ${rewardAmount} account credit for every contractor who signs up and activates
          </p>
        </div>
        <span className="bg-safety-orange-50 text-safety-orange-600 text-xs font-semibold px-3 py-1 rounded-full">
          ${rewardAmount}/referral
        </span>
      </div>

      {/* Referral URL display */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 bg-trade-navy-50 rounded-lg px-3 py-2.5 font-mono text-sm text-trade-navy-700 truncate">
          {referralUrl}
        </div>
        <button
          onClick={handleCopy}
          className="px-3 py-2.5 bg-trade-navy-900 hover:bg-trade-navy-800 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={handleShare}
          className="px-3 py-2.5 bg-safety-orange-500 hover:bg-safety-orange-600 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          Share
        </button>
      </div>

      {/* Share message suggestion */}
      <div className="mt-3 bg-trade-navy-50 rounded-lg p-3">
        <p className="text-xs text-trade-navy-500 font-medium mb-1">Suggested message:</p>
        <p className="text-sm text-trade-navy-700 italic">
          "Hey — I've been using TitanCrew to automate my scheduling and invoicing. It's actually
          pretty sick. First 14 days free: {referralUrl}"
        </p>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-trade-navy-100">
        <div>
          <p className="text-xs text-trade-navy-400">Referral Code</p>
          <p className="text-base font-bold text-trade-navy-900 font-mono">{code}</p>
        </div>
        <div>
          <p className="text-xs text-trade-navy-400">Total Uses</p>
          <p className="text-base font-bold text-trade-navy-900">{uses}</p>
        </div>
        <div>
          <p className="text-xs text-trade-navy-400">Credits Earned</p>
          <p className="text-base font-bold text-safety-orange-500">
            ${creditsEarned.toLocaleString("en-US", { minimumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* How it works */}
      <details className="mt-4 group">
        <summary className="text-xs text-trade-navy-400 cursor-pointer hover:text-trade-navy-600 select-none">
          How does it work?
        </summary>
        <div className="mt-2 text-xs text-trade-navy-500 space-y-1.5">
          <p>1. Share your referral link with another contractor</p>
          <p>2. They sign up and complete their 14-day trial</p>
          <p>3. When they activate a paid plan, you automatically get ${rewardAmount} credit</p>
          <p>4. Credits apply to your next billing cycle — no limits, no expiry</p>
        </div>
      </details>
    </div>
  );
}
