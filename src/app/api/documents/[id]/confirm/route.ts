import type { NextRequest } from "next/server";
import { documentService } from "@/server/services/document.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { confirmDocumentSchema } from "@/server/validations/document-extraction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId();
    let payload = {};
    try {
      const raw = await req.json();
      payload = confirmDocumentSchema.parse(raw);
    } catch {
      payload = {};
    }

    const result = await documentService.confirmDocument(
      businessId,
      id,
      payload
    );
    return jsonOk({
      documentId: result.document.id,
      processingStatus: result.document.processingStatus,
      confirmedTransactionId: result.transaction.id,
      document: result.document,
      transaction: result.transaction,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
