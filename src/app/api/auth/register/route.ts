import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, COLLECTIONS, FieldValue } from "@/lib/firebase/admin";
import { registerSchema } from "@/lib/validations/auth";
import { requireRole } from "@/lib/auth/session";
import { usernameToSyntheticEmail } from "@/lib/auth/identifier";
import { handleApiError, ConflictError } from "@/lib/api-response";

/**
 * Admin-only account provisioning. DSA/PARTNER/OPERATIONS/ADMIN accounts are
 * all created this way (Section 3: "provisioned by Admin" / "super-admin").
 * There is no public self-service sign-up endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const body = registerSchema.parse(await req.json());

    const email = body.email?.toLowerCase() || usernameToSyntheticEmail(body.username!);

    const existing = await adminDb
      .collection(COLLECTIONS.users)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new ConflictError("An account with this email or username already exists");
    }

    const userRecord = await adminAuth.createUser({
      email,
      password: body.password,
      displayName: body.name,
      disabled: false,
    });

    await adminDb.collection(COLLECTIONS.users).doc(userRecord.uid).set({
      name: body.name,
      email,
      username: body.username?.toLowerCase() ?? null,
      role: body.role,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: admin.id,
    });

    return NextResponse.json(
      { user: { id: userRecord.uid, name: body.name, email, role: body.role } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
