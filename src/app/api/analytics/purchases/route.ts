import type { NextRequest } from "next/server";
import { purchaseAnalyticsService } from "@/server/services/analytics/purchase-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query, range } = parseAnalyticsQuery(req);
    const data = await purchaseAnalyticsService.getPurchaseAnalytics(
      businessId,
      range,
      { supplierId: query.supplierId, search: query.search }
    );

    if (query.format === "csv") {
      const csv = buildCsv(
        ["Reference", "Date", "Supplier", "Total", "Paid", "Outstanding", "Status"],
        data.records.map((r) => [
          r.referenceNumber ?? r.id,
          r.transactionDate.slice(0, 10),
          r.supplierName,
          formatInrPlain(r.totalAmount),
          formatInrPlain(r.paidAmount),
          formatInrPlain(r.outstandingAmount),
          r.paymentStatus,
        ])
      );
      return csvResponse(csv, "bizsaathi-purchases-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
