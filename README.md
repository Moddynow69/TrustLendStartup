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
      auth/                  login, register, logout, me
      leads/                 CRUD, verification-status, status, timeline
      payouts/               list/get, process, status, timeline
      admin/                 leads, users
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
   - `FIREBASE_WEB_API_KEY`: a Web API key used **only on the server** to verify passwords. Create a dedicated one in Google Cloud Console → APIs & Services → Credentials, restricted to the Identity Toolkit API, and never expose it to the browser (no `NEXT_PUBLIC_` prefix).
   - A service account key (`FIREBASE_ADMIN_*`) from Project Settings → Service Accounts → Generate new private key.
4. Deploy Firestore rules/indexes: `firebase deploy --only firestore`
5. Bootstrap your first Admin account directly via the Firebase Console (Authentication tab → Add user), then manually add the matching Firestore doc at `users/{uid}` with `role: "ADMIN"`, `isActive: true`. Every other account is provisioned from the app afterward via `/admin/users`.

   Alternatively, run `npm run seed:users` to create a starter Admin (`admin` / `ADMINLOCK`) and DSA (`dsa` / `JustDoIt`) account in one shot — see `scripts/seed-users.js`. It reads `.env.local` directly and is safe to re-run (it updates the account if it already exists instead of failing).

   > **Note:** those two seed passwords don't satisfy the app's own password policy (letter + number, enforced only on `/api/auth/register` and password-reset), because the seed script talks to Firebase Auth directly and Firebase itself only requires 6+ characters. They'll work fine for logging in, but if you later reset either password *through the app's admin UI*, you'll need one that includes a number.

6. `npm run dev`

> **Upgrading an existing database:** payouts now carry a denormalized `createdBy` (the lead creator) so DSA/PARTNER payout lists can query it directly. Deploy the updated indexes (`firebase deploy --only firestore:indexes`), then run `npm run backfill:payouts` once so older payouts get the field. It's safe to re-run.

### Troubleshooting: "Failed to parse private key... Invalid PEM formatted message"

This means `FIREBASE_ADMIN_PRIVATE_KEY` isn't reaching the SDK as valid PEM text — it's an env-var formatting issue, not a code bug. Fixes, in order of likelihood:

- **Wrap the value in double quotes** in `.env.local` and paste the `private_key` field from the service account JSON exactly as-is (see the comment in `.env.example`).
- **Don't manually convert `\n` to real line breaks** — the code expects the literal two-character sequence `\n` and converts it itself. If your editor or a Windows tool "helpfully" expanded them into real newlines, only the first line survives when the env file is parsed.
- **Restart the dev server** after editing `.env.local` — Next.js doesn't hot-reload env vars.
- If you're on Vercel, paste the key into its dashboard's env var UI (which handles multi-line values natively) rather than a single-line input, or base64-encode the whole key and paste that — `lib/firebase/admin.ts` auto-detects and decodes a base64-encoded key too.

## How authentication works

The browser posts `{ identifier, password }` once to `POST /api/auth/login`, which does everything server-side:

1. Checks the failed-attempt limits (`lib/auth/rate-limit.ts`): 5 per account and 20 per IP per 15 minutes. Over the limit returns 429 before the password is tested.
2. Resolves the identifier (email or username) to the Firebase Auth email, looking up Firestore for username accounts.
3. Verifies the password with Firebase Auth's REST API (`lib/auth/password-sign-in.ts`, using the server-only `FIREBASE_WEB_API_KEY`) and gets an ID token.
4. Exchanges the ID token for a secure, http-only session cookie.

Unknown usernames, wrong passwords and disabled accounts all return the same 401, so login can't be used to discover which accounts exist. The browser never loads the Firebase SDK and never sees an API key, so the only way to test a password is through this rate-limited route, provided the old public browser key is restricted (see the note in setup).

Every subsequent API request is authenticated by verifying that session cookie server-side (`requireUser` / `requireRole` in `lib/auth/session.ts`), never by trusting anything the client sends about who it is.

## Business rules enforced server-side

- A lead cannot enter the Secured/Unsecured stage flow until `verificationStatus` is `GREEN` (`lib/business/status-flow.ts` + the `/status` route).
- Stage transitions are validated against a strict ordered array per `caseType` — skipping or reversing a stage is rejected with a 400. `REJECTED` is reachable from any non-terminal stage and always requires `rejectionReason`.
- A payout is only ever created when a lead's status becomes `DISBURSED`, in the same Firestore transaction as the status change. The admin must enter the lender's commission (% of the loan amount) to disburse; the lead's plan splits that commission, and the payout records the DSA/PARTNER's share (`calculatePayout` in `lib/business/payout-plans.ts`):
  - `commissionAmount = amount × commissionRate`
  - `payoutRate = 1 − adminShare` (e.g. 0.3 on the 70-30 plan)
  - `payoutAmount = commissionAmount × payoutRate`
- Every lead is created with a **payout rate plan** (`lib/business/payout-plans.ts`): `50-50`, `70-30`, `90-10`, or `PERSONALIZED`. The plan rate is the admin's share of the commission, reflecting how much processing work the admin takes on; the DSA/PARTNER gets the rest. `PERSONALIZED` resolves at disbursal time from the lead creator's `personalizedPayoutRate` (also an admin share) on their user profile, which only an admin can set (`/admin/users` → Manage user). A lead's plan is fixed once submitted; each plan option links out to its own terms page at `/terms/<plan>`.
- Role checks (`lib/business/permissions.ts`) gate every mutating endpoint: only OPERATIONS/ADMIN can set verification status; only ADMIN can progress case-type stages, process payouts, or manage users; DSA/PARTNER can only see their own leads and payouts.

## Known MVP simplifications (documented, not hidden)

- The login rate limiter (`lib/auth/rate-limit.ts`) keeps counts in each server instance's memory, so on Vercel the limits apply per warm instance rather than globally (Firebase Auth's own throttling still applies on top). Move it to a shared store such as Upstash Redis if you need exact global limits.
- `search` on the leads list does a Firestore prefix match on `customerName`; there's no full-text search. Pair with Algolia/Typesense if you need fuzzy search.
- There is no self-service password reset: users who forget their password ask an admin, who sets a new one in `/admin/users` → Manage user. (Username-only accounts have no real inbox, so email-based reset can't cover them anyway.)
