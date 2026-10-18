import { z } from "zod";
import { isRegisteredLender } from "@/lib/lenders";

export const createLeadSchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  productType: z.string().min(2, "Product type is required"),
  amount: z.number().positive("Amount must be greater than zero"),
  bank: z
    .string()
    .min(2, "Bank is required")
    .refine(isRegisteredLender, "Select a bank, NBFC or ARC from the list"),
  caseType: z.enum(["SECURED", "UNSECURED"]),
  assignedTo: z.string().min(1, "Assigned user is required"),
  selectedPlan: z.enum(["50-50", "70-30", "90-10", "PERSONALIZED"], {
    required_error: "Select a payout rate plan",
  }),
});

export const verificationStatusSchema = z.object({
  verificationStatus: z.enum(["RED", "YELLOW", "GREEN"]),
  note: z.string().optional(),
});

/** Lender commission as a percent of the loan amount (e.g. 1.5 for 1.5%). */
export const commissionPercentSchema = z
  .number()
  .gt(0, "Commission rate must be greater than 0%")
  .max(100, "Commission rate can't exceed 100%");

export const leadStatusUpdateSchema = z
  .object({
    status: z.string().min(1),
    rejectionReason: z.string().optional(),
    note: z.string().optional(),
    commissionRate: commissionPercentSchema.optional(),
  })
  .refine((data) => data.status !== "REJECTED" || !!data.rejectionReason?.trim(), {
    message: "rejectionReason is required when status is REJECTED",
    path: ["rejectionReason"],
  })
  .refine((data) => data.status !== "DISBURSED" || data.commissionRate != null, {
    message: "commissionRate is required when status is DISBURSED",
    path: ["commissionRate"],
  });

export const leadListQuerySchema = z.object({
  verificationStatus: z.enum(["RED", "YELLOW", "GREEN"]).optional(),
  status: z.string().optional(),
  caseType: z.enum(["SECURED", "UNSECURED"]).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type VerificationStatusInput = z.infer<typeof verificationStatusSchema>;
export type LeadStatusUpdateInput = z.infer<typeof leadStatusUpdateSchema>;
