import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import type { ResolvedDateRange } from "./date-range";
import type { PaymentBreakdownMap } from "./sales-analytics.service";

export interface PaymentAnalyticsResult {
  range: {
    preset: string;
    label: string;
  };
  cashReceived: number;
  cashPaidSuppliers: number;
  cashPaidExpenses: number;
  totalCashPaid: number;
  netRecordedCashMovement: number;
  disclaimer: string;
  inflowsByMethod: PaymentBreakdownMap;
  outflowsByMethod: PaymentBreakdownMap;
  records: Array<{
    id: string;
    transactionId: string;
    referenceNumber: string | null;
    transactionType: string;
    direction: "INFLOW" | "OUTFLOW";
    partyName: string;
    amount: number;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export const paymentAnalyticsService = {
  async getPaymentAnalytics(
    businessId: string,
    range: ResolvedDateRange,
    options: {
      paymentMethod?: "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER";
      direction?: "INFLOW" | "OUTFLOW" | "ALL";
    } = {},
    db?: PrismaClient
  ): Promise<PaymentAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const payments = await prisma.payment.findMany({
      where: {
        businessId,
        createdAt: { gte: range.start, lte: range.end },
        transaction: { status: "CONFIRMED" },
        ...(options.paymentMethod ? { paymentMethod: options.paymentMethod } : {}),
      },
      include: {
        transaction: {
          select: {
            transactionType: true,
            referenceNumber: true,
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const inflowsByMethod: PaymentBreakdownMap = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      OTHER: 0,
    };
    const outflowsByMethod: PaymentBreakdownMap = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      OTHER: 0,
    };

    const inflowAmounts: typeof payments = [];
    const supplierOutflows: typeof payments = [];
    const expenseOutflows: typeof payments = [];

    const records: PaymentAnalyticsResult["records"] = [];

    for (const p of payments) {
      const txType = p.transaction.transactionType;
      const isInflow = txType === "SALE";
      const direction: "INFLOW" | "OUTFLOW" = isInflow ? "INFLOW" : "OUTFLOW";
      const amt = decimalToNumber(p.amount);
      const methodKey = p.paymentMethod as keyof PaymentBreakdownMap;

      if (isInflow) {
        inflowAmounts.push(p);
        inflowsByMethod[methodKey] = Number(
          (inflowsByMethod[methodKey] + amt).toFixed(2)
        );
      } else {
        if (txType === "PURCHASE") supplierOutflows.push(p);
        else if (txType === "EXPENSE") expenseOutflows.push(p);
        outflowsByMethod[methodKey] = Number(
          (outflowsByMethod[methodKey] + amt).toFixed(2)
        );
      }

      if (
        !options.direction ||
        options.direction === "ALL" ||
        options.direction === direction
      ) {
        records.push({
          id: p.id,
          transactionId: p.transactionId,
          referenceNumber: p.transaction.referenceNumber,
          transactionType: txType,
          direction,
          partyName:
            p.transaction.customer?.name ??
            p.transaction.supplier?.name ??
            (txType === "EXPENSE" ? "Shop Expense" : "Walk-in"),
          amount: amt,
          paymentMethod: p.paymentMethod,
          createdAt: p.createdAt.toISOString(),
        });
      }
    }

    const receivedDec = roundMoney(sumDecimals(inflowAmounts.map((p) => p.amount)));
    const supPaidDec = roundMoney(sumDecimals(supplierOutflows.map((p) => p.amount)));
    const expPaidDec = roundMoney(sumDecimals(expenseOutflows.map((p) => p.amount)));
    const totalPaidDec = roundMoney(
      sumDecimals([...supplierOutflows, ...expenseOutflows].map((p) => p.amount))
    );
    const netDec = roundMoney(subDecimals(receivedDec, totalPaidDec));

    return {
      range: { preset: range.preset, label: range.label },
      cashReceived: decimalToNumber(receivedDec),
      cashPaidSuppliers: decimalToNumber(supPaidDec),
      cashPaidExpenses: decimalToNumber(expPaidDec),
      totalCashPaid: decimalToNumber(totalPaidDec),
      netRecordedCashMovement: decimalToNumber(netDec),
      disclaimer:
        "Net Recorded Cash Movement reflects only payments recorded in BizSaathi. Unrecorded cash transactions, taxes, and other liabilities are not included.",
      inflowsByMethod,
      outflowsByMethod,
      records,
    };
  },
};
