"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

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
        err instanceof ApiClientError && (err.status === 403 || err.status === 429)
          ? err.message
          : "Invalid credentials. Check your email/username and password.";
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
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

      {/* Accounts are admin-provisioned (and username-only accounts have no
          real inbox), so resets go through an admin in User Management. */}
      <p className="text-sm text-ink-500">Forgot your password? Ask your administrator to reset it.</p>

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
