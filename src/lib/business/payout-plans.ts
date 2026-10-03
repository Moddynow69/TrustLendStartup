import type { PayoutPlan } from "@/types";

/**
 * Fixed payout plans a DSA/PARTNER can choose from when creating a lead.
 * The rate is the admin's share of the payout — a higher rate means the
 * admin takes on more of the processing work on the DSA's behalf.
 * PERSONALIZED has no fixed rate here; it resolves at disbursal time from
 * the lead creator's `personalizedPayoutRate` (set by an admin in
 * /admin/users).
 */
export const PAYOUT_PLANS: Record<
  Exclude<PayoutPlan, "PERSONALIZED">,
  { label: string; rate: number; description: string; termsUrl: string }
> = {
  "50-50": {
    label: "50-50",
    rate: 0.5,
    description: "DSA and admin share the work equally.",
    termsUrl: "/terms/50-50",
  },
  "70-30": {
    label: "70-30",
    rate: 0.7,
    description: "Admin handles 70% of the work, DSA handles 30%.",
    termsUrl: "/terms/70-30",
  },
  "90-10": {
    label: "90-10",
    rate: 0.9,
    description: "Admin handles almost all of the processing work.",
    termsUrl: "/terms/90-10",
  },
};

export const PERSONALIZED_PLAN = {
  label: "Personalized",
  description: "A rate set specifically for you by an admin.",
  termsUrl: "/terms/personalized",
};

export const ALL_PAYOUT_PLANS: PayoutPlan[] = ["50-50", "70-30", "90-10", "PERSONALIZED"];

/**
 * Resolves the numeric payout rate for a plan. For PERSONALIZED, the
 * caller must supply the lead creator's `personalizedPayoutRate` (a
 * decimal, e.g. 0.65) — returns null if that user has none configured,
 * which callers should treat as an error state.
 */
export function resolvePayoutRate(
  plan: PayoutPlan,
  personalizedPayoutRate: number | null | undefined
): number | null {
  if (plan === "PERSONALIZED") {
    return typeof personalizedPayoutRate === "number" ? personalizedPayoutRate : null;
  }
  return PAYOUT_PLANS[plan].rate;
}
