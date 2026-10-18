"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardStats } from "@/types";

/** Query key for the dashboard counts; lead and payout mutations invalidate it. */
export const DASHBOARD_STATS_KEY = ["dashboard-stats"] as const;

export function useDashboardStats() {
  return useQuery({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: () => api.get<{ stats: DashboardStats }>("/api/dashboard"),
  });
}
