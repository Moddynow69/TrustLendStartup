import type { Role } from "@/types";

export const canCreateLead = (role: Role) => role === "DSA" || role === "PARTNER";

export const canViewAllLeads = (role: Role) => role === "ADMIN" || role === "OPERATIONS";

export const canSetVerificationStatus = (role: Role) =>
  role === "OPERATIONS" || role === "ADMIN";

/** Only Admin can move a lead through its case-type-specific stages. */
export const canUpdateCaseStatus = (role: Role) => role === "ADMIN";

export const canProcessPayouts = (role: Role) => role === "ADMIN";

export const canManageUsers = (role: Role) => role === "ADMIN";

export const isOwnResource = (userId: string, resourceOwnerId: string) =>
  userId === resourceOwnerId;
