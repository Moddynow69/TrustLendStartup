"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiClientError } from "@/lib/api-client";
import { DASHBOARD_STATS_KEY } from "@/hooks/use-dashboard";
import type {
  DocumentActivity,
  DocumentCategory,
  DocumentComment,
  DocumentContentType,
  LeadDocument,
} from "@/types";

const docsKey = (leadId: string) => ["lead-documents", leadId] as const;
const commentsKey = (leadId: string, docId: string) => ["document-comments", leadId, docId] as const;

export function useLeadDocuments(leadId: string) {
  return useQuery({
    queryKey: docsKey(leadId),
    queryFn: () =>
      api.get<{ documents: LeadDocument[]; activity: DocumentActivity[] }>(`/api/leads/${leadId}/documents`),
  });
}

/** Sends the file straight to Storage through the signed link, reporting progress. */
function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiClientError("The upload was refused by storage. Try again.", xhr.status));
    xhr.onerror = () => reject(new ApiClientError("The upload failed. Check your connection and try again.", 0));
    xhr.send(file);
  });
}

export function useUploadDocument(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      category: DocumentCategory;
      /** Set to replace an existing document's file. */
      documentId?: string;
      onProgress: (fraction: number) => void;
    }) => {
      const start = await api.post<{
        documentId: string;
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
      }>(`/api/leads/${leadId}/documents`, {
        category: input.category,
        fileName: input.file.name,
        contentType: input.file.type as DocumentContentType,
        size: input.file.size,
        documentId: input.documentId,
      });
      await putToStorage(start.uploadUrl, start.uploadHeaders, input.file, input.onProgress);
      return api.post<{ document: LeadDocument }>(
        `/api/leads/${leadId}/documents/${start.documentId}/complete`
      );
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: docsKey(leadId) });
      if (input.documentId) qc.invalidateQueries({ queryKey: commentsKey(leadId, input.documentId) });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

/** Fetches a fresh 5-minute view link each time (never cached). */
export function fetchDocumentViewUrl(leadId: string, documentId: string) {
  return api.get<{ url: string; expiresInSeconds: number; contentType: DocumentContentType; name: string }>(
    `/api/leads/${leadId}/documents/${documentId}/url`
  );
}

export function useDeleteDocument(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentId: string; permanent?: boolean }) =>
      api.delete(`/api/leads/${leadId}/documents/${input.documentId}${input.permanent ? "?permanent=true" : ""}`),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: docsKey(leadId) });
      qc.invalidateQueries({ queryKey: commentsKey(leadId, input.documentId) });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export function useDocumentComments(leadId: string, documentId: string | null) {
  return useQuery({
    queryKey: commentsKey(leadId, documentId ?? ""),
    queryFn: () =>
      api.get<{ comments: DocumentComment[] }>(`/api/leads/${leadId}/documents/${documentId}/comments`),
    enabled: !!documentId,
  });
}

export function useAddComment(leadId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; requestNewCopy?: boolean }) =>
      api.post<{ comment: DocumentComment }>(`/api/leads/${leadId}/documents/${documentId}/comments`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(leadId, documentId) });
      qc.invalidateQueries({ queryKey: docsKey(leadId) });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export function useDeleteComment(leadId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/api/leads/${leadId}/documents/${documentId}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(leadId, documentId) });
      qc.invalidateQueries({ queryKey: docsKey(leadId) });
    },
  });
}

export function useResolveRequest(leadId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/leads/${leadId}/documents/${documentId}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(leadId, documentId) });
      qc.invalidateQueries({ queryKey: docsKey(leadId) });
      qc.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}
