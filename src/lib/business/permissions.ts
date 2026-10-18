import type { Lead, Payout, Role, UserProfile } from "@/types";

export const canCreateLead = (role: Role) => role === "DSA" || role === "PARTNER";

export const canViewAllLeads = (role: Role) => role === "ADMIN" || role === "OPERATIONS";

/** DSA/PARTNER see leads they created or are currently assigned to. */
export const canViewLead = (user: UserProfile, lead: Pick<Lead, "createdBy" | "assignedTo">) =>
  canViewAllLeads(user.role) || lead.createdBy === user.id || lead.assignedTo === user.id;

/** Only Admin can reassign a lead (it moves who gets the payout). */
export const canReassignLead = (role: Role) => role === "ADMIN";

/** Operations can view every payout (read-only); DSA/PARTNER only their own. */
export const canViewAllPayouts = (role: Role) => role === "ADMIN" || role === "OPERATIONS";

export const canViewPayout = (user: UserProfile, payout: Pick<Payout, "payeeId">) =>
  canViewAllPayouts(user.role) || payout.payeeId === user.id;

export const canSetVerificationStatus = (role: Role) =>
  role === "OPERATIONS" || role === "ADMIN";

/** Only Admin can move a lead through its case-type-specific stages. */
export const canUpdateCaseStatus = (role: Role) => role === "ADMIN";

export const canProcessPayouts = (role: Role) => role === "ADMIN";

export const canManageUsers = (role: Role) => role === "ADMIN";

export const isOwnResource = (userId: string, resourceOwnerId: string) =>
  userId === resourceOwnerId;
