import { describe, expect, it } from "vitest";
import {
  furthestStageReached,
  getNextValidStatuses,
  isValidTransition,
} from "@/lib/business/status-flow";
import { allowedVerificationColors, verificationRejectsLead } from "@/lib/business/verification";
import { isValidPayoutTransition } from "@/lib/business/payout-status";
import { calculatePayout, resolveAdminShare } from "@/lib/business/payout-plans";

// Existing business rules that money and lead progress depend on.

describe("stage flow", () => {
  it("moves one stage at a time, with Rejected allowed from any active stage", () => {
    expect(getNextValidStatuses("SECURED", "CREDIT")).toEqual(["SANCTION", "REJECTED"]);
    expect(isValidTransition("SECURED", "BANK_SUBMITTED", "CREDIT")).toBe(false);
    expect(isValidTransition("UNSECURED", "FI", "LOGIN")).toBe(false);
    expect(getNextValidStatuses("SECURED", "DISBURSED")).toEqual([]);
  });

  it("finds how far a rejected lead got", () => {
    expect(furthestStageReached("SECURED", ["VERIFICATION_GREEN", "TECHNICAL", "CREDIT", "REJECTED"])).toBe(2);
    expect(furthestStageReached("SECURED", ["VERIFICATION_GREEN", "REJECTED"])).toBe(0);
    expect(furthestStageReached("SECURED", ["VERIFICATION_YELLOW"])).toBe(-1);
  });
});

describe("verification", () => {
  it("locks closed leads and refuses Yellow mid-flow", () => {
    expect(allowedVerificationColors("LEAD_SUBMITTED")).toEqual(["RED", "YELLOW", "GREEN"]);
    expect(allowedVerificationColors("CREDIT")).toEqual(["RED", "GREEN"]);
    expect(allowedVerificationColors("DISBURSED")).toEqual([]);
    expect(verificationRejectsLead("CREDIT", "RED")).toBe(true);
    expect(verificationRejectsLead("LEAD_SUBMITTED", "RED")).toBe(false);
  });
});

describe("payouts", () => {
  it("treats Paid as final and requires releasing a hold before paying", () => {
    expect(isValidPayoutTransition("PENDING", "PAID")).toBe(true);
    expect(isValidPayoutTransition("PAID", "PENDING")).toBe(false);
    expect(isValidPayoutTransition("HOLD", "PAID")).toBe(false);
  });

  it("splits the lender commission and pays the DSA share", () => {
    expect(calculatePayout(1_000_000, 0.015, 0.7)).toEqual({ commissionAmount: 15000, payoutRate: 0.3, payoutAmount: 4500 });
    expect(calculatePayout(333_333, 0.0175, 0.5)).toEqual({ commissionAmount: 5833.33, payoutRate: 0.5, payoutAmount: 2916.67 });
  });

  it("needs a personalized rate for the Personalized plan", () => {
    expect(resolveAdminShare("70-30", null)).toBe(0.7);
    expect(resolveAdminShare("PERSONALIZED", null)).toBeNull();
    expect(resolveAdminShare("PERSONALIZED", 0.65)).toBe(0.65);
  });
});
