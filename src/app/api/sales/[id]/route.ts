import type { NextRequest } from "next/server";
import { salesService } from "@/server/services/sales.service";
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
    const sale = await salesService.getSaleById(businessId, id);
    return jsonOk(sale);
  } catch (error) {
    return handleApiError(error);
  }
}
