import type { NextRequest } from "next/server";
import { supplierAnalyticsService } from "@/server/services/analytics/supplier-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query } = parseAnalyticsQuery(req);
    const data = await supplierAnalyticsService.getSupplierAnalytics(businessId, {
      search: query.search,
      sortOrder: query.sortOrder,
    });

    if (query.format === "csv") {
      const csv = buildCsv(
        ["Supplier", "Phone", "Bills", "Total Purchased", "Total Paid", "Outstanding Payable"],
        data.suppliers.map((s) => [
          s.name,
          s.phone ?? "",
          s.transactionCount,
          formatInrPlain(s.totalPurchased),
          formatInrPlain(s.totalPaid),
          formatInrPlain(s.outstandingPayable),
        ])
      );
      return csvResponse(csv, "bizsaathi-supplier-payables-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
