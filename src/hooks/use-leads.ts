"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Lead, LeadLog, PaginatedResult } from "@/types";
import { DASHBOARD_STATS_KEY } from "@/hooks/use-dashboard";

export interface LeadFiltersInput {
  verificationStatus?: string;
  status?: string;
  caseType?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

function buildQuery(filters: LeadFiltersInput): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** The server scopes results by role: DSA/PARTNER get their own leads,
 * OPERATIONS/ADMIN get all leads. */
export function useLeads(filters: LeadFiltersInput = {}) {
  return useQuery({
    queryKey: ["leads", filters],
    // Keep the current rows on screen while a new search/filter/page loads.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<PaginatedResult<Lead>>(`/api/leads${buildQuery(filters)}`),
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () =>
      api.get<{ lead: Lead; people: { createdByName: string | null; assignedToName: string | null } }>(
        `/api/leads/${id}`
      ),
    enabled: !!id,
  });
}

export function useLeadTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-timeline", id],
    queryFn: () => api.get<{ logs: LeadLog[] }>(`/api/leads/${id}/timeline`),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      customerName: string;
      productType: string;
      amount: number;
      bank: string;
      caseType: "SECURED" | "UNSECURED";
      selectedPlan: "50-50" | "70-30" | "90-10" | "PERSONALIZED";
    }) => api.post<{ lead: Lead }>("/api/leads", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export function useSetVerificationStatus(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { verificationStatus: "RED" | "YELLOW" | "GREEN"; note?: string }) =>
      api.patch<{ lead: Lead }>(`/api/leads/${leadId}/verification-status`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export function useUpdateLeadStatus(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status: string;
      rejectionReason?: string;
      note?: string;
      /** Lender commission as a percent; required for DISBURSED. */
      commissionRate?: number;
    }) =>
      api.patch<{ lead: Lead }>(`/api/leads/${leadId}/status`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["payouts"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

/** Admin-only: hand a lead to another DSA/PARTNER. */
export function useReassignLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { assignedTo: string; note?: string }) =>
      api.patch<{ lead: Lead }>(`/api/leads/${leadId}/assignee`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}
