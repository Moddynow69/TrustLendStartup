import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import { getLeadById } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";
import { z } from "zod";
import { isRegisteredLender } from "@/lib/lenders";

// Reassignment goes through PATCH /api/leads/[id]/assignee, which validates it.
const adminLeadUpdateSchema = z.object({
  bank: z
    .string()
    .min(2)
    .refine(isRegisteredLender, "Select a bank, NBFC or ARC from the list")
    .optional(),
  productType: z.string().min(2).optional(),
  note: z.string().optional(),
});

/**
 * Admin-only correction of lead data (bank, product type). Status,
 * verification and assignee changes go through their dedicated,
 * rule-validated endpoints instead.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = adminLeadUpdateSchema.parse(await req.json());
    await getLeadById(params.id); // 404s if missing

    const { note, ...fields } = body;
    const ref = adminDb.collection(COLLECTIONS.leads).doc(params.id);
    const now = FieldValue.serverTimestamp();

    // One batch, so the edit and its timeline note are saved together.
    const batch = adminDb.batch();
    batch.update(ref, { ...fields, updatedAt: now });
    if (note) {
      batch.set(ref.collection("logs").doc(), {
        status: "ADMIN_NOTE",
        note,
        updatedBy: admin.id,
        timestamp: now,
      });
    }
    await batch.commit();

    const updated = await getLeadById(params.id);
    return NextResponse.json({ lead: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
