import { AppError } from "@/server/utils/errors";

export type SupportedDocumentType =
  | "PURCHASE_INVOICE"
  | "SALES_RECEIPT"
  | "CUSTOMER_ORDER"
  | "EXPENSE_RECEIPT";

export interface DocumentUploadInput {
  businessId: string;
  documentType: SupportedDocumentType;
  fileName: string;
  mimeType: string;
}

/**
 * Document Service (Phase 3)
 * Manages private document storage, Gemini multimodal extraction,
 * Zod schema validation, product alias matching, and user-confirmed posting
 * through transactionService.
 */
export const documentService = {
  async registerUpload(input: DocumentUploadInput): Promise<never> {
    void input;
    throw new AppError("Document processing will be implemented in Phase 3.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
