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
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
