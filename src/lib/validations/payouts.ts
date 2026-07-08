import { z } from "zod";

export const processPayoutSchema = z.object({
  leadId: z.string().min(1),
  payoutRate: z.number().positive("Payout rate must be greater than zero"),
});

export const payoutStatusUpdateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PAID", "HOLD"]),
});

export type ProcessPayoutInput = z.infer<typeof processPayoutSchema>;
export type PayoutStatusUpdateInput = z.infer<typeof payoutStatusUpdateSchema>;
