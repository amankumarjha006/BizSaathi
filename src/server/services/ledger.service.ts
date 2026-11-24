import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import type { TxClient } from "./inventory.service";

export interface LedgerMutationParams {
  businessId: string;
  transactionId: string;
  amount: Prisma.Decimal | number | string;
  notes?: string;
}

export interface SerializedLedgerEntry {
  id: string;
  transactionId: string;
  referenceNumber: string | null;
  transactionType: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  notes: string | null;
  createdAt: string;
}

export const ledgerService = {
  /**
   * Customer DEBIT: increases customer's amount due (e.g. credit sale).
   */
  async recordCustomerDebitTx(
    tx: TxClient,
    params: LedgerMutationParams & { customerId: string }
  ): Promise<void> {
    const amount = roundMoney(params.amount);
    if (amount.lte(0)) return;
    await tx.ledgerEntry.create({
      data: {
        businessId: params.businessId,
        customerId: params.customerId,
        transactionId: params.transactionId,
        entryType: "DEBIT",
        amount,
        notes: params.notes ?? null,
      },
    });
  },

  /**
   * Customer CREDIT: decreases customer's amount due (e.g. customer payment).
   */
  async recordCustomerCreditTx(
    tx: TxClient,
    params: LedgerMutationParams & { customerId: string }
  ): Promise<void> {
    const amount = roundMoney(params.amount);
    if (amount.lte(0)) return;
    await tx.ledgerEntry.create({
      data: {
        businessId: params.businessId,
        customerId: params.customerId,
        transactionId: params.transactionId,
        entryType: "CREDIT",
        amount,
        notes: params.notes ?? null,
      },
    });
  },

  /**
   * Supplier CREDIT: increases amount payable to supplier (e.g. purchase).
   */
  async recordSupplierCreditTx(
    tx: TxClient,
    params: LedgerMutationParams & { supplierId: string }
  ): Promise<void> {
    const amount = roundMoney(params.amount);
    if (amount.lte(0)) return;
    await tx.ledgerEntry.create({
      data: {
        businessId: params.businessId,
        supplierId: params.supplierId,
        transactionId: params.transactionId,
        entryType: "CREDIT",
        amount,
        notes: params.notes ?? null,
      },
    });
  },

  /**
   * Supplier DEBIT: decreases amount payable to supplier (e.g. supplier payment).
   */
  async recordSupplierDebitTx(
    tx: TxClient,
    params: LedgerMutationParams & { supplierId: string }
  ): Promise<void> {
    const amount = roundMoney(params.amount);
    if (amount.lte(0)) return;
    await tx.ledgerEntry.create({
      data: {
        businessId: params.businessId,
        supplierId: params.supplierId,
        transactionId: params.transactionId,
        entryType: "DEBIT",
        amount,
        notes: params.notes ?? null,
      },
    });
  },

  async getCustomerBalance(
    businessId: string,
    customerId: string,
    db?: PrismaClient
  ): Promise<number> {
    const prisma = db ?? requirePrisma();
    const entries = await prisma.ledgerEntry.findMany({
      where: { businessId, customerId },
      select: { entryType: true, amount: true },
    });

    const debits = sumDecimals(
      entries.filter((e) => e.entryType === "DEBIT").map((e) => e.amount)
    );
    const credits = sumDecimals(
      entries.filter((e) => e.entryType === "CREDIT").map((e) => e.amount)
    );

    return decimalToNumber(roundMoney(subDecimals(debits, credits)));
  },

  async getSupplierBalance(
    businessId: string,
    supplierId: string,
    db?: PrismaClient
  ): Promise<number> {
    const prisma = db ?? requirePrisma();
    const entries = await prisma.ledgerEntry.findMany({
      where: { businessId, supplierId },
      select: { entryType: true, amount: true },
    });

    const credits = sumDecimals(
      entries.filter((e) => e.entryType === "CREDIT").map((e) => e.amount)
    );
    const debits = sumDecimals(
      entries.filter((e) => e.entryType === "DEBIT").map((e) => e.amount)
    );

    return decimalToNumber(roundMoney(subDecimals(credits, debits)));
  },

  async getCustomerLedger(
    businessId: string,
    customerId: string,
    db?: PrismaClient
  ): Promise<{ balance: number; entries: SerializedLedgerEntry[] }> {
    const prisma = db ?? requirePrisma();
    const entries = await prisma.ledgerEntry.findMany({
      where: { businessId, customerId },
      include: {
        transaction: {
          select: { referenceNumber: true, transactionType: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const debits = sumDecimals(
      entries.filter((e) => e.entryType === "DEBIT").map((e) => e.amount)
    );
    const credits = sumDecimals(
      entries.filter((e) => e.entryType === "CREDIT").map((e) => e.amount)
    );

    return {
      balance: decimalToNumber(roundMoney(subDecimals(debits, credits))),
      entries: entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        referenceNumber: e.transaction.referenceNumber,
        transactionType: e.transaction.transactionType,
        entryType: e.entryType,
        amount: decimalToNumber(e.amount),
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  },

  async getSupplierLedger(
    businessId: string,
    supplierId: string,
    db?: PrismaClient
  ): Promise<{ balance: number; entries: SerializedLedgerEntry[] }> {
    const prisma = db ?? requirePrisma();
    const entries = await prisma.ledgerEntry.findMany({
      where: { businessId, supplierId },
      include: {
        transaction: {
          select: { referenceNumber: true, transactionType: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const credits = sumDecimals(
      entries.filter((e) => e.entryType === "CREDIT").map((e) => e.amount)
    );
    const debits = sumDecimals(
      entries.filter((e) => e.entryType === "DEBIT").map((e) => e.amount)
    );

    return {
      balance: decimalToNumber(roundMoney(subDecimals(credits, debits))),
      entries: entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        referenceNumber: e.transaction.referenceNumber,
        transactionType: e.transaction.transactionType,
        entryType: e.entryType,
        amount: decimalToNumber(e.amount),
        notes: e.notes,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  },
};
