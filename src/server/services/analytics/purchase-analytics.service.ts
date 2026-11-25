import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import type { ResolvedDateRange } from "./date-range";

export interface PurchaseAnalyticsResult {
  range: {
    preset: string;
    label: string;
    comparisonLabel: string;
  };
  summary: {
    totalPurchases: number;
    transactionCount: number;
    amountPaidToSuppliers: number;
    outstandingOnPeriodPurchases: number;
    previousTotalPurchases: number;
    purchaseChangePct: number | null;
  };
  records: Array<{
    id: string;
    referenceNumber: string | null;
    transactionDate: string;
    supplierId: string | null;
    supplierName: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    paymentStatus: string;
  }>;
}

export const purchaseAnalyticsService = {
  async getPurchaseAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    options: { supplierId?: string; search?: string } = {},
    db?: PrismaClient
  ): Promise<PurchaseAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const [currentPurchases, previousPurchases, supplierPayments] =
      await Promise.all([
        prisma.transaction.findMany({
          where: {
            businessId,
            status: "CONFIRMED",
            transactionType: "PURCHASE",
            transactionDate: { gte: range.start, lte: range.end },
            ...(options.supplierId ? { supplierId: options.supplierId } : {}),
            ...(options.search
              ? {
                  OR: [
                    { referenceNumber: { contains: options.search, mode: "insensitive" } },
                    { supplier: { name: { contains: options.search, mode: "insensitive" } } },
                  ],
                }
              : {}),
          },
          include: {
            supplier: { select: { name: true } },
          },
          orderBy: { transactionDate: "desc" },
        }),
        prisma.transaction.findMany({
          where: {
            businessId,
            status: "CONFIRMED",
            transactionType: "PURCHASE",
            transactionDate: { gte: range.previousStart, lte: range.previousEnd },
            ...(options.supplierId ? { supplierId: options.supplierId } : {}),
          },
          select: { totalAmount: true },
        }),
        prisma.payment.findMany({
          where: {
            businessId,
            createdAt: { gte: range.start, lte: range.end },
            transaction: {
              transactionType: "PURCHASE",
              status: "CONFIRMED",
              ...(options.supplierId ? { supplierId: options.supplierId } : {}),
            },
          },
          select: { amount: true },
        }),
      ]);

    const totalPurchases = decimalToNumber(
      roundMoney(sumDecimals(currentPurchases.map((p) => p.totalAmount)))
    );
    const totalPaidOnBills = decimalToNumber(
      roundMoney(sumDecimals(currentPurchases.map((p) => p.paidAmount)))
    );
    const amountPaidToSuppliers = decimalToNumber(
      roundMoney(sumDecimals(supplierPayments.map((p) => p.amount)))
    );
    const previousTotalPurchases = decimalToNumber(
      roundMoney(sumDecimals(previousPurchases.map((p) => p.totalAmount)))
    );

    let purchaseChangePct: number | null = null;
    if (previousTotalPurchases > 0) {
      purchaseChangePct = Number(
        (
          ((totalPurchases - previousTotalPurchases) / previousTotalPurchases) *
          100
        ).toFixed(1)
      );
    } else if (totalPurchases === 0) {
      purchaseChangePct = 0;
    }

    return {
      range: {
        preset: range.preset,
        label: range.label,
        comparisonLabel: range.comparisonLabel,
      },
      summary: {
        totalPurchases,
        transactionCount: currentPurchases.length,
        amountPaidToSuppliers,
        outstandingOnPeriodPurchases: Math.max(
          0,
          Number((totalPurchases - totalPaidOnBills).toFixed(2))
        ),
        previousTotalPurchases,
        purchaseChangePct,
      },
      records: currentPurchases.map((p) => ({
        id: p.id,
        referenceNumber: p.referenceNumber,
        transactionDate: p.transactionDate.toISOString(),
        supplierId: p.supplierId,
        supplierName: p.supplier?.name ?? "Unknown Supplier",
        totalAmount: decimalToNumber(p.totalAmount),
        paidAmount: decimalToNumber(p.paidAmount),
        outstandingAmount: Math.max(
          0,
          decimalToNumber(roundMoney(subDecimals(p.totalAmount, p.paidAmount)))
        ),
        paymentStatus: p.paymentStatus,
      })),
    };
  },
};
