import type { NextRequest } from "next/server";
import { inventoryService } from "@/server/services/inventory.service";
import { handleApiError, jsonCreated } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { stockAdjustmentSchema } from "@/server/validations/phase2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = stockAdjustmentSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const updated = await inventoryService.adjustStock(businessId, input);
    return jsonCreated(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
