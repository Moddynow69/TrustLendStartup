"use client";

import { clsx } from "clsx";
import { PAYOUT_PLANS, PERSONALIZED_PLAN } from "@/lib/business/payout-plans";
import type { PayoutPlan } from "@/types";
import { useEffect } from "react";
export function PayoutPlanSelect({
  value,
  onChange,
  personalizedPayoutRate,
}: {
  value: PayoutPlan | "";
  onChange: (plan: PayoutPlan) => void;
  /** Decimal (e.g. 0.65) set by an admin for the current user, or null if none. */
  personalizedPayoutRate: number | null | undefined;
}) {
  const options: { plan: PayoutPlan; label: string; description: string; termsUrl: string }[] = [
    ...(Object.entries(PAYOUT_PLANS) as [PayoutPlan, (typeof PAYOUT_PLANS)[keyof typeof PAYOUT_PLANS]][]).map(
      ([plan, cfg]) => ({ plan, label: cfg.label, description: cfg.description, termsUrl: cfg.termsUrl })
    ),
  ];

  if (personalizedPayoutRate != null) {
    options.push({
      plan: "PERSONALIZED",
      // Same "admin-DSA" format as the fixed plans, e.g. "Personalized (65-35)".
      label: `${PERSONALIZED_PLAN.label} (${Math.round(personalizedPayoutRate * 100)}-${100 - Math.round(personalizedPayoutRate * 100)})`,
      description: PERSONALIZED_PLAN.description,
      termsUrl: PERSONALIZED_PLAN.termsUrl,
    });
  }
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink-700">Payout rate plan</label>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.plan}
            className={clsx(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm",
              value === opt.plan ? "border-brand-500 bg-brand-50" : "border-ink-100 bg-white"
            )}
          >
            <input
              type="radio"
              name="selectedPlan"
              className="mt-0.5"
              checked={value === opt.plan}
              onChange={() => onChange(opt.plan)}
            />
            <span className="flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink-900">{opt.label}</span>
                <a
                  href={opt.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
                >
                  Terms
                </a>
              </span>
              <span className="block text-xs text-ink-400">{opt.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
