import type { NextRequest } from "next/server";
import { customerAnalyticsService } from "@/server/services/analytics/customer-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query } = parseAnalyticsQuery(req);
    const data = await customerAnalyticsService.getCustomerAnalytics(businessId, {
      search: query.search,
      sortOrder: query.sortOrder,
    });

    if (query.format === "csv") {
      const csv = buildCsv(
        ["Customer", "Phone", "Bills", "Total Purchased", "Total Paid", "Outstanding Due"],
        data.customers.map((c) => [
          c.name,
          c.phone ?? "",
          c.transactionCount,
          formatInrPlain(c.totalPurchased),
          formatInrPlain(c.totalPaid),
          formatInrPlain(c.outstandingDue),
        ])
      );
      return csvResponse(csv, "bizsaathi-customer-dues-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
