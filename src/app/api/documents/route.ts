import type { NextRequest } from "next/server";
import { documentService } from "@/server/services/document.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { ValidationError } from "@/server/utils/errors";
import { documentTypeSchema } from "@/server/validations/document-extraction";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get("page") ?? "1") || 1;
    const pageSize = Math.min(100, Number(sp.get("pageSize") ?? "20") || 20);
    const rawType = sp.get("documentType");
    const documentType = rawType ? documentTypeSchema.parse(rawType) : undefined;
    const processingStatus = (sp.get("status") ?? undefined) as
      | "UPLOADED"
      | "PROCESSING"
      | "REVIEW_REQUIRED"
      | "CONFIRMED"
      | "FAILED"
      | "DUPLICATE"
      | undefined;

    const fromRaw = sp.get("fromDate");
    const toRaw = sp.get("toDate");

    const data = await documentService.listDocuments(businessId, {
      page,
      pageSize,
      documentType,
      processingStatus,
      fromDate: fromRaw ? new Date(fromRaw) : undefined,
      toDate: toRaw ? new Date(toRaw) : undefined,
    });

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const formData = await req.formData();

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      throw new ValidationError("A document file is required.");
    }

    const rawDocType = formData.get("documentType");
    if (typeof rawDocType !== "string") {
      throw new ValidationError("documentType is required.");
    }
    const documentType = documentTypeSchema.parse(rawDocType);

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await documentService.uploadDocument(businessId, {
      fileName: fileEntry.name,
      declaredMimeType: fileEntry.type,
      buffer,
      documentType,
    });

    return jsonCreated({
      documentId: result.document.id,
      uploadStatus: result.document.processingStatus,
      isDuplicate: result.isDuplicate,
      duplicateOfId: result.duplicateOfId,
      document: result.document,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
