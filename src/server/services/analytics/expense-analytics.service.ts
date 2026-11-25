import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import { formatDateInBusinessTz, type ResolvedDateRange } from "./date-range";

export interface ExpenseAnalyticsResult {
  range: {
    preset: string;
    label: string;
    comparisonLabel: string;
  };
  summary: {
    totalExpenses: number;
    expensesPaid: number;
    outstandingExpenses: number;
    transactionCount: number;
    previousTotalExpenses: number;
    expenseChangePct: number | null;
  };
  categories: Array<{
    category: string;
    total: number;
    count: number;
  }>;
  trend: Array<{ date: string; amount: number }>;
  records: Array<{
    id: string;
    referenceNumber: string | null;
    transactionDate: string;
    category: string;
    description: string;
    totalAmount: number;
    paidAmount: number;
    paymentStatus: string;
  }>;
}

function extractCategoryAndDescription(rawLabel: string): {
  category: string;
  description: string;
} {
  const match = rawLabel.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (match) {
    return { category: match[1].trim(), description: match[2].trim() };
  }
  return { category: "Uncategorized", description: rawLabel };
}

export const expenseAnalyticsService = {
  async getExpenseAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    options: {
      category?: string;
      paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
      search?: string;
    } = {},
    db?: PrismaClient
  ): Promise<ExpenseAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const [currentExpenses, previousExpenses] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          businessId,
          status: "CONFIRMED",
          transactionType: "EXPENSE",
          transactionDate: { gte: range.start, lte: range.end },
          ...(options.paymentStatus
            ? { paymentStatus: options.paymentStatus }
            : {}),
        },
        include: { items: true },
        orderBy: { transactionDate: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          businessId,
          status: "CONFIRMED",
          transactionType: "EXPENSE",
          transactionDate: { gte: range.previousStart, lte: range.previousEnd },
        },
        select: { totalAmount: true },
      }),
    ]);

    const parsedRecords = currentExpenses
      .map((tx) => {
        const rawLabel =
          tx.items[0]?.productNameSnapshot ?? tx.notes ?? "Shop Expense";
        const { category, description } =
          extractCategoryAndDescription(rawLabel);
        return {
          id: tx.id,
          referenceNumber: tx.referenceNumber,
          transactionDate: tx.transactionDate.toISOString(),
          rawDate: tx.transactionDate,
          category,
          description,
          totalAmount: decimalToNumber(tx.totalAmount),
          paidAmount: decimalToNumber(tx.paidAmount),
          paymentStatus: tx.paymentStatus,
          totalDec: tx.totalAmount,
          paidDec: tx.paidAmount,
        };
      })
      .filter((r) => {
        if (
          options.category &&
          r.category.toLowerCase() !== options.category.toLowerCase()
        ) {
          return false;
        }
        if (options.search) {
          const q = options.search.toLowerCase();
          if (
            !r.description.toLowerCase().includes(q) &&
            !r.category.toLowerCase().includes(q) &&
            !(r.referenceNumber?.toLowerCase().includes(q) ?? false)
          ) {
            return false;
          }
        }
        return true;
      });

    const totalDec = roundMoney(sumDecimals(parsedRecords.map((r) => r.totalDec)));
    const paidDec = roundMoney(sumDecimals(parsedRecords.map((r) => r.paidDec)));
    const outstandingDec = roundMoney(subDecimals(totalDec, paidDec));

    const totalExpenses = decimalToNumber(totalDec);
    const expensesPaid = decimalToNumber(paidDec);
    const outstandingExpenses = Math.max(0, decimalToNumber(outstandingDec));

    const previousTotalExpenses = decimalToNumber(
      roundMoney(sumDecimals(previousExpenses.map((e) => e.totalAmount)))
    );

    let expenseChangePct: number | null = null;
    if (previousTotalExpenses > 0) {
      expenseChangePct = Number(
        (
          ((totalExpenses - previousTotalExpenses) / previousTotalExpenses) *
          100
        ).toFixed(1)
      );
    } else if (totalExpenses === 0) {
      expenseChangePct = 0;
    }

    const catMap = new Map<string, { total: number; count: number }>();
    const trendMap = new Map<string, number>();

    for (const r of parsedRecords) {
      const c = catMap.get(r.category) ?? { total: 0, count: 0 };
      c.total = Number((c.total + r.totalAmount).toFixed(2));
      c.count += 1;
      catMap.set(r.category, c);

      const dKey = formatDateInBusinessTz(r.rawDate, range.timeZone);
      trendMap.set(
        dKey,
        Number(((trendMap.get(dKey) ?? 0) + r.totalAmount).toFixed(2))
      );
    }

    return {
      range: {
        preset: range.preset,
        label: range.label,
        comparisonLabel: range.comparisonLabel,
      },
      summary: {
        totalExpenses,
        expensesPaid,
        outstandingExpenses,
        transactionCount: parsedRecords.length,
        previousTotalExpenses,
        expenseChangePct,
      },
      categories: Array.from(catMap.entries())
        .map(([category, val]) => ({
          category,
          total: val.total,
          count: val.count,
        }))
        .sort((a, b) => b.total - a.total),
      trend: Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount })),
      records: parsedRecords.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        transactionDate: r.transactionDate,
        category: r.category,
        description: r.description,
        totalAmount: r.totalAmount,
        paidAmount: r.paidAmount,
        paymentStatus: r.paymentStatus,
      })),
    };
  },
};
