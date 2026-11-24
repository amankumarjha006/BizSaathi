import type { NextRequest } from "next/server";
import { analyticsService } from "@/server/services/analytics.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const summary = await analyticsService.getDashboardSummary(businessId);
    return jsonOk(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
