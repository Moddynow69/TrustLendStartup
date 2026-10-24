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
      auth/                  login, logout, me
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
   - `FIREBASE_WEB_API_KEY`: a Web API key used **only on the server** to check passwords (see "How authentication works").
   - A service account key (`FIREBASE_ADMIN_*`) from Project Settings → Service Accounts → Generate new private key.
4. Deploy Firestore rules/indexes: `firebase deploy --only firestore`
5. Bootstrap your first Admin account directly via the Firebase Console (Authentication tab → Add user), then manually add the matching Firestore doc at `users/{uid}` with `role: "ADMIN"`, `isActive: true`. Every other account is provisioned from the app afterward via `/admin/users`.

   Alternatively, run `npm run seed:users` to create a starter Admin (`admin`) and DSA (`dsa`) account in one shot (see `scripts/seed-users.js`). Each new account gets a **random password, printed once**; save it and change it after first login. Re-running it never touches accounts that already exist.

6. `npm run dev`

> **Upgrading an existing database:** payouts now carry a denormalized `createdBy` (the lead creator) so DSA/PARTNER payout lists can query it directly. Deploy the updated indexes (`firebase deploy --only firestore:indexes`), then run `npm run backfill:payouts` once so older payouts get the field. It's safe to re-run.

### Troubleshooting: "Failed to parse private key... Invalid PEM formatted message"

This means `FIREBASE_ADMIN_PRIVATE_KEY` isn't reaching the SDK as valid PEM text — it's an env-var formatting issue, not a code bug. Fixes, in order of likelihood:

- **Wrap the value in double quotes** in `.env.local` and paste the `private_key` field from the service account JSON exactly as-is (see the comment in `.env.example`).
- **Don't manually convert `\n` to real line breaks** — the code expects the literal two-character sequence `\n` and converts it itself. If your editor or a Windows tool "helpfully" expanded them into real newlines, only the first line survives when the env file is parsed.
- **Restart the dev server** after editing `.env.local` — Next.js doesn't hot-reload env vars.
- If you're on Vercel, paste the key into its dashboard's env var UI (which handles multi-line values natively) rather than a single-line input, or base64-encode the whole key and paste that — `lib/firebase/admin.ts` auto-detects and decodes a base64-encoded key too.

## How authentication works

Accounts live in Firebase Auth. The browser never talks to Firebase: it posts `{ identifier, password }` once to `POST /api/auth/login`, which does everything server-side:

1. **Checks the failure limits** (`lib/auth/login-limits.ts`): 5 failed attempts per account and 20 per IP in 15 minutes, counted in **Supabase Postgres** so every server instance shares them. Over the limit returns 429 before the password is tested.
2. Resolves the identifier (email or username) to the Firebase Auth email.
3. **Checks the password** with Firebase Auth's REST API (`lib/auth/password-sign-in.ts`) using the server-only `FIREBASE_WEB_API_KEY`, and gets an ID token.
4. Exchanges the ID token for a secure, http-only session cookie.

Unknown usernames, wrong passwords and disabled accounts all return the same 401, so login can't be used to discover which accounts exist. Every attempt is recorded in Supabase (`private.login_events`: time, identifier, IP, outcome) and kept 90 days.

If Supabase is unreachable or its free project is paused, login still works without the extra limit (Firebase still throttles repeated failures on an account) and the server logs a warning, rather than locking everyone out.

**Closing the direct route:** the old public key (`NEXT_PUBLIC_FIREBASE_API_KEY`) was shipped to browsers, so anyone could use it to send passwords straight to Firebase and skip these limits. After deploying with `FIREBASE_WEB_API_KEY` set, restrict that old key in Google Cloud Console → APIs & Services → Credentials so it can't call the Identity Toolkit API.

### Setting up login limits (one-time, free)

1. Supabase must already be set up (see "Setting up document storage").
2. Supabase → SQL Editor → paste and run [`supabase/login-limits.sql`](supabase/login-limits.sql). It's safe to re-run.
3. To see the login history: Supabase → Table Editor → schema `private` → `login_events`.

Every subsequent API request is authenticated by verifying that session cookie server-side (`requireUser` / `requireRole` in `lib/auth/session.ts`), never by trusting anything the client sends about who it is.

## Business rules enforced server-side

- A lead cannot enter the Secured/Unsecured stage flow until `verificationStatus` is `GREEN` (`lib/business/status-flow.ts` + the `/status` route).
- Stage transitions are validated against a strict ordered array per `caseType` — skipping or reversing a stage is rejected with a 400. `REJECTED` is reachable from any non-terminal stage and always requires `rejectionReason`.
- A payout is only ever created when a lead's status becomes `DISBURSED`, in the same Firestore transaction as the status change. The admin must enter the lender's commission (% of the loan amount) to disburse; the lead's plan splits that commission, and the payout records the DSA/PARTNER's share (`calculatePayout` in `lib/business/payout-plans.ts`):
  - `commissionAmount = amount × commissionRate`
  - `payoutRate = 1 − adminShare` (e.g. 0.3 on the 70-30 plan)
  - `payoutAmount = commissionAmount × payoutRate`
- Every lead is created with a **payout rate plan** (`lib/business/payout-plans.ts`): `50-50`, `70-30`, `90-10`, or `PERSONALIZED`. The plan rate is the admin's share of the commission, reflecting how much processing work the admin takes on; the DSA/PARTNER gets the rest. `PERSONALIZED` resolves at disbursal time from the `personalizedPayoutRate` (also an admin share) of the lead's assignee, which only an admin can set (`/admin/users` → Manage user). A lead's plan is fixed once submitted; each plan option links out to its own terms page at `/terms/<plan>`.
- Role checks (`lib/business/permissions.ts`) gate every mutating endpoint: only OPERATIONS/ADMIN can set verification status; only ADMIN can progress case-type stages, process payouts, or manage users; DSA/PARTNER can only see their own leads and payouts.
- **Lead ownership:** a new lead is assigned to its creator. Only an ADMIN can reassign it (`PATCH /api/leads/[id]/assignee`), and only to an active DSA/PARTNER while the lead is still open; on the `PERSONALIZED` plan the new assignee must have a personalized rate. DSA/PARTNER see leads they created **or** are assigned to. When a lead is disbursed, its **current assignee** is paid (`payeeId` on the payout) and sees the payout; the creator, if different, does not.
- **Payout visibility:** DSA/PARTNER see payouts paid to them; OPERATIONS can view all payouts read-only; only ADMIN can change a payout's status.

## Lead documents and comments

Customer documents (PAN, address proof, bank statements, income proof, property papers, other) attach to each lead and live in a **private Supabase Storage bucket** (free plan). Only the server talks to Supabase, using the secret key; browsers only ever receive short-lived signed links, issued after the server checks lead access.

- **Upload:** `POST /api/leads/{id}/documents` checks access, type (PDF/JPG/PNG) and size (10 MB) and returns a one-time upload link; the browser uploads straight to Supabase, so files never pass through the server. The bucket itself also enforces the size limit and file types. `POST …/{docId}/complete` then checks the stored file's size, type and first bytes before saving it. Large phone photos are shrunk in the browser first (longer side 2000 px, JPEG) so the free storage lasts longer.
- **View:** `GET …/{docId}/url` re-checks access, logs the view and returns a 5-minute read link.
- **Who:** anyone who can see the lead (creator or assignee DSA/Partner, Operations, Admin) can view, upload and comment while it's open. DSA/Partner can delete their own uploads until the lead is Green; Admins can delete any; disbursed/rejected leads are read-only. Rules: `lib/business/documents.ts` (unit-tested).
- **Comments:** each document has a thread (`…/{docId}/comments`). Operations/Admin can tick "Ask for a new copy"; a replacement upload (or "Mark resolved") clears it. Open requests are counted on the lead (`openDocumentRequests`) for the dashboard.
- **Deleting:** soft by default (the file stays for the audit trail). Admins can delete permanently (`?permanent=true`) for erasure requests: every version and the comment text are removed.
- **Data layout:** file records in Firestore at `leads/{id}/documents/{docId}` (docId = category for checklist slots), with `comments` beneath and `leads/{id}/documentActivity` for uploads, views and deletions. Files in Supabase at `leads/{leadId}/{docId}/{timestamp}-{name}`. All Supabase-specific code is in `lib/storage/documents-storage.ts`.

### Setting up document storage (one-time, free)

1. Create a free project at [supabase.com](https://supabase.com) (no card needed), region **South Asia (Mumbai)**.
2. Supabase → Project Settings → API: copy the project URL and the **secret key** (`service_role` on older projects) into `.env.local` and your hosting provider as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never put the secret key in browser code or Git.
3. Create the private bucket with its limits: `npm run setup:documents-storage`
4. No CORS setup is needed; Supabase accepts uploads from any site with a valid signed link.

**Free plan limits:** about 1 GB of files and 5 GB of downloads a month (check supabase.com/pricing). When storage is full, uploads are refused with a clear message. Free projects **pause after a week with no activity**; restore them from the Supabase dashboard.

## Known MVP simplifications (documented, not hidden)

- Lead documents: abandoned uploads (started but never completed) and documents past their retention period are not yet cleaned up automatically; there's no malware scanning and no notifications for new-copy requests yet. Supabase's signed upload links stay valid for 2 hours (not configurable); the server still verifies every file before accepting it.

- Login limits: someone who knows a username can lock that account out for 15 minutes by entering 5 wrong passwords. Disabled Firebase accounts see "Invalid credentials" rather than "account disabled".
- `search` on the leads list does a Firestore prefix match on `customerName`; there's no full-text search. Pair with Algolia/Typesense if you need fuzzy search.
- There is no self-service password reset: users who forget their password ask an admin, who sets a new one in `/admin/users` → Manage user. (Username-only accounts have no real inbox, so email-based reset can't cover them anyway.)
