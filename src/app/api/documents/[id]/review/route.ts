import type { NextRequest } from "next/server";
import { documentService } from "@/server/services/document.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const businessId = resolveBusinessId();
    const updated = await documentService.reviewDocument(businessId, id, body);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
