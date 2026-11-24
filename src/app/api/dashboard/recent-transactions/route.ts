import type { NextRequest } from "next/server";
import { analyticsService } from "@/server/services/analytics.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const txns = await analyticsService.getRecentTransactions(businessId);
    return jsonOk(txns);
  } catch (error) {
    return handleApiError(error);
  }
}
