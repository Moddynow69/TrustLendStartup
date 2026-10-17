import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminAuth, adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import { updateUserSchema } from "@/lib/validations/users";
import { handleApiError, NotFoundError, BadRequestError } from "@/lib/api-response";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = updateUserSchema.parse(await req.json());

    const ref = adminDb.collection(COLLECTIONS.users).doc(params.id);
    const firestoreUpdates: FirebaseFirestore.DocumentData = {};
    if (body.name) firestoreUpdates.name = body.name;
    if (body.role) firestoreUpdates.role = body.role;
    if (typeof body.isActive === "boolean") firestoreUpdates.isActive = body.isActive;
    if (body.personalizedPayoutRate !== undefined) {
      // Stored as a 0-1 decimal; the admin UI collects a 0-100 percent.
      firestoreUpdates.personalizedPayoutRate =
        body.personalizedPayoutRate === null ? null : body.personalizedPayoutRate / 100;
    }

    // Checked and written in one transaction so two admins demoting or
    // disabling each other at the same moment can't both succeed and leave
    // nobody able to manage the app.
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundError("User not found");
      const current = snap.data()!;

      const losesAdmin =
        current.role === "ADMIN" &&
        current.isActive &&
        ((body.role !== undefined && body.role !== "ADMIN") || body.isActive === false);

      if (losesAdmin && params.id === admin.id) {
        throw new BadRequestError(
          "You can't disable your own account or remove your own Admin role. Ask another admin to do it."
        );
      }
      if (losesAdmin) {
        const activeAdmins = await tx.get(
          adminDb
            .collection(COLLECTIONS.users)
            .where("role", "==", "ADMIN")
            .where("isActive", "==", true)
        );
        if (activeAdmins.size <= 1) {
          throw new BadRequestError(
            "This is the only active admin. Make another user an admin first."
          );
        }
      }

      if (Object.keys(firestoreUpdates).length > 0) {
        tx.update(ref, firestoreUpdates);
      }
    });

    // Mirror isActive/displayName into Firebase Auth so a disabled account
    // truly cannot sign in (Firestore isActive alone only gates API access).
    const authUpdates: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") authUpdates.disabled = !body.isActive;
    if (body.name) authUpdates.displayName = body.name;
    if (body.newPassword) authUpdates.password = body.newPassword;
    if (Object.keys(authUpdates).length > 0) {
      await adminAuth.updateUser(params.id, authUpdates);
    }
    if (body.newPassword || typeof body.isActive === "boolean") {
      // Force re-authentication after a password reset or deactivation.
      await adminAuth.revokeRefreshTokens(params.id);
    }

    const updated = await ref.get();
    const data = updated.data()!;
    return NextResponse.json({
      user: {
        id: updated.id,
        name: data.name,
        email: data.email,
        username: data.username ?? null,
        role: data.role,
        isActive: data.isActive,
        personalizedPayoutRate: typeof data.personalizedPayoutRate === "number" ? data.personalizedPayoutRate : null,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
