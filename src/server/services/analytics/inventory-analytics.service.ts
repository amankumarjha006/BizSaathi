import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  mulDecimals,
  roundMoney,
  sumDecimals,
} from "@/server/utils/decimal";
import type { ResolvedDateRange } from "./date-range";

export interface InventoryProductPerformance {
  productId: string | null;
  name: string;
  unitsSold: number;
  salesValue: number;
}

export interface InventoryAnalyticsResult {
  stockHealth: {
    totalActiveProducts: number;
    healthyCount: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  valuation: {
    estimatedPurchaseCostValue: number;
    valuedProductsCount: number;
    methodNote: string;
  };
  lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    currentStock: number;
    minimumStock: number;
    unit: string;
    purchasePrice: number;
  }>;
  outOfStockProducts: Array<{
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    purchasePrice: number;
  }>;
  productPerformance: {
    periodLabel: string;
    mostSold: InventoryProductPerformance[];
    leastSoldWithHistory: InventoryProductPerformance[];
  };
  allProducts: Array<{
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    currentStock: number;
    minimumStock: number;
    unit: string;
    purchasePrice: number;
    sellingPrice: number;
    estimatedCostValue: number;
    status: "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK";
  }>;
}

export const inventoryAnalyticsService = {
  async getInventoryAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    options: { search?: string } = {},
    db?: PrismaClient
  ): Promise<InventoryAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const [products, salesInPeriod] = await Promise.all([
      prisma.product.findMany({
        where: {
          businessId,
          isActive: true,
          ...(options.search
            ? {
                OR: [
                  { name: { contains: options.search, mode: "insensitive" } },
                  { sku: { contains: options.search, mode: "insensitive" } },
                  { category: { contains: options.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          status: "CONFIRMED",
          transactionType: "SALE",
          transactionDate: { gte: range.start, lte: range.end },
        },
        include: { items: true },
      }),
    ]);

    const lowStockProducts: InventoryAnalyticsResult["lowStockProducts"] = [];
    const outOfStockProducts: InventoryAnalyticsResult["outOfStockProducts"] = [];
    const allProducts: InventoryAnalyticsResult["allProducts"] = [];
    const valuationTerms = [];

    let healthyCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let valuedProductsCount = 0;

    for (const p of products) {
      const cur = decimalToNumber(p.currentStock);
      const min = decimalToNumber(p.minimumStock);
      const purPrice = decimalToNumber(p.purchasePrice);
      const sellPrice = decimalToNumber(p.sellingPrice);

      let status: "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK" = "HEALTHY";
      if (cur <= 0) {
        status = "OUT_OF_STOCK";
        outOfStockCount++;
        outOfStockProducts.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          purchasePrice: purPrice,
        });
      }
      if (cur <= min) {
        if (cur > 0) status = "LOW_STOCK";
        lowStockCount++;
        lowStockProducts.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          currentStock: cur,
          minimumStock: min,
          unit: p.unit,
          purchasePrice: purPrice,
        });
      } else {
        healthyCount++;
      }

      let estimatedCostValue = 0;
      if (cur > 0 && purPrice > 0) {
        const val = roundMoney(mulDecimals(p.currentStock, p.purchasePrice));
        valuationTerms.push(val);
        estimatedCostValue = decimalToNumber(val);
        valuedProductsCount++;
      }

      allProducts.push({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        currentStock: cur,
        minimumStock: min,
        unit: p.unit,
        purchasePrice: purPrice,
        sellingPrice: sellPrice,
        estimatedCostValue,
        status,
      });
    }

    // Performance only among products with recorded sales history in the period
    const perfMap = new Map<string, InventoryProductPerformance>();
    for (const s of salesInPeriod) {
      for (const item of s.items) {
        const key = item.productId ?? item.productNameSnapshot;
        const cur = perfMap.get(key) ?? {
          productId: item.productId,
          name: item.productNameSnapshot,
          unitsSold: 0,
          salesValue: 0,
        };
        cur.unitsSold = Number(
          (cur.unitsSold + decimalToNumber(item.quantity)).toFixed(3)
        );
        cur.salesValue = Number(
          (cur.salesValue + decimalToNumber(item.totalPrice)).toFixed(2)
        );
        perfMap.set(key, cur);
      }
    }

    const withHistory = Array.from(perfMap.values()).filter(
      (p) => p.unitsSold > 0
    );
    const mostSold = [...withHistory]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);
    const leastSoldWithHistory = [...withHistory]
      .sort((a, b) => a.unitsSold - b.unitsSold)
      .slice(0, 5);

    return {
      stockHealth: {
        totalActiveProducts: products.length,
        healthyCount,
        lowStockCount,
        outOfStockCount,
      },
      valuation: {
        estimatedPurchaseCostValue: decimalToNumber(
          roundMoney(sumDecimals(valuationTerms))
        ),
        valuedProductsCount,
        methodNote:
          "Estimated purchase-cost valuation using current stock × catalog purchasePrice (not FIFO/LIFO accounting valuation).",
      },
      lowStockProducts: lowStockProducts.sort(
        (a, b) => a.currentStock - b.currentStock
      ),
      outOfStockProducts,
      productPerformance: {
        periodLabel: range.label,
        mostSold,
        leastSoldWithHistory,
      },
      allProducts,
    };
  },
};
