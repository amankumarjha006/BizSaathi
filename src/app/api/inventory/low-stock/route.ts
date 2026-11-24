import type { NextRequest } from "next/server";
import { inventoryService } from "@/server/services/inventory.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const products = await inventoryService.getLowStockProducts(businessId);
    return jsonOk(products);
  } catch (error) {
    return handleApiError(error);
  }
}
