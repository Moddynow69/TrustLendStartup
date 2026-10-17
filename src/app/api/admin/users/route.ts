import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminAuth, adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import { createUserSchema } from "@/lib/validations/users";
import { usernameToSyntheticEmail } from "@/lib/auth/identifier";
import { handleApiError, ConflictError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const snap = await adminDb.collection(COLLECTIONS.users).orderBy("createdAt", "desc").get();
    const users = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        email: data.email,
        username: data.username ?? null,
        role: data.role,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt,
        personalizedPayoutRate: typeof data.personalizedPayoutRate === "number" ? data.personalizedPayoutRate : null,
      };
    });
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Admin-only account provisioning (there is no public sign-up). Creates the
 * Firebase Auth login, then the Firestore profile; if the profile write
 * fails, the login is deleted again so no half-made account is left behind
 * and the admin can simply retry.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = createUserSchema.parse(await req.json());
    const email = body.email?.toLowerCase() || usernameToSyntheticEmail(body.username!);

    const existing = await adminDb
      .collection(COLLECTIONS.users)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new ConflictError("An account with this email or username already exists");
    }

    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password: body.password,
        displayName: body.name,
        disabled: false,
      });
    } catch (err) {
      // A Firebase login can exist without a Firestore profile (e.g. one
      // created by hand in the Firebase Console), so the check above can miss it.
      if ((err as { code?: string }).code === "auth/email-already-exists") {
        throw new ConflictError(
          "A login with this email or username already exists in Firebase Auth. Remove it in the Firebase Console or use a different one."
        );
      }
      throw err;
    }

    try {
      await adminDb.collection(COLLECTIONS.users).doc(userRecord.uid).set({
        name: body.name,
        email,
        username: body.username?.toLowerCase() ?? null,
        role: body.role,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: admin.id,
      });
    } catch (err) {
      // Roll back the login so it isn't left without a profile.
      await adminAuth.deleteUser(userRecord.uid).catch((cleanupErr) => {
        console.error("[admin-users] failed to roll back auth user", userRecord.uid, cleanupErr);
      });
      throw err;
    }

    return NextResponse.json(
      { user: { id: userRecord.uid, name: body.name, email, role: body.role, isActive: true } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
