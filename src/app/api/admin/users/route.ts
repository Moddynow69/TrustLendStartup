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
      };
    });
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Same provisioning logic as /api/auth/register, exposed under /admin for the user-management UI. */
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
      { user: { id: userRecord.uid, name: body.name, email, role: body.role, isActive: true } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
