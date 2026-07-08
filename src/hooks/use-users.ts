"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Role, UserProfile } from "@/types";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: UserProfile[] }>("/api/admin/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      email?: string;
      username?: string;
      password: string;
      role: Role;
    }) => api.post<{ user: UserProfile }>("/api/admin/users", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name?: string;
      role?: Role;
      isActive?: boolean;
      newPassword?: string;
    }) => api.patch<{ user: UserProfile }>(`/api/admin/users/${userId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
