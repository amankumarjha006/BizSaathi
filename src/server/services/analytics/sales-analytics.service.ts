import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import {
  enumerateBusinessDates,
  formatDateInBusinessTz,
  getBusinessWeekdayLabel,
  type ResolvedDateRange,
} from "./date-range";

export interface PaymentBreakdownMap {
  CASH: number;
  UPI: number;
  BANK_TRANSFER: number;
  OTHER: number;
}

export interface SalesTrendPoint {
  bucket: string;
  sales: number;
  returns: number;
  netSales: number;
  count: number;
}

export interface TopProductPoint {
  productId: string | null;
  name: string;
  unitsSold: number;
  salesValue: number;
}

export interface SalesAnalyticsResult {
  range: {
    preset: string;
    label: string;
    comparisonLabel: string;
    start: string;
    end: string;
    timeZone: string;
  };
  summary: {
    grossSales: number;
    returnsTotal: number;
    netSales: number;
    transactionCount: number;
    returnsCount: number;
    averageTransactionValue: number;
    amountCollected: number;
    previousNetSales: number;
    salesGrowthPct: number | null;
  };
  paymentDistribution: PaymentBreakdownMap;
  trend: SalesTrendPoint[];
  salesByDay: Array<{ day: string; sales: number; count: number }>;
  topProducts: TopProductPoint[];
  records: Array<{
    id: string;
    referenceNumber: string | null;
    transactionDate: string;
    customerName: string;
    totalAmount: number;
    paidAmount: number;
    paymentStatus: string;
  }>;
}

function getWeekStartIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMon);
  return dt.toISOString().slice(0, 10);
}

export const salesAnalyticsService = {
  async getSalesAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    options: {
      groupBy?: "daily" | "weekly" | "monthly";
      paymentMethod?: "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER";
      sortProductsBy?: "amount" | "units";
      search?: string;
    } = {},
    db?: PrismaClient
  ): Promise<SalesAnalyticsResult> {
    const prisma = db ?? requirePrisma();
    const groupBy = options.groupBy ?? "daily";

    const [currentTxns, previousTxns, salePayments] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          businessId,
          status: "CONFIRMED",
          transactionType: { in: ["SALE", "RETURN"] },
          transactionDate: { gte: range.start, lte: range.end },
          ...(options.paymentMethod
            ? { payments: { some: { paymentMethod: options.paymentMethod } } }
            : {}),
          ...(options.search
            ? {
                OR: [
                  { referenceNumber: { contains: options.search, mode: "insensitive" } },
                  { customer: { name: { contains: options.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { name: true } },
          items: true,
        },
        orderBy: { transactionDate: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          status: "CONFIRMED",
          transactionType: { in: ["SALE", "RETURN"] },
          transactionDate: { gte: range.previousStart, lte: range.previousEnd },
        },
        select: { transactionType: true, totalAmount: true },
      }),
      prisma.payment.findMany({
        where: {
          businessId,
          createdAt: { gte: range.start, lte: range.end },
          transaction: {
            transactionType: "SALE",
            status: "CONFIRMED",
          },
          ...(options.paymentMethod ? { paymentMethod: options.paymentMethod } : {}),
        },
        select: { amount: true, paymentMethod: true },
      }),
    ]);

    const salesOnly = currentTxns.filter((t) => t.transactionType === "SALE");
    const returnsOnly = currentTxns.filter((t) => t.transactionType === "RETURN");

    const grossSalesDec = roundMoney(sumDecimals(salesOnly.map((t) => t.totalAmount)));
    const returnsDec = roundMoney(sumDecimals(returnsOnly.map((t) => t.totalAmount)));
    const netSalesDec = roundMoney(subDecimals(grossSalesDec, returnsDec));

    const grossSales = decimalToNumber(grossSalesDec);
    const returnsTotal = decimalToNumber(returnsDec);
    const netSales = Math.max(0, decimalToNumber(netSalesDec));
    const transactionCount = salesOnly.length;
    const returnsCount = returnsOnly.length;
    const averageTransactionValue =
      transactionCount > 0 ? Number((netSales / transactionCount).toFixed(2)) : 0;

    const prevSalesDec = roundMoney(
      sumDecimals(previousTxns.filter((t) => t.transactionType === "SALE").map((t) => t.totalAmount))
    );
    const prevReturnsDec = roundMoney(
      sumDecimals(previousTxns.filter((t) => t.transactionType === "RETURN").map((t) => t.totalAmount))
    );
    const previousNetSales = Math.max(
      0,
      decimalToNumber(roundMoney(subDecimals(prevSalesDec, prevReturnsDec)))
    );

    let salesGrowthPct: number | null = null;
    if (previousNetSales > 0) {
      salesGrowthPct = Number(
        (((netSales - previousNetSales) / previousNetSales) * 100).toFixed(1)
      );
    } else if (netSales === 0) {
      salesGrowthPct = 0;
    }

    const paymentDistribution: PaymentBreakdownMap = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      OTHER: 0,
    };
    for (const p of salePayments) {
      const key = p.paymentMethod as keyof PaymentBreakdownMap;
      paymentDistribution[key] = Number(
        (paymentDistribution[key] + decimalToNumber(p.amount)).toFixed(2)
      );
    }
    const amountCollected = decimalToNumber(
      roundMoney(sumDecimals(salePayments.map((p) => p.amount)))
    );

    // Build trend buckets
    const bucketMap = new Map<
      string,
      { sales: number; returns: number; count: number }
    >();

    if (groupBy === "daily") {
      for (const dayIso of enumerateBusinessDates(range.start, range.end, range.timeZone)) {
        bucketMap.set(dayIso, { sales: 0, returns: 0, count: 0 });
      }
    }

    const getBucketKey = (dt: Date): string => {
      const iso = formatDateInBusinessTz(dt, range.timeZone);
      if (groupBy === "monthly") return iso.slice(0, 7);
      if (groupBy === "weekly") return getWeekStartIso(iso);
      return iso;
    };

    for (const t of currentTxns) {
      const key = getBucketKey(t.transactionDate);
      const entry = bucketMap.get(key) ?? { sales: 0, returns: 0, count: 0 };
      const amt = decimalToNumber(t.totalAmount);
      if (t.transactionType === "SALE") {
        entry.sales = Number((entry.sales + amt).toFixed(2));
        entry.count += 1;
      } else {
        entry.returns = Number((entry.returns + amt).toFixed(2));
      }
      bucketMap.set(key, entry);
    }

    const trend: SalesTrendPoint[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, val]) => ({
        bucket,
        sales: val.sales,
        returns: val.returns,
        netSales: Math.max(0, Number((val.sales - val.returns).toFixed(2))),
        count: val.count,
      }));

    // Sales by weekday
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekdayMap = new Map<string, { sales: number; count: number }>(
      weekdays.map((d) => [d, { sales: 0, count: 0 }])
    );
    for (const s of salesOnly) {
      const wd = getBusinessWeekdayLabel(s.transactionDate, range.timeZone);
      const cur = weekdayMap.get(wd);
      if (cur) {
        cur.sales = Number((cur.sales + decimalToNumber(s.totalAmount)).toFixed(2));
        cur.count += 1;
      }
    }
    const salesByDay = weekdays.map((day) => ({
      day,
      sales: weekdayMap.get(day)?.sales ?? 0,
      count: weekdayMap.get(day)?.count ?? 0,
    }));

    // Top products
    const productStats = new Map<string, TopProductPoint>();
    for (const s of salesOnly) {
      for (const item of s.items) {
        const key = item.productId ?? item.productNameSnapshot;
        const cur = productStats.get(key) ?? {
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
        productStats.set(key, cur);
      }
    }
    const topProducts = Array.from(productStats.values()).sort((a, b) =>
      options.sortProductsBy === "units"
        ? b.unitsSold - a.unitsSold
        : b.salesValue - a.salesValue
    );

    return {
      range: {
        preset: range.preset,
        label: range.label,
        comparisonLabel: range.comparisonLabel,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        timeZone: range.timeZone,
      },
      summary: {
        grossSales,
        returnsTotal,
        netSales,
        transactionCount,
        returnsCount,
        averageTransactionValue,
        amountCollected,
        previousNetSales,
        salesGrowthPct,
      },
      paymentDistribution,
      trend,
      salesByDay,
      topProducts,
      records: salesOnly.map((s) => ({
        id: s.id,
        referenceNumber: s.referenceNumber,
        transactionDate: s.transactionDate.toISOString(),
        customerName: s.customer?.name ?? "Walk-in Customer",
        totalAmount: decimalToNumber(s.totalAmount),
        paidAmount: decimalToNumber(s.paidAmount),
        paymentStatus: s.paymentStatus,
      })),
    };
  },
};
