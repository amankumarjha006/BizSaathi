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

export interface SerializedCustomerSummary {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingDue: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export const customerService = {
  async listCustomers(
    businessId: string,
    options: { search?: string; onlyWithDue?: boolean } = {},
    db?: PrismaClient
  ): Promise<SerializedCustomerSummary[]> {
    const prisma = db ?? requirePrisma();
    const customers = await prisma.customer.findMany({
      where: {
        businessId,
        ...(options.search
          ? {
              OR: [
                { name: { contains: options.search, mode: "insensitive" } },
                { phone: { contains: options.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        transactions: {
          where: { status: "CONFIRMED", transactionType: "SALE" },
          select: { totalAmount: true, paidAmount: true },
        },
        ledgerEntries: {
          select: { entryType: true, amount: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const mapped = customers.map((c) => {
      const totalPurchased = decimalToNumber(
        roundMoney(sumDecimals(c.transactions.map((t) => t.totalAmount)))
      );
      const totalPaid = decimalToNumber(
        roundMoney(sumDecimals(c.transactions.map((t) => t.paidAmount)))
      );
      const debits = sumDecimals(
        c.ledgerEntries
          .filter((e) => e.entryType === "DEBIT")
          .map((e) => e.amount)
      );
      const credits = sumDecimals(
        c.ledgerEntries
          .filter((e) => e.entryType === "CREDIT")
          .map((e) => e.amount)
      );
      const outstandingDue = decimalToNumber(
        roundMoney(subDecimals(debits, credits))
      );

      return {
        id: c.id,
        businessId: c.businessId,
        name: c.name,
        phone: c.phone,
        totalPurchased,
        totalPaid,
        outstandingDue,
        transactionCount: c.transactions.length,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    if (options.onlyWithDue) {
      return mapped.filter((c) => c.outstandingDue > 0);
    }
    return mapped;
  },

  async getCustomerById(
    businessId: string,
    customerId: string,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
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

    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    const ledger = await ledgerService.getCustomerLedger(
      businessId,
      customerId,
      prisma
    );

    const totalPurchased = decimalToNumber(
      roundMoney(sumDecimals(customer.transactions.map((t) => t.totalAmount)))
    );
    const totalPaid = decimalToNumber(
      roundMoney(sumDecimals(customer.transactions.map((t) => t.paidAmount)))
    );

    return {
      id: customer.id,
      businessId: customer.businessId,
      name: customer.name,
      phone: customer.phone,
      totalPurchased,
      totalPaid,
      outstandingDue: ledger.balance,
      transactions: customer.transactions.map(serializeTransaction),
      ledgerEntries: ledger.entries,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  },

  async createCustomer(
    businessId: string,
    input: CreatePartyInput,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();

    // Prevent exact same name + phone duplicate while allowing family members to share a phone.
    if (input.phone) {
      const exactMatch = await prisma.customer.findFirst({
        where: {
          businessId,
          phone: input.phone,
          name: { equals: input.name, mode: "insensitive" },
        },
      });
      if (exactMatch) {
        throw new ConflictError(
          `Customer "${input.name}" with phone ${input.phone} already exists.`
        );
      }
    }

    const created = await prisma.customer.create({
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
      outstandingDue: 0,
      transactionCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  },

  async updateCustomer(
    businessId: string,
    customerId: string,
    input: UpdatePartyInput,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (!existing) {
      throw new NotFoundError("Customer not found");
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
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
