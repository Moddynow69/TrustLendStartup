import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { handleApiError } from "@/lib/api-response";

/**
 * Generates a Firebase Auth password reset link. In production, wire this
 * into Firebase's email delivery (or send the link yourself via a transactional
 * email provider). The response is intentionally identical whether or not the
 * email exists, so this endpoint can't be used to enumerate accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = forgotPasswordSchema.parse(await req.json());

    try {
      const link = await adminAuth.generatePasswordResetLink(email);
      // TODO: send `link` via your transactional email provider (e.g. SendGrid, SES).
      console.log(`[password-reset] generated link for ${email}`);
      void link;
    } catch {
      // Swallow "user not found" and similar errors to avoid account enumeration.
    }

    return NextResponse.json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
