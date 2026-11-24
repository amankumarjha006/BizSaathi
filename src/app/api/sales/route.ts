import type { NextRequest } from "next/server";
import { salesService } from "@/server/services/sales.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { createSaleSchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const sales = await salesService.listSales(businessId, search);
    return jsonOk(sales);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createSaleSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const created = await salesService.recordSale(businessId, input);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
