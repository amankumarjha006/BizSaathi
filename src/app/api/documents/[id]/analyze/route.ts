import type { NextRequest } from "next/server";
import { documentService } from "@/server/services/document.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId();
    const analyzed = await documentService.analyzeDocument(businessId, id);
    return jsonOk(analyzed);
  } catch (error) {
    return handleApiError(error);
  }
}
