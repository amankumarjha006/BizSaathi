import type { PrismaClient } from "@/generated/prisma/client";
import {
  getGeminiClient,
  getGeminiModel,
  isGeminiConfigured,
} from "@/server/ai/gemini-client";
import { requirePrisma } from "@/server/utils/business-context";
import { customerAnalyticsService } from "./customer-analytics.service";
import type { ResolvedDateRange } from "./date-range";
import { expenseAnalyticsService } from "./expense-analytics.service";
import { inventoryAnalyticsService } from "./inventory-analytics.service";
import { purchaseAnalyticsService } from "./purchase-analytics.service";
import { salesAnalyticsService } from "./sales-analytics.service";
import { supplierAnalyticsService } from "./supplier-analytics.service";

export type InsightCategory =
  | "SALES_TREND"
  | "INVENTORY_WARNING"
  | "CUSTOMER_DUES"
  | "SUPPLIER_PAYABLES"
  | "EXPENSE_TREND"
  | "PRODUCT_PERFORMANCE";

export type InsightSeverity = "ALERT" | "WARNING" | "POSITIVE" | "INFO";

export interface BusinessInsight {
  id: string;
  title: string;
  description: string;
  category: InsightCategory;
  severity: InsightSeverity;
  metric: string;
  period: string;
  suggestedAction: string;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  ALERT: 0,
  WARNING: 1,
  POSITIVE: 2,
  INFO: 3,
};

export interface GeminiNarrativeRunner {
  explainMetrics(prompt: string): Promise<string>;
}

const defaultNarrativeRunner: GeminiNarrativeRunner = {
  async explainMetrics(prompt: string) {
    const ai = getGeminiClient();
    const model = getGeminiModel();
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          "You are BizSaathi's business advisor. Explain the provided precomputed retail metrics clearly in 2-3 short sentences for an Indian shopkeeper. Use ONLY the numbers supplied. Never invent numbers, predictions, or customer details.",
        temperature: 0.2,
      },
    });
    return res.text?.trim() ?? "";
  },
};

export const businessInsightsService = {
  /**
   * Generates deterministic, rule-based insights backed strictly by PostgreSQL metrics.
   * Never fabricates observations when underlying data is absent.
   */
  async getInsights(
    businessId: string,
    range: ResolvedDateRange,
    options: { includeAiNarrative?: boolean; narrativeRunner?: GeminiNarrativeRunner } = {},
    db?: PrismaClient
  ): Promise<{
    insights: BusinessInsight[];
    aiNarrative: string | null;
  }> {
    const prisma = db ?? requirePrisma();

    const [sales, purchases, expenses, inventory, customers, suppliers] =
      await Promise.all([
        salesAnalyticsService.getSalesAnalytics(businessId, range, {}, prisma),
        purchaseAnalyticsService.getPurchaseAnalytics(
          businessId,
          range,
          {},
          prisma
        ),
        expenseAnalyticsService.getExpenseAnalytics(businessId, range, {}, prisma),
        inventoryAnalyticsService.getInventoryAnalytics(
          businessId,
          range,
          {},
          prisma
        ),
        customerAnalyticsService.getCustomerAnalytics(businessId, {}, prisma),
        supplierAnalyticsService.getSupplierAnalytics(businessId, {}, prisma),
      ]);

    const insights: BusinessInsight[] = [];

    // 1. Out-of-stock & low-stock warnings
    if (inventory.outOfStockProducts.length > 0) {
      const names = inventory.outOfStockProducts
        .slice(0, 3)
        .map((p) => p.name)
        .join(", ");
      insights.push({
        id: "inv-out-of-stock",
        title: "Out-of-Stock Products",
        description: `${inventory.outOfStockProducts.length} product(s) have zero stock remaining (${names}).`,
        category: "INVENTORY_WARNING",
        severity: "ALERT",
        metric: `${inventory.outOfStockProducts.length} out of stock`,
        period: "Current",
        suggestedAction: "Record a supplier purchase or restock these items.",
      });
    }

    for (const low of inventory.lowStockProducts
      .filter((p) => p.currentStock > 0)
      .slice(0, 2)) {
      insights.push({
        id: `inv-low-${low.id}`,
        title: `Low Stock: ${low.name}`,
        description: `${low.name} is running low. Only ${low.currentStock} ${low.unit} remain against your minimum stock level of ${low.minimumStock} ${low.unit}.`,
        category: "INVENTORY_WARNING",
        severity: "WARNING",
        metric: `${low.currentStock} / ${low.minimumStock} ${low.unit}`,
        period: "Current",
        suggestedAction: "Plan a restock order with your supplier.",
      });
    }

    // 2. Sales trend comparison (only if current or previous period has sales)
    if (
      sales.summary.salesGrowthPct !== null &&
      (sales.summary.netSales > 0 || sales.summary.previousNetSales > 0)
    ) {
      const pct = sales.summary.salesGrowthPct;
      if (pct >= 5) {
        insights.push({
          id: "sales-growth-up",
          title: "Sales Growth",
          description: `Your sales increased by ${pct}% (₹${sales.summary.netSales.toLocaleString(
            "en-IN"
          )}) compared with ${range.comparisonLabel.toLowerCase()} (₹${sales.summary.previousNetSales.toLocaleString(
            "en-IN"
          )}).`,
          category: "SALES_TREND",
          severity: "POSITIVE",
          metric: `+${pct}%`,
          period: range.label,
          suggestedAction: "Keep fast-moving products well stocked.",
        });
      } else if (pct <= -10) {
        insights.push({
          id: "sales-growth-down",
          title: "Lower Sales Volume",
          description: `Your sales decreased by ${Math.abs(
            pct
          )}% compared with ${range.comparisonLabel.toLowerCase()}.`,
          category: "SALES_TREND",
          severity: "WARNING",
          metric: `${pct}%`,
          period: range.label,
          suggestedAction: "Review top-selling items and customer footfall.",
        });
      }
    }

    // 3. Payment collection mix
    if (sales.summary.amountCollected > 0) {
      const upiAmt = sales.paymentDistribution.UPI;
      const upiShare = Math.round(
        (upiAmt / sales.summary.amountCollected) * 100
      );
      if (upiShare >= 40) {
        insights.push({
          id: "payment-upi-share",
          title: "UPI Collection Share",
          description: `UPI accounted for ${upiShare}% (₹${upiAmt.toLocaleString(
            "en-IN"
          )}) of your recorded customer collections during ${range.label.toLowerCase()}.`,
          category: "SALES_TREND",
          severity: "INFO",
          metric: `${upiShare}% UPI`,
          period: range.label,
          suggestedAction: "Ensure UPI QR settlement records stay reconciled.",
        });
      }
    }

    // 4. Customer dues
    if (customers.totalOutstanding > 0) {
      insights.push({
        id: "customer-dues-pending",
        title: "Pending Customer Udhaar",
        description: `You have ₹${customers.totalOutstanding.toLocaleString(
          "en-IN"
        )} in pending customer payments across ${
          customers.pendingCustomersCount
        } customer(s).`,
        category: "CUSTOMER_DUES",
        severity: customers.totalOutstanding >= 2000 ? "WARNING" : "INFO",
        metric: `₹${customers.totalOutstanding.toLocaleString("en-IN")}`,
        period: "Current Ledger",
        suggestedAction: "Review Customers & Khata to follow up on dues.",
      });
    }

    // 5. Supplier payables
    if (suppliers.totalPayables > 0) {
      insights.push({
        id: "supplier-payables-pending",
        title: "Outstanding Supplier Payables",
        description: `You currently owe ₹${suppliers.totalPayables.toLocaleString(
          "en-IN"
        )} across ${suppliers.pendingSuppliersCount} supplier(s).`,
        category: "SUPPLIER_PAYABLES",
        severity: "INFO",
        metric: `₹${suppliers.totalPayables.toLocaleString("en-IN")}`,
        period: "Current Ledger",
        suggestedAction: "Schedule supplier settlements in Suppliers.",
      });
    }

    // 6. Top-selling product
    if (sales.topProducts.length > 0) {
      const top = sales.topProducts[0];
      insights.push({
        id: "top-product-performance",
        title: `Top Seller: ${top.name}`,
        description: `${top.name} is your top-selling product for ${range.label.toLowerCase()}, with ${
          top.unitsSold
        } units sold (₹${top.salesValue.toLocaleString("en-IN")}).`,
        category: "PRODUCT_PERFORMANCE",
        severity: "POSITIVE",
        metric: `${top.unitsSold} units`,
        period: range.label,
        suggestedAction: "Verify stock threshold for this item.",
      });
    }

    // 7. Purchase & Expense comparison
    if (
      purchases.summary.purchaseChangePct !== null &&
      purchases.summary.purchaseChangePct >= 20 &&
      purchases.summary.totalPurchases > 0
    ) {
      insights.push({
        id: "purchase-higher",
        title: "Higher Purchase Spend",
        description: `Your purchase spend (₹${purchases.summary.totalPurchases.toLocaleString(
          "en-IN"
        )}) is ${purchases.summary.purchaseChangePct}% higher than ${range.comparisonLabel.toLowerCase()}.`,
        category: "EXPENSE_TREND",
        severity: "INFO",
        metric: `+${purchases.summary.purchaseChangePct}%`,
        period: range.label,
        suggestedAction: "Confirm supplier invoices match delivered stock.",
      });
    }

    if (
      expenses.summary.expenseChangePct !== null &&
      expenses.summary.expenseChangePct >= 20 &&
      expenses.summary.totalExpenses > 0
    ) {
      insights.push({
        id: "expense-higher",
        title: "Expense Increase",
        description: `Shop expenses (₹${expenses.summary.totalExpenses.toLocaleString(
          "en-IN"
        )}) rose by ${expenses.summary.expenseChangePct}% compared with ${range.comparisonLabel.toLowerCase()}.`,
        category: "EXPENSE_TREND",
        severity: "WARNING",
        metric: `+${expenses.summary.expenseChangePct}%`,
        period: range.label,
        suggestedAction: "Inspect the Expense Report for category details.",
      });
    }

    insights.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    );

    let aiNarrative: string | null = null;
    if (
      options.includeAiNarrative &&
      insights.length > 0 &&
      (options.narrativeRunner ||
        (isGeminiConfigured() && process.env.GEMINI_MODEL?.trim()))
    ) {
      try {
        const runner = options.narrativeRunner ?? defaultNarrativeRunner;
        const payload = {
          period: range.label,
          netSales: sales.summary.netSales,
          previousNetSales: sales.summary.previousNetSales,
          amountCollected: sales.summary.amountCollected,
          totalPurchases: purchases.summary.totalPurchases,
          totalExpenses: expenses.summary.totalExpenses,
          lowStockCount: inventory.stockHealth.lowStockCount,
          customerOutstanding: customers.totalOutstanding,
          supplierPayables: suppliers.totalPayables,
        };
        aiNarrative = await runner.explainMetrics(
          `Summarize these precomputed store metrics in plain language:\n${JSON.stringify(
            payload
          )}`
        );
      } catch {
        aiNarrative = null;
      }
    }

    return { insights, aiNarrative };
  },
};
