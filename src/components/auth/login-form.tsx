"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api, ApiClientError } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (identifier.trim().length < 3) next.identifier = "Enter your email or username";
    if (password.length < 1) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});
    try {
      await login(identifier, password);
      toast.success("Welcome back");
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiClientError && err.status === 403
          ? err.message
          : "Invalid credentials. Check your email/username and password.";
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  }

  if (forgotOpen) {
    return <ForgotPasswordForm onBack={() => setForgotOpen(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="Email or username"
        placeholder="you@company.com"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={errors.identifier}
        autoComplete="username"
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="current-password"
      />

      {errors.form && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-red">
          {errors.form}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setForgotOpen(true)}
          className="focus-ring text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await api.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-ink-600">
          If an account exists for <span className="font-medium text-ink-900">{email}</span>, a reset link is on its way.
        </p>
        <Button variant="secondary" onClick={onBack} className="w-full">
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-sm text-ink-500">Enter the email on your account and we'll send a reset link.</p>
      <Input
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="submit" loading={loading} className="flex-1">
          Send reset link
        </Button>
      </div>
    </form>
  );
}
