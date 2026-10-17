import { z } from "zod";

/** At least one letter and one number, minimum 8 characters. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/** Step 1 of login: resolving an identifier to its email doesn't need a password yet. */
export const loginIdentifierSchema = z.object({
  identifier: z.string().min(3, "Enter your email or username"),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, "Enter your email or username"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
