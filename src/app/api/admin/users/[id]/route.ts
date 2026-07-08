import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminAuth, adminDb, COLLECTIONS } from "@/lib/firebase/admin";
import { updateUserSchema } from "@/lib/validations/users";
import { handleApiError, NotFoundError } from "@/lib/api-response";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = updateUserSchema.parse(await req.json());

    const ref = adminDb.collection(COLLECTIONS.users).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundError("User not found");

    const firestoreUpdates: Record<string, unknown> = {};
    if (body.name) firestoreUpdates.name = body.name;
    if (body.role) firestoreUpdates.role = body.role;
    if (typeof body.isActive === "boolean") firestoreUpdates.isActive = body.isActive;

    if (Object.keys(firestoreUpdates).length > 0) {
      await ref.update(firestoreUpdates);
    }

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
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
