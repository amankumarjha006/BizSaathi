import type { NextRequest } from "next/server";
import { inventoryAnalyticsService } from "@/server/services/analytics/inventory-analytics.service";
import { csvResponse, parseAnalyticsQuery } from "@/server/utils/analytics-query";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const { query, range } = parseAnalyticsQuery(req);
    const data = await inventoryAnalyticsService.getInventoryAnalytics(
      businessId,
      range,
      { search: query.search }
    );

    if (query.format === "csv") {
      const csv = buildCsv(
        [
          "Product",
          "SKU",
          "Category",
          "Stock",
          "Min Stock",
          "Unit",
          "Purchase Price",
          "Selling Price",
          "Est. Cost Value",
          "Status",
        ],
        data.allProducts.map((p) => [
          p.name,
          p.sku ?? "",
          p.category ?? "",
          p.currentStock,
          p.minimumStock,
          p.unit,
          formatInrPlain(p.purchasePrice),
          formatInrPlain(p.sellingPrice),
          formatInrPlain(p.estimatedCostValue),
          p.status,
        ])
      );
      return csvResponse(csv, "bizsaathi-inventory-report.csv");
    }

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
