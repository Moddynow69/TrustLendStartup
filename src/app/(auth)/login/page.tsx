import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            LB
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold text-ink-900">Loan Bandhu</h1>
            <p className="text-sm text-ink-400">Sign in to manage leads and payouts</p>
          </div>
        </div>

        <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-card">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-ink-300">
          Accounts are provisioned by your administrator.
        </p>
      </div>
    </div>
  );
}
