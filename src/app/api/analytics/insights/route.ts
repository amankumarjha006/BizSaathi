import type { NextRequest } from "next/server";
import { businessInsightsService } from "@/server/services/analytics/business-insights.service";
import { parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query, range } = parseAnalyticsQuery(req);
    const data = await businessInsightsService.getInsights(businessId, range, {
      includeAiNarrative: query.explain,
    });
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
