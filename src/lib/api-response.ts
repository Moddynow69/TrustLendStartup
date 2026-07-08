import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/**
 * Central error-to-HTTP-response mapper for API routes. Never leaks stack
 * traces or internal details; logs server-side only.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.flatten() },
      { status: 400 }
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof BadRequestError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof Error) {
    console.error("[api-error]", err.message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  console.error("[api-error] unknown", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
