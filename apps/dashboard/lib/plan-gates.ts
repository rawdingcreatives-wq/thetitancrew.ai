/**
 * TitanCrew — Plan Feature Gates
 *
 * Single source of truth for what each plan unlocks.
 * Import this anywhere you need to check a feature flag.
 */

export type PlanKey = "lite" | "growth" | "scale";

export interface PlanFeatures {
  /** Number of AI agents active */
  agentCount: number;
  /** Tech Dispatch AI — route optimization engine */
  techDispatch: boolean;
  /** Support for multiple business locations */
  multiLocation: boolean;
  /** Priority onboarding call with TitanCrew team */
  priorityOnboarding: boolean;
  /** Custom AI agent workflow builder */
  customWorkflows: boolean;
  /** REST API access for external integrations */
  apiAccess: boolean;
  /** Advanced analytics & attribution dashboard */
  advancedAnalytics: boolean;
  /** White-label / custom branding */
  whiteLabel: boolean;
  /** Dedicated account manager */
  accountManager: boolean;
}

export const PLAN_FEATURES: Record<PlanKey, PlanFeatures> = {
  lite: {
    agentCount:         5, // Most restricted (free tier)
    techDispatch:       false,
    multiLocation:      false,
    priorityOnboarding: false,
    customWorkflows:    false,
    apiAccess:          false,
    advancedAnalytics:  false,
    whiteLabel:         false,
    accountManager:     false,
  },
  growth: {
    agentCount:         6, // All features (mid-tier)
    techDispatch:       true,
    multiLocation:      true,
    priorityOnboarding: true,
    customWorkflows:    true,
    apiAccess:          true,
    advancedAnalytics:  true,
    whiteLabel:         false,
    accountManager:     false,
  },
  scale: {
    agentCount:         6, // Full access with priority (scale)
    techDispatch:       true,
    multiLocation:      true,
    priorityOnboarding: true,
    customWorkflows:    true,
    apiAccess:          true,
    advancedAnalytics:  true,
    whiteLabel:         true,
    accountManager:     true,
  },
};

export const PLAN_PRICES: Record<PlanKey, { monthly: number; label: string }> = {
  lite:   { monthly: 0, label: "Free" },
  growth: { monthly: 399, label: "$399/mo" },
  scale:  { monthly: 799, label: "$799/mo" },
};

/** Returns true if the given plan includes the feature */
export function hasFeature(plan: string | null | undefined, feature: keyof PlanFeatures): boolean {
  const key = (plan ?? "lite") as PlanKey;
  const features = PLAN_FEATURES[key] ?? PLAN_FEATURES.lite;
  return Boolean(features[feature]);
}

/** Returns the plan features object for a given plan key */
export function getPlanFeatures(plan: string | null | undefined): PlanFeatures {
  const key = (plan ?? "lite") as PlanKey;
  return PLAN_FEATURES[key] ?? PLAN_FEATURES.lite;
}
