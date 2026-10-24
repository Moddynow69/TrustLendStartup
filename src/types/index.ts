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

/** 50-50 / 70-30 / 90-10 are fixed plans; PERSONALIZED resolves via the
 * lead creator's `personalizedPayoutRate`, set by an admin. */
export type PayoutPlan = "50-50" | "70-30" | "90-10" | "PERSONALIZED";

export interface UserProfile {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
  username: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO timestamp
  createdBy: string | null;
  /** Custom payout rate (0-1) set by an admin for this user only.
   * null means the personalized plan option is not available to them. */
  personalizedPayoutRate: number | null;
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
  /** Payout rate plan chosen at lead creation; fixed once submitted. */
  selectedPlan: PayoutPlan;
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

/**
 * The DSA/PARTNER's share of the lender's commission on a disbursed lead.
 * Rates are 0-1 decimals: commissionAmount = loan amount × commissionRate,
 * payoutAmount = commissionAmount × payoutRate (= 1 − the plan's admin share).
 */
export interface Payout {
  id: string;
  leadId: string;
  /** The DSA/PARTNER being paid: the lead's assignee when it was disbursed. */
  payeeId: string | null;
  /** null on payouts created before commission-based payouts existed. */
  commissionRate: number | null;
  commissionAmount: number | null;
  payoutRate: number;
  payoutAmount: number;
  status: PayoutStatus;
  createdAt: string;
}

export interface PayoutLog {
  id: string;
  status: string;
  /** Who made the change; null for system entries (e.g. creation). */
  updatedBy: string | null;
  timestamp: string;
}

/** Role-scoped counts shown on the dashboard (GET /api/dashboard). */
export interface DashboardStats {
  totalLeads: number;
  red: number;
  yellow: number;
  green: number;
  disbursed: number;
  rejected: number;
  pendingPayouts: number;
  /** Leads with at least one open "new copy" document request. */
  leadsNeedingNewCopy: number;
}

export type DocumentCategory =
  | "PAN"
  | "ADDRESS_PROOF"
  | "BANK_STATEMENT"
  | "INCOME_PROOF"
  | "PROPERTY_PAPERS"
  | "OTHER";

export type DocumentContentType = "application/pdf" | "image/jpeg" | "image/png";

/** The current file of a lead document (earlier versions are kept server-side). */
export interface DocumentFile {
  name: string;
  contentType: DocumentContentType;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

/** A document slot on a lead: one per checklist category, any number of OTHER. */
export interface LeadDocument {
  id: string;
  leadId: string;
  category: DocumentCategory;
  /** null until the first upload completes. */
  file: DocumentFile | null;
  /** 1 for the first upload, +1 for each replacement. */
  version: number;
  /** Open request (from Operations/Admin) to upload a better copy. */
  newCopyRequest: { by: string; byName: string; at: string } | null;
  commentCount: number;
  createdAt: string;
}

export interface DocumentComment {
  id: string;
  /** null once deleted: the text is removed, the entry stays. */
  body: string | null;
  authorId: string;
  authorName: string;
  authorRole: Role | null;
  requestsNewCopy: boolean;
  /** System notes (new copy uploaded, request resolved, file deleted). */
  system: boolean;
  deletedByName: string | null;
  createdAt: string;
}

export type DocumentActivityAction =
  | "UPLOADED"
  | "REPLACED"
  | "VIEWED"
  | "DELETED"
  | "PURGED"
  | "COPY_REQUESTED"
  | "REQUEST_RESOLVED"
  | "COMMENT_DELETED";

export interface DocumentActivity {
  id: string;
  action: DocumentActivityAction;
  documentId: string;
  category: DocumentCategory;
  userId: string;
  userName: string;
  at: string;
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
