import { notFound } from "next/navigation";
import Link from "next/link";
import { ALL_PAYOUT_PLANS, PAYOUT_PLANS, PERSONALIZED_PLAN } from "@/lib/business/payout-plans";
import type { PayoutPlan } from "@/types";

const CONTENT: Record<PayoutPlan, { title: string; rateLabel: string; body: string[] }> = {
  "50-50": {
    title: "50-50 payout plan — Terms & Conditions",
    rateLabel: "Admin share: 50% · DSA/Partner share: 50%",
    body: [
      "Under the 50-50 plan, processing responsibilities for a lead are split evenly between the admin team and the DSA/Partner who submitted it.",
      "The admin's payout share (50%) reflects the effort the admin team puts into verification, coordination with the lender, and disbursal follow-up on this lead.",
      "Once a lead is submitted with this plan, the plan cannot be changed for that lead.",
    ],
  },
  "70-30": {
    title: "70-30 payout plan — Terms & Conditions",
    rateLabel: "Admin share: 70% · DSA/Partner share: 30%",
    body: [
      "Under the 70-30 plan, the admin team takes on the majority of the processing work for this lead — including most lender coordination and documentation follow-up — in exchange for a larger share of the payout.",
      "This plan suits DSAs/Partners who want more hands-on admin support in getting a case through to disbursal.",
      "Once a lead is submitted with this plan, the plan cannot be changed for that lead.",
    ],
  },
  "90-10": {
    title: "90-10 payout plan — Terms & Conditions",
    rateLabel: "Admin share: 90% · DSA/Partner share: 10%",
    body: [
      "Under the 90-10 plan, the admin team handles nearly all processing work for this lead, end to end, leaving the DSA/Partner primarily responsible for the initial customer introduction.",
      "This is the highest admin-effort plan and carries the largest admin payout share accordingly.",
      "Once a lead is submitted with this plan, the plan cannot be changed for that lead.",
    ],
  },
  PERSONALIZED: {
    title: "Personalized payout plan — Terms & Conditions",
    rateLabel: "Rate set individually by your admin",
    body: [
      "The Personalized plan applies a payout rate that an admin has configured specifically for your account, reflecting an arrangement agreed outside the standard 50-50 / 70-30 / 90-10 tiers.",
      "This option is only available if an admin has set a rate for you. If you don't see it, no personalized rate has been configured yet — contact an admin.",
      "An admin may update your personalized rate at any time in User Management; the rate applied to a given lead is the one in effect at the time that lead is disbursed.",
      "Once a lead is submitted with this plan, the plan cannot be changed for that lead.",
    ],
  },
};

export function generateStaticParams() {
  return ALL_PAYOUT_PLANS.map((plan) => ({ plan }));
}

export default function TermsPage({ params }: { params: { plan: string } }) {
  const plan = params.plan.toUpperCase() === "PERSONALIZED" ? "PERSONALIZED" : (params.plan as PayoutPlan);
  const content = CONTENT[plan];
  if (!content) notFound();

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-ink-100 bg-white p-8 shadow-card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
          {plan === "PERSONALIZED" ? PERSONALIZED_PLAN.label : PAYOUT_PLANS[plan].label} plan
        </p>
        <h1 className="mb-2 font-display text-xl font-semibold text-ink-900">{content.title}</h1>
        <p className="mb-6 text-sm font-medium text-ink-500">{content.rateLabel}</p>
        <div className="space-y-3 text-sm leading-relaxed text-ink-700">
          {content.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <Link
          href="/dashboard"
          className="mt-8 inline-block text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
