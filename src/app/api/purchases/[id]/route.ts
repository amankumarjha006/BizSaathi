import type { NextRequest } from "next/server";
import { purchaseService } from "@/server/services/purchase.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const purchase = await purchaseService.getPurchaseById(businessId, id);
    return jsonOk(purchase);
  } catch (error) {
    return handleApiError(error);
  }
}
