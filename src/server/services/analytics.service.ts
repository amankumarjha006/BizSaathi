import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import { inventoryService } from "./inventory.service";
import { transactionService } from "./transaction.service";

export interface DashboardSummary {
  todaySales: number;
  todaySalesCount: number;
  todayPurchases: number;
  todayPurchasesCount: number;
  outstandingCustomerDues: number;
  totalSupplierPayables: number;
  totalProducts: number;
  lowStockCount: number;
  totalSalesCollected: number;
  totalPurchasesPaid: number;
}

export interface DailyOverviewPoint {
  date: string;
  sales: number;
  purchases: number;
}

export const analyticsService = {
  async getDashboardSummary(
    businessId: string,
    db?: PrismaClient
  ): Promise<DashboardSummary> {
    const prisma = db ?? requirePrisma();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      todaySalesTxns,
      todayPurchaseTxns,
      customerLedger,
      supplierLedger,
      totalProducts,
      lowStockProducts,
      allSales,
      allPurchases,
    ] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          businessId,
          transactionType: "SALE",
          status: "CONFIRMED",
          transactionDate: { gte: startOfToday },
        },
        select: { totalAmount: true },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          transactionType: "PURCHASE",
          status: "CONFIRMED",
          transactionDate: { gte: startOfToday },
        },
        select: { totalAmount: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { businessId, customerId: { not: null } },
        select: { entryType: true, amount: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { businessId, supplierId: { not: null } },
        select: { entryType: true, amount: true },
      }),
      prisma.product.count({
        where: { businessId, isActive: true },
      }),
      inventoryService.getLowStockProducts(businessId, prisma),
      prisma.transaction.findMany({
        where: { businessId, transactionType: "SALE", status: "CONFIRMED" },
        select: { paidAmount: true },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          transactionType: "PURCHASE",
          status: "CONFIRMED",
        },
        select: { paidAmount: true },
      }),
    ]);

    const custDebits = sumDecimals(
      customerLedger
        .filter((e) => e.entryType === "DEBIT")
        .map((e) => e.amount)
    );
    const custCredits = sumDecimals(
      customerLedger
        .filter((e) => e.entryType === "CREDIT")
        .map((e) => e.amount)
    );

    const supCredits = sumDecimals(
      supplierLedger
        .filter((e) => e.entryType === "CREDIT")
        .map((e) => e.amount)
    );
    const supDebits = sumDecimals(
      supplierLedger
        .filter((e) => e.entryType === "DEBIT")
        .map((e) => e.amount)
    );

    return {
      todaySales: decimalToNumber(
        roundMoney(sumDecimals(todaySalesTxns.map((t) => t.totalAmount)))
      ),
      todaySalesCount: todaySalesTxns.length,
      todayPurchases: decimalToNumber(
        roundMoney(sumDecimals(todayPurchaseTxns.map((t) => t.totalAmount)))
      ),
      todayPurchasesCount: todayPurchaseTxns.length,
      outstandingCustomerDues: Math.max(
        0,
        decimalToNumber(roundMoney(subDecimals(custDebits, custCredits)))
      ),
      totalSupplierPayables: Math.max(
        0,
        decimalToNumber(roundMoney(subDecimals(supCredits, supDebits)))
      ),
      totalProducts,
      lowStockCount: lowStockProducts.length,
      totalSalesCollected: decimalToNumber(
        roundMoney(sumDecimals(allSales.map((t) => t.paidAmount)))
      ),
      totalPurchasesPaid: decimalToNumber(
        roundMoney(sumDecimals(allPurchases.map((t) => t.paidAmount)))
      ),
    };
  },

  async getRecentTransactions(
    businessId: string,
    limit = 8,
    db?: PrismaClient
  ) {
    return transactionService.listTransactions(businessId, { limit }, db);
  },

  async getSalesOverview(
    businessId: string,
    days = 7,
    db?: PrismaClient
  ): Promise<DailyOverviewPoint[]> {
    const prisma = db ?? requirePrisma();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const txns = await prisma.transaction.findMany({
      where: {
        businessId,
        status: "CONFIRMED",
        transactionType: { in: ["SALE", "PURCHASE"] },
        transactionDate: { gte: startDate },
      },
      select: {
        transactionType: true,
        transactionDate: true,
        totalAmount: true,
      },
    });

    const buckets = new Map<
      string,
      { sales: number; purchases: number }
    >();

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { sales: 0, purchases: 0 });
    }

    for (const t of txns) {
      const key = t.transactionDate.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const amt = decimalToNumber(t.totalAmount);
      if (t.transactionType === "SALE") {
        bucket.sales = Number((bucket.sales + amt).toFixed(2));
      } else if (t.transactionType === "PURCHASE") {
        bucket.purchases = Number((bucket.purchases + amt).toFixed(2));
      }
    }

    return Array.from(buckets.entries()).map(([date, totals]) => ({
      date,
      sales: totals.sales,
      purchases: totals.purchases,
    }));
  },

  async getSalesSummaryForPeriod(
    businessId: string,
    period: "TODAY" | "YESTERDAY" | "THIS_WEEK" | "THIS_MONTH" = "TODAY",
    timeZone = "Asia/Kolkata",
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();

    // Compute calendar date parts in business timezone (default Asia/Kolkata)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayIso = formatter.format(now); // YYYY-MM-DD
    const [y, m, d] = todayIso.split("-").map(Number);

    // Build IST-anchored UTC boundaries (Asia/Kolkata is UTC+05:30)
    const offsetMs = 5.5 * 60 * 60 * 1000;
    const utcMidnight = Date.UTC(y, m - 1, d) - offsetMs;

    let startDate = new Date(utcMidnight);
    let endDate = new Date(utcMidnight + 24 * 60 * 60 * 1000 - 1);

    if (period === "YESTERDAY") {
      startDate = new Date(utcMidnight - 24 * 60 * 60 * 1000);
      endDate = new Date(utcMidnight - 1);
    } else if (period === "THIS_WEEK") {
      startDate = new Date(utcMidnight - 6 * 24 * 60 * 60 * 1000);
    } else if (period === "THIS_MONTH") {
      startDate = new Date(Date.UTC(y, m - 1, 1) - offsetMs);
    }

    const sales = await prisma.transaction.findMany({
      where: {
        businessId,
        transactionType: "SALE",
        status: "CONFIRMED",
        transactionDate: { gte: startDate, lte: endDate },
      },
      select: { totalAmount: true, paidAmount: true },
    });

    const totalSales = decimalToNumber(
      roundMoney(sumDecimals(sales.map((s) => s.totalAmount)))
    );
    const totalCollected = decimalToNumber(
      roundMoney(sumDecimals(sales.map((s) => s.paidAmount)))
    );
    const totalCredit = Math.max(
      0,
      Number((totalSales - totalCollected).toFixed(2))
    );

    return {
      period,
      timeZone,
      transactionCount: sales.length,
      totalSales,
      totalCollected,
      totalCredit,
    };
  },

  async getTopSellingProducts(
    businessId: string,
    days = 7,
    limit = 5,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const sales = await prisma.transaction.findMany({
      where: {
        businessId,
        transactionType: "SALE",
        status: "CONFIRMED",
        transactionDate: { gte: start },
      },
      include: { items: true },
    });

    const totals = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.productId ?? item.productNameSnapshot;
        const cur = totals.get(key) ?? {
          name: item.productNameSnapshot,
          quantity: 0,
          revenue: 0,
        };
        cur.quantity = Number((cur.quantity + decimalToNumber(item.quantity)).toFixed(3));
        cur.revenue = Number((cur.revenue + decimalToNumber(item.totalPrice)).toFixed(2));
        totals.set(key, cur);
      }
    }

    return Array.from(totals.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },
};
