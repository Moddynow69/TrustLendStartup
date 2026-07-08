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

export const registerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email().optional(),
  username: z
    .string()
    .min(3)
    .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, numbers, . _ -")
    .optional(),
  password: passwordSchema,
  role: z.enum(["DSA", "PARTNER", "OPERATIONS", "ADMIN"]),
}).refine((data) => data.email || data.username, {
  message: "Either email or username is required",
  path: ["email"],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
