import type { NextRequest } from "next/server";
import { purchaseService } from "@/server/services/purchase.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { createPurchaseSchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const purchases = await purchaseService.listPurchases(businessId, search);
    return jsonOk(purchases);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createPurchaseSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const created = await purchaseService.recordPurchase(businessId, input);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
