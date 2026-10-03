import { z } from "zod";
import { passwordSchema } from "@/lib/validations/auth";

export const createUserSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email().optional(),
    username: z
      .string()
      .min(3)
      .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, numbers, . _ -")
      .optional(),
    password: passwordSchema,
    role: z.enum(["DSA", "PARTNER", "OPERATIONS", "ADMIN"]),
  })
  .refine((data) => data.email || data.username, {
    message: "Either email or username is required",
    path: ["email"],
  });

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["DSA", "PARTNER", "OPERATIONS", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
  newPassword: passwordSchema.optional(),
  /** Percentage (0-100, exclusive), or null to clear/hide the personalized
   * plan option for this user. Converted to a 0-1 decimal before storage. */
  personalizedPayoutRate: z
    .number()
    .gt(0, "Payout rate must be greater than 0%")
    .lt(100, "Payout rate must be less than 100%")
    .nullable()
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
