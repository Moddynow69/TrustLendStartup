import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import { getLeadById } from "@/lib/db/leads";
import { handleApiError } from "@/lib/api-response";
import { z } from "zod";

const adminLeadUpdateSchema = z.object({
  assignedTo: z.string().min(1).optional(),
  bank: z.string().min(2).optional(),
  productType: z.string().min(2).optional(),
  note: z.string().optional(),
});

/**
 * Admin-only edit of non-status lead fields (e.g. reassigning ownership,
 * correcting bank/product data). Status and verificationStatus transitions
 * go through their dedicated, rule-validated endpoints instead.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = adminLeadUpdateSchema.parse(await req.json());
    await getLeadById(params.id); // 404s if missing

    const { note, ...fields } = body;
    const ref = adminDb.collection(COLLECTIONS.leads).doc(params.id);
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });

    if (note) {
      await ref.collection("logs").add({
        status: "ADMIN_NOTE",
        note,
        updatedBy: admin.id,
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    const updated = await getLeadById(params.id);
    return NextResponse.json({ lead: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
