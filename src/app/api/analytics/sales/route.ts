import type { NextRequest } from "next/server";
import { salesAnalyticsService } from "@/server/services/analytics/sales-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query, range } = parseAnalyticsQuery(req);
    const data = await salesAnalyticsService.getSalesAnalytics(
      businessId,
      range,
      {
        groupBy: query.groupBy,
        paymentMethod: query.paymentMethod,
        sortProductsBy: query.sortBy === "units" ? "units" : "amount",
        search: query.search,
      }
    );

    if (query.format === "csv") {
      const csv = buildCsv(
        ["Reference", "Date", "Customer", "Total", "Paid", "Payment Status"],
        data.records.map((r) => [
          r.referenceNumber ?? r.id,
          r.transactionDate.slice(0, 10),
          r.customerName,
          formatInrPlain(r.totalAmount),
          formatInrPlain(r.paidAmount),
          r.paymentStatus,
        ])
      );
      return csvResponse(csv, "bizsaathi-sales-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
