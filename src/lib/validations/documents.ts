import { z } from "zod";
import { MAX_COMMENT_LENGTH, MAX_DOCUMENT_BYTES } from "@/lib/business/documents";

export const documentCategorySchema = z.enum([
  "PAN",
  "ADDRESS_PROOF",
  "BANK_STATEMENT",
  "INCOME_PROOF",
  "PROPERTY_PAPERS",
  "OTHER",
]);

export const startUploadSchema = z.object({
  category: documentCategorySchema,
  fileName: z.string().trim().min(1, "The file needs a name").max(255),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"], {
    errorMap: () => ({ message: "Only PDF, JPG and PNG files can be uploaded." }),
  }),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, "The limit is 10 MB per file."),
  /** Present when replacing the file of an existing document. */
  documentId: z.string().min(1).optional(),
});

export const addCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a comment first")
    .max(MAX_COMMENT_LENGTH, `Comments can be up to ${MAX_COMMENT_LENGTH} characters`),
  requestNewCopy: z.boolean().optional(),
});
