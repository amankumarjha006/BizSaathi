import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { transactionService } from "@/server/services/transaction.service";
import { customerAnalyticsService } from "./customer-analytics.service";
import type { ResolvedDateRange } from "./date-range";
import { expenseAnalyticsService } from "./expense-analytics.service";
import { inventoryAnalyticsService } from "./inventory-analytics.service";
import { paymentAnalyticsService } from "./payment-analytics.service";
import { purchaseAnalyticsService } from "./purchase-analytics.service";
import { salesAnalyticsService } from "./sales-analytics.service";
import { supplierAnalyticsService } from "./supplier-analytics.service";

export const dashboardAnalyticsService = {
  async getDashboardAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    groupBy: "daily" | "weekly" | "monthly" = "daily",
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();

    const [
      sales,
      purchases,
      payments,
      expenses,
      inventory,
      customers,
      suppliers,
      recentTransactions,
    ] = await Promise.all([
      salesAnalyticsService.getSalesAnalytics(
        businessId,
        range,
        { groupBy },
        prisma
      ),
      purchaseAnalyticsService.getPurchaseAnalytics(
        businessId,
        range,
        {},
        prisma
      ),
      paymentAnalyticsService.getPaymentAnalytics(businessId, range, {}, prisma),
      expenseAnalyticsService.getExpenseAnalytics(businessId, range, {}, prisma),
      inventoryAnalyticsService.getInventoryAnalytics(
        businessId,
        range,
        {},
        prisma
      ),
      customerAnalyticsService.getCustomerAnalytics(businessId, {}, prisma),
      supplierAnalyticsService.getSupplierAnalytics(businessId, {}, prisma),
      transactionService.listTransactions(businessId, { limit: 8 }, prisma),
    ]);

    return {
      range: sales.range,
      salesSummary: sales.summary,
      paymentDistribution: sales.paymentDistribution,
      salesTrend: sales.trend,
      salesByDay: sales.salesByDay,
      topProducts: sales.topProducts.slice(0, 6),
      purchaseSummary: purchases.summary,
      expenseSummary: expenses.summary,
      expenseCategories: expenses.categories,
      cashMovement: {
        cashReceived: payments.cashReceived,
        cashPaidSuppliers: payments.cashPaidSuppliers,
        cashPaidExpenses: payments.cashPaidExpenses,
        totalCashPaid: payments.totalCashPaid,
        netRecordedCashMovement: payments.netRecordedCashMovement,
        disclaimer: payments.disclaimer,
      },
      customerSummary: {
        totalOutstanding: customers.totalOutstanding,
        pendingCustomersCount: customers.pendingCustomersCount,
        topPendingCustomers: customers.customers
          .filter((c) => c.outstandingDue > 0)
          .slice(0, 5),
      },
      supplierSummary: {
        totalPayables: suppliers.totalPayables,
        pendingSuppliersCount: suppliers.pendingSuppliersCount,
        topPayableSuppliers: suppliers.suppliers
          .filter((s) => s.outstandingPayable > 0)
          .slice(0, 5),
      },
      inventoryHealth: inventory.stockHealth,
      inventoryValuation: inventory.valuation,
      lowStockProducts: inventory.lowStockProducts.slice(0, 6),
      outOfStockProducts: inventory.outOfStockProducts.slice(0, 6),
      recentTransactions,
    };
  },
};
