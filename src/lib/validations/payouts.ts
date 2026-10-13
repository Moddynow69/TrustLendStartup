import { z } from "zod";
import { commissionPercentSchema } from "@/lib/validations/leads";

export const processPayoutSchema = z.object({
  leadId: z.string().min(1),
  /** Lender commission as a percent of the loan amount. */
  commissionRate: commissionPercentSchema,
});

export const payoutStatusUpdateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PAID", "HOLD"]),
});

export type ProcessPayoutInput = z.infer<typeof processPayoutSchema>;
export type PayoutStatusUpdateInput = z.infer<typeof payoutStatusUpdateSchema>;
