/**
 * TitanCrew — Plan Feature Gates
 *
 * Single source of truth for what each plan unlocks.
 * Import this anywhere you need to check a feature flag.
 */

export type PlanKey = "basic" | "pro" | "elite";

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
  basic: {
    agentCount:         5, // All 6 except TechDispatch
    techDispatch:       false,
    multiLocation:      false,
    priorityOnboarding: false,
    customWorkflows:    false,
    apiAccess:          false,
    advancedAnalytics:  false,
    whiteLabel:         false,
    accountManager:     false,
  },
  pro: {
    agentCount:         6, // Full crew including TechDispatch
    techDispatch:       true,
    multiLocation:      true,
    priorityOnboarding: true,
    customWorkflows:    true,
    apiAccess:          true,
    advancedAnalytics:  true,
    whiteLabel:         false,
    accountManager:     false,
  },
  elite: {
    agentCount:         6,
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
  basic: { monthly: 399, label: "$399/mo" },
  pro:   { monthly: 799, label: "$799/mo" },
  elite: { monthly: 1299, label: "$1,299/mo" },
};

/** Returns true if the given plan includes the feature */
export function hasFeature(plan: string | null | undefined, feature: keyof PlanFeatures): boolean {
  const key = (plan ?? "basic") as PlanKey;
  return PLAN_FEATURES[key]?.[feature] ?? PLAN_FEATURES.basic[feature];
}

/** Returns the plan features object for a given plan key */
export function getPlanFeatures(plan: string | null | undefined): PlanFeatures {
  const key = (plan ?? "basic") as PlanKey;
  return PLAN_FEATURES[key] ?? PLAN_FEATURES.basic;
}
