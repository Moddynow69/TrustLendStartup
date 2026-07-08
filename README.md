# Loan Bandhu

CRM and payout tracking platform for loan agents (DSA), partners, operations, and admins.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query
- **Backend:** Next.js Route Handlers (App Router), Firebase Auth + Firestore via the Admin SDK
- **Deploy:** Vercel (app) + Firebase (Auth/Firestore)

## Project structure

```
src/
  app/
    (auth)/login/            Public login page
    (dashboard)/             Auth-guarded shell (sidebar + pages)
      dashboard/             Role-aware summary dashboard
      leads/                 Lead list + detail + timeline
      payouts/               Payout list + detail
      admin/                 Admin lead overview
      admin/users/           Admin user management
    api/
      auth/                  login, register, forgot-password, logout, me
      leads/                 CRUD, verification-status, status, timeline
      payouts/               list/get, process, status, timeline
      admin/                 leads, users, payouts/process-all
    providers.tsx            React Query + Auth context
    layout.tsx / globals.css
  components/                UI primitives, leads, payouts, admin, layout
  hooks/                     useAuth, useLeads, usePayouts, useUsers
  lib/
    firebase/                client.ts (browser SDK), admin.ts (Admin SDK, server-only)
    auth/                    session cookie issuance/verification, rate limiting
    business/                status-flow.ts (Secured/Unsecured stage machine), permissions.ts
    db/                      Firestore repository functions for leads/payouts
    validations/             Zod schemas for every mutating endpoint
  types/                     Shared domain types
  middleware.ts              Edge-level route guard (cookie presence check)
firestore.rules              Locks out all direct client access (Admin SDK bypasses this)
firestore.indexes.json       Composite indexes required by the filter queries
```

## Local setup

1. `npm install`
2. Create a Firebase project → enable **Authentication → Email/Password** and **Firestore**.
3. Copy `.env.example` to `.env.local` and fill in:
   - The web app config (`NEXT_PUBLIC_FIREBASE_*`) from Project Settings → General.
   - A service account key (`FIREBASE_ADMIN_*`) from Project Settings → Service Accounts → Generate new private key.
4. Deploy Firestore rules/indexes: `firebase deploy --only firestore`
5. Bootstrap your first Admin account directly via the Firebase Console (Authentication tab → Add user), then manually add the matching Firestore doc at `users/{uid}` with `role: "ADMIN"`, `isActive: true`. Every other account is provisioned from the app afterward via `/admin/users`.

   Alternatively, run `npm run seed:users` to create a starter Admin (`admin` / `ADMINLOCK`) and DSA (`dsa` / `JustDoIt`) account in one shot — see `scripts/seed-users.js`. It reads `.env.local` directly and is safe to re-run (it updates the account if it already exists instead of failing).

   > **Note:** those two seed passwords don't satisfy the app's own password policy (letter + number, enforced only on `/api/auth/register` and password-reset), because the seed script talks to Firebase Auth directly and Firebase itself only requires 6+ characters. They'll work fine for logging in, but if you later reset either password *through the app's admin UI*, you'll need one that includes a number.

6. `npm run dev`

### Troubleshooting: "Failed to parse private key... Invalid PEM formatted message"

This means `FIREBASE_ADMIN_PRIVATE_KEY` isn't reaching the SDK as valid PEM text — it's an env-var formatting issue, not a code bug. Fixes, in order of likelihood:

- **Wrap the value in double quotes** in `.env.local` and paste the `private_key` field from the service account JSON exactly as-is (see the comment in `.env.example`).
- **Don't manually convert `\n` to real line breaks** — the code expects the literal two-character sequence `\n` and converts it itself. If your editor or a Windows tool "helpfully" expanded them into real newlines, only the first line survives when the env file is parsed.
- **Restart the dev server** after editing `.env.local` — Next.js doesn't hot-reload env vars.
- If you're on Vercel, paste the key into its dashboard's env var UI (which handles multi-line values natively) rather than a single-line input, or base64-encode the whole key and paste that — `lib/firebase/admin.ts` auto-detects and decodes a base64-encoded key too.

## How authentication works

Firebase Auth's Admin SDK can create/manage users but cannot verify a password directly, so login is a 3-step exchange, all orchestrated by `useAuth().login()`:

1. Client posts the typed identifier (email or username) to `POST /api/auth/login` → server resolves it to the real Firebase Auth email (looking up Firestore for username accounts).
2. Client calls `signInWithEmailAndPassword` against the **Firebase JS SDK** directly — this is the step that actually checks the password — and gets an ID token.
3. Client posts that ID token back to `POST /api/auth/login` → server verifies it via the Admin SDK and mints a secure, http-only session cookie.

Every subsequent API request is authenticated by verifying that session cookie server-side (`requireUser` / `requireRole` in `lib/auth/session.ts`), never by trusting anything the client sends about who it is.

## Business rules enforced server-side

- A lead cannot enter the Secured/Unsecured stage flow until `verificationStatus` is `GREEN` (`lib/business/status-flow.ts` + the `/status` route).
- Stage transitions are validated against a strict ordered array per `caseType` — skipping or reversing a stage is rejected with a 400. `REJECTED` is reachable from any non-terminal stage and always requires `rejectionReason`.
- A payout is only ever created when a lead's status becomes `DISBURSED`, and `payoutAmount = amount * payoutRate` (`lib/db/payouts.ts`).
- Role checks (`lib/business/permissions.ts`) gate every mutating endpoint: only OPERATIONS/ADMIN can set verification status; only ADMIN can progress case-type stages, process payouts, or manage users; DSA/PARTNER can only see their own leads and payouts.

## Known MVP simplifications (documented, not hidden)

- The login rate limiter (`lib/auth/rate-limit.ts`) is in-memory, which is fine for a single Vercel instance but won't share state across concurrently-scaled serverless functions — swap in Upstash/Redis before you need real brute-force protection at scale.
- `search` on the leads list does a Firestore prefix match on `customerName`; there's no full-text search. Pair with Algolia/Typesense if you need fuzzy search.
- The default payout rate (1%) is a placeholder constant in `app/api/leads/[id]/status/route.ts` — wire this to a real per-product/per-partner rate table before going live.
- Password reset emails are generated via `adminAuth.generatePasswordResetLink` but not actually delivered — plug in your transactional email provider where the `TODO` is in `app/api/auth/forgot-password/route.ts`.
