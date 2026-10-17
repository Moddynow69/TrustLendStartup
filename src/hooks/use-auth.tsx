"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Role } from "@/types";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  personalizedPayoutRate: number | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: SessionUser }>("/api/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    // The server verifies the password (rate-limited) and sets the session
    // cookie; errors surface as ApiClientError (401/403/429).
    const { user } = await api.post<{ user: SessionUser }>("/api/auth/login", {
      identifier,
      password,
    });
    // Query keys aren't scoped by user, so drop anything cached under a
    // previous session (including one that expired without a logout)
    // before the new user's pages read from the cache.
    queryClient.clear();
    setUser(user);
  }, [queryClient]);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUser(null);
    // Don't leave this user's leads/payouts/users in memory for whoever
    // signs in next on the same tab.
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
