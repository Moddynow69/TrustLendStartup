"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Payout, PayoutLog, PaginatedResult } from "@/types";

export function usePayouts(filters: { status?: string; cursor?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v && params.set(k, String(v)));
  const qs = params.toString();

  return useQuery({
    queryKey: ["payouts", filters],
    queryFn: () => api.get<PaginatedResult<Payout>>(`/api/payouts${qs ? `?${qs}` : ""}`),
  });
}

export function usePayout(id: string | undefined) {
  return useQuery({
    queryKey: ["payout", id],
    queryFn: () => api.get<{ payout: Payout }>(`/api/payouts/${id}`),
    enabled: !!id,
  });
}

export function usePayoutTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ["payout-timeline", id],
    queryFn: () => api.get<{ logs: PayoutLog[] }>(`/api/payouts/${id}/timeline`),
    enabled: !!id,
  });
}

export function useUpdatePayoutStatus(payoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "PENDING" | "APPROVED" | "PAID" | "HOLD") =>
      api.patch<{ payout: Payout }>(`/api/payouts/${payoutId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payout", payoutId] });
      qc.invalidateQueries({ queryKey: ["payouts"] });
    },
  });
}

export function useProcessAllPayouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payoutRate?: number) =>
      api.post<{ processedCount: number }>("/api/admin/payouts/process-all", { payoutRate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payouts"] }),
  });
}
