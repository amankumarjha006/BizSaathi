import type { NextRequest } from "next/server";
import { inventoryService } from "@/server/services/inventory.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const movements = await inventoryService.getStockMovementHistory(
      businessId,
      productId
    );
    return jsonOk(movements);
  } catch (error) {
    return handleApiError(error);
  }
}
