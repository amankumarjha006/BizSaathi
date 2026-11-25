import type { NextRequest } from "next/server";
import { expenseAnalyticsService } from "@/server/services/analytics/expense-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query, range } = parseAnalyticsQuery(req);
    const data = await expenseAnalyticsService.getExpenseAnalytics(
      businessId,
      range,
      {
        category: query.category,
        paymentStatus: query.paymentStatus,
        search: query.search,
      }
    );

    if (query.format === "csv") {
      const csv = buildCsv(
        ["Reference", "Date", "Category", "Description", "Total", "Paid", "Status"],
        data.records.map((r) => [
          r.referenceNumber ?? r.id,
          r.transactionDate.slice(0, 10),
          r.category,
          r.description,
          formatInrPlain(r.totalAmount),
          formatInrPlain(r.paidAmount),
          r.paymentStatus,
        ])
      );
      return csvResponse(csv, "bizsaathi-expenses-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
