"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Lead, LeadLog, PaginatedResult } from "@/types";

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

export function useLeads(filters: LeadFiltersInput = {}, adminScope = false) {
  const base = adminScope ? "/api/admin/leads" : "/api/leads";
  return useQuery({
    queryKey: ["leads", adminScope, filters],
    queryFn: () => api.get<PaginatedResult<Lead>>(`${base}${buildQuery(filters)}`),
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => api.get<{ lead: Lead }>(`/api/leads/${id}`),
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
      assignedTo: string;
    }) => api.post<{ lead: Lead }>("/api/leads", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
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
    },
  });
}

export function useUpdateLeadStatus(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: string; rejectionReason?: string; note?: string }) =>
      api.patch<{ lead: Lead }>(`/api/leads/${leadId}/status`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["payouts"] });
    },
  });
}
