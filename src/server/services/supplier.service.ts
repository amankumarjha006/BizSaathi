import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundMoney,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import { ConflictError, NotFoundError } from "@/server/utils/errors";
import { ledgerService } from "./ledger.service";
import { serializeTransaction } from "./transaction.service";
import type {
  CreatePartyInput,
  UpdatePartyInput,
} from "@/server/validations/phase2";

export interface SerializedSupplierSummary {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingPayable: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export const supplierService = {
  async listSuppliers(
    businessId: string,
    search?: string,
    db?: PrismaClient
  ): Promise<SerializedSupplierSummary[]> {
    const prisma = db ?? requirePrisma();
    const suppliers = await prisma.supplier.findMany({
      where: {
        businessId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        transactions: {
          where: { status: "CONFIRMED", transactionType: "PURCHASE" },
          select: { totalAmount: true, paidAmount: true },
        },
        ledgerEntries: {
          select: { entryType: true, amount: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return suppliers.map((s) => {
      const totalPurchased = decimalToNumber(
        roundMoney(sumDecimals(s.transactions.map((t) => t.totalAmount)))
      );
      const totalPaid = decimalToNumber(
        roundMoney(sumDecimals(s.transactions.map((t) => t.paidAmount)))
      );
      const credits = sumDecimals(
        s.ledgerEntries
          .filter((e) => e.entryType === "CREDIT")
          .map((e) => e.amount)
      );
      const debits = sumDecimals(
        s.ledgerEntries
          .filter((e) => e.entryType === "DEBIT")
          .map((e) => e.amount)
      );
      const outstandingPayable = decimalToNumber(
        roundMoney(subDecimals(credits, debits))
      );

      return {
        id: s.id,
        businessId: s.businessId,
        name: s.name,
        phone: s.phone,
        totalPurchased,
        totalPaid,
        outstandingPayable,
        transactionCount: s.transactions.length,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });
  },

  async getSupplierById(
    businessId: string,
    supplierId: string,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, businessId },
      include: {
        transactions: {
          where: { status: "CONFIRMED" },
          include: {
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
            items: true,
            payments: { orderBy: { createdAt: "desc" } },
          },
          orderBy: { transactionDate: "desc" },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const ledger = await ledgerService.getSupplierLedger(
      businessId,
      supplierId,
      prisma
    );

    const totalPurchased = decimalToNumber(
      roundMoney(sumDecimals(supplier.transactions.map((t) => t.totalAmount)))
    );
    const totalPaid = decimalToNumber(
      roundMoney(sumDecimals(supplier.transactions.map((t) => t.paidAmount)))
    );

    return {
      id: supplier.id,
      businessId: supplier.businessId,
      name: supplier.name,
      phone: supplier.phone,
      totalPurchased,
      totalPaid,
      outstandingPayable: ledger.balance,
      transactions: supplier.transactions.map(serializeTransaction),
      ledgerEntries: ledger.entries,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    };
  },

  async createSupplier(
    businessId: string,
    input: CreatePartyInput,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();

    const existing = await prisma.supplier.findFirst({
      where: {
        businessId,
        name: { equals: input.name, mode: "insensitive" },
      },
    });
    if (existing) {
      throw new ConflictError(`Supplier "${input.name}" already exists.`);
    }

    const created = await prisma.supplier.create({
      data: {
        businessId,
        name: input.name,
        phone: input.phone ?? null,
      },
    });

    return {
      id: created.id,
      businessId: created.businessId,
      name: created.name,
      phone: created.phone,
      totalPurchased: 0,
      totalPaid: 0,
      outstandingPayable: 0,
      transactionCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  },

  async updateSupplier(
    businessId: string,
    supplierId: string,
    input: UpdatePartyInput,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const existing = await prisma.supplier.findFirst({
      where: { id: supplierId, businessId },
    });
    if (!existing) {
      throw new NotFoundError("Supplier not found");
    }

    const updated = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });

    return {
      id: updated.id,
      businessId: updated.businessId,
      name: updated.name,
      phone: updated.phone,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
