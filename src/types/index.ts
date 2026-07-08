export type Role = "DSA" | "PARTNER" | "OPERATIONS" | "ADMIN";

export type VerificationStatus = "RED" | "YELLOW" | "GREEN" | null;

export type CaseType = "SECURED" | "UNSECURED";

export type SecuredStatus =
  | "BANK_SUBMITTED"
  | "TECHNICAL"
  | "CREDIT"
  | "SANCTION"
  | "DISBURSED"
  | "REJECTED";

export type UnsecuredStatus =
  | "JVR"
  | "LOGIN"
  | "FI"
  | "CREDIT"
  | "SANCTION"
  | "DISBURSED"
  | "REJECTED";

export type LeadStatus = SecuredStatus | UnsecuredStatus | "LEAD_SUBMITTED";

export type PayoutStatus = "PENDING" | "APPROVED" | "PAID" | "HOLD";

export interface UserProfile {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
  username: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO timestamp
  createdBy: string | null;
}

export interface Lead {
  id: string;
  customerName: string;
  productType: string;
  amount: number;
  bank: string;
  caseType: CaseType;
  verificationStatus: VerificationStatus;
  status: LeadStatus;
  rejectionReason: string | null;
  assignedTo: string;
  createdBy: string;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadLog {
  id: string;
  status: string;
  note: string;
  updatedBy: string;
  timestamp: string;
}

export interface Payout {
  id: string;
  leadId: string;
  payoutRate: number;
  payoutAmount: number;
  status: PayoutStatus;
  createdAt: string;
}

export interface PayoutLog {
  id: string;
  status: string;
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
