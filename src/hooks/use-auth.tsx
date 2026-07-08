"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";
import { api, ApiClientError } from "@/lib/api-client";
import type { Role } from "@/types";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
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
    // Step 1: resolve identifier -> the real email on file.
    const { email } = await api.post<{ email: string }>("/api/auth/login", { identifier });

    // Step 2: authenticate with the Firebase client SDK (this is where the
    // password is actually verified) to obtain an ID token.
    let idToken: string;
    try {
      const cred = await signInWithEmailAndPassword(clientAuth, email, password);
      idToken = await cred.user.getIdToken();
    } catch {
      throw new ApiClientError("Invalid credentials", 401);
    }

    // Step 3: exchange the ID token for a secure session cookie.
    const { user } = await api.post<{ user: SessionUser }>("/api/auth/login", {
      idToken,
      identifier,
    });
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    try {
      await firebaseSignOut(clientAuth);
    } catch {
      // best-effort; server session is already cleared
    }
    setUser(null);
  }, []);

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
