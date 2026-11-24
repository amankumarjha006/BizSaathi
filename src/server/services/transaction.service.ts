import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  addDecimals,
  decimalToNumber,
  mulDecimals,
  roundMoney,
  roundStock,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import { addStockTx, removeStockTx, type TxClient } from "./inventory.service";
import { ledgerService } from "./ledger.service";
import type {
  CreatePurchaseInput,
  CreateSaleInput,
  RecordPaymentInput,
} from "@/server/validations/phase2";

export interface TransactionFilters {
  transactionType?: "PURCHASE" | "SALE" | "CUSTOMER_ORDER" | "EXPENSE" | "RETURN";
  status?: "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "CANCELLED";
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export interface SerializedTransactionItem {
  id: string;
  productId: string | null;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SerializedPayment {
  id: string;
  transactionId: string;
  amount: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
}

export interface SerializedTransaction {
  id: string;
  businessId: string;
  transactionType: string;
  referenceNumber: string | null;
  transactionDate: string;
  customerId: string | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  status: string;
  notes: string | null;
  items: SerializedTransactionItem[];
  payments: SerializedPayment[];
  createdAt: string;
  updatedAt: string;
}

function computePaymentStatus(
  totalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal
): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount.gte(totalAmount)) {
    return "PAID";
  }
  if (paidAmount.gt(0)) {
    return "PARTIAL";
  }
  return "UNPAID";
}

function generateReference(prefix: "BILL" | "PUR" | "ORD" | "EXP"): string {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${stamp}${rand}`;
}

export interface PurchaseTxInput extends CreatePurchaseInput {
  documentId?: string;
  discountAmount?: number;
  taxAmount?: number;
}

export interface SaleTxInput extends CreateSaleInput {
  documentId?: string;
  referenceNumber?: string;
  discountAmount?: number;
  taxAmount?: number;
}

export interface CustomerOrderTxInput {
  customerId?: string;
  documentId?: string;
  referenceNumber?: string;
  transactionDate?: Date;
  items: Array<{
    productId?: string | null;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
  }>;
  notes?: string;
}

export interface ExpenseTxInput {
  documentId?: string;
  referenceNumber?: string;
  transactionDate?: Date;
  description: string;
  category?: string | null;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER";
  notes?: string;
}

export function serializeTransaction(tx: {
  id: string;
  businessId: string;
  transactionType: string;
  referenceNumber: string | null;
  transactionDate: Date;
  customerId: string | null;
  customer?: { name: string } | null;
  supplierId: string | null;
  supplier?: { name: string } | null;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  paymentStatus: string;
  status: string;
  notes: string | null;
  items?: Array<{
    id: string;
    productId: string | null;
    productNameSnapshot: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
  }>;
  payments?: Array<{
    id: string;
    transactionId: string;
    amount: Prisma.Decimal;
    paymentMethod: string;
    notes: string | null;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}): SerializedTransaction {
  const totalAmount = decimalToNumber(tx.totalAmount);
  const paidAmount = decimalToNumber(tx.paidAmount);
  const outstandingAmount = decimalToNumber(
    roundMoney(subDecimals(tx.totalAmount, tx.paidAmount))
  );

  return {
    id: tx.id,
    businessId: tx.businessId,
    transactionType: tx.transactionType,
    referenceNumber: tx.referenceNumber,
    transactionDate: tx.transactionDate.toISOString(),
    customerId: tx.customerId,
    customerName: tx.customer?.name ?? null,
    supplierId: tx.supplierId,
    supplierName: tx.supplier?.name ?? null,
    totalAmount,
    paidAmount,
    outstandingAmount,
    paymentStatus: tx.paymentStatus,
    status: tx.status,
    notes: tx.notes,
    items: (tx.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      quantity: decimalToNumber(item.quantity),
      unitPrice: decimalToNumber(item.unitPrice),
      totalPrice: decimalToNumber(item.totalPrice),
    })),
    payments: (tx.payments ?? []).map((p) => ({
      id: p.id,
      transactionId: p.transactionId,
      amount: decimalToNumber(p.amount),
      paymentMethod: p.paymentMethod,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
    })),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

export const transactionService = {
  async recordPurchaseTx(
    tx: TxClient,
    businessId: string,
    input: PurchaseTxInput
  ): Promise<SerializedTransaction> {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId },
      select: { id: true, name: true },
    });
    if (!supplier) {
      throw new NotFoundError("Supplier not found for this business.");
    }

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const preparedItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(
          `Product (${item.productId}) not found for this business.`
        );
      }
      const qty = roundStock(item.quantity);
      const unitPrice = roundMoney(item.unitPrice);
      const totalPrice = roundMoney(mulDecimals(qty, unitPrice));
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: qty,
        unitPrice,
        totalPrice,
      };
    });

    const itemsSubtotal = roundMoney(
      sumDecimals(preparedItems.map((i) => i.totalPrice))
    );
    const discountDec = roundMoney(input.discountAmount ?? 0);
    const taxDec = roundMoney(input.taxAmount ?? 0);
    const totalAmount = roundMoney(
      addDecimals(subDecimals(itemsSubtotal, discountDec), taxDec)
    );
    if (totalAmount.lt(0)) {
      throw new ValidationError("Purchase total cannot be negative.");
    }

    const paidAmount = roundMoney(input.paidAmount);

    if (paidAmount.gt(totalAmount)) {
      throw new ValidationError(
        `Paid amount (₹${paidAmount.toString()}) cannot exceed total purchase amount (₹${totalAmount.toString()}).`
      );
    }

    const paymentStatus = computePaymentStatus(totalAmount, paidAmount);
    const referenceNumber = input.referenceNumber ?? generateReference("PUR");

    const created = await tx.transaction.create({
      data: {
        businessId,
        transactionType: "PURCHASE",
        referenceNumber,
        transactionDate: input.transactionDate ?? new Date(),
        supplierId: supplier.id,
        documentId: input.documentId ?? null,
        totalAmount,
        paidAmount,
        paymentStatus,
        status: "CONFIRMED",
        notes: input.notes ?? null,
        items: {
          create: preparedItems,
        },
      },
    });

    for (const item of preparedItems) {
      await addStockTx(tx, {
        businessId,
        productId: item.productId,
        quantity: item.quantity,
        movementType: "PURCHASE_IN",
        referenceId: created.id,
        notes: `Purchase ${referenceNumber}`,
      });
    }

    if (paidAmount.gt(0)) {
      await tx.payment.create({
        data: {
          businessId,
          transactionId: created.id,
          amount: paidAmount,
          paymentMethod: input.paymentMethod,
          notes: `Initial payment for ${referenceNumber}`,
        },
      });
    }

    await ledgerService.recordSupplierCreditTx(tx, {
      businessId,
      supplierId: supplier.id,
      transactionId: created.id,
      amount: totalAmount,
      notes: `Purchase ${referenceNumber}`,
    });

    if (paidAmount.gt(0)) {
      await ledgerService.recordSupplierDebitTx(tx, {
        businessId,
        supplierId: supplier.id,
        transactionId: created.id,
        amount: paidAmount,
        notes: `Payment on purchase ${referenceNumber}`,
      });
    }

    const full = await tx.transaction.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return serializeTransaction(full);
  },

  /**
   * Central Purchase Engine:
   * Validates supplier & products, computes totals on the backend using Prisma.Decimal,
   * creates Transaction + TransactionItems, increases stock (PURCHASE_IN), records Payment,
   * and updates supplier LedgerEntry — all inside one atomic Prisma transaction.
   */
  async recordPurchase(
    businessId: string,
    input: PurchaseTxInput,
    db?: PrismaClient
  ): Promise<SerializedTransaction> {
    const prisma = db ?? requirePrisma();
    return prisma.$transaction((tx) =>
      transactionService.recordPurchaseTx(tx, businessId, input)
    );
  },

  async recordSaleTx(
    tx: TxClient,
    businessId: string,
    input: SaleTxInput
  ): Promise<SerializedTransaction> {
    let customer: { id: string; name: string } | null = null;
    if (input.customerId) {
      customer = await tx.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true, name: true },
      });
      if (!customer) {
        throw new NotFoundError("Customer not found for this business.");
      }
    }

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId, isActive: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const preparedItems = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(
          `Active product (${item.productId}) not found for this business.`
        );
      }
      const qty = roundStock(item.quantity);
      const unitPrice = roundMoney(
        item.unitPrice !== undefined ? item.unitPrice : product.sellingPrice
      );
      const totalPrice = roundMoney(mulDecimals(qty, unitPrice));
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: qty,
        unitPrice,
        totalPrice,
      };
    });

    const itemsSubtotal = roundMoney(
      sumDecimals(preparedItems.map((i) => i.totalPrice))
    );
    const discountDec = roundMoney(input.discountAmount ?? 0);
    const taxDec = roundMoney(input.taxAmount ?? 0);
    const totalAmount = roundMoney(
      addDecimals(subDecimals(itemsSubtotal, discountDec), taxDec)
    );
    if (totalAmount.lt(0)) {
      throw new ValidationError("Sale total cannot be negative.");
    }

    const paidAmount = roundMoney(input.paidAmount);

    if (paidAmount.gt(totalAmount)) {
      throw new ValidationError(
        `Paid amount (₹${paidAmount.toString()}) cannot exceed bill total (₹${totalAmount.toString()}).`
      );
    }

    if (!customer && paidAmount.lt(totalAmount)) {
      throw new ValidationError(
        "Walk-in sales must be paid in full. Select a customer to record credit (Udhaar)."
      );
    }

    const paymentStatus = computePaymentStatus(totalAmount, paidAmount);
    const referenceNumber = input.referenceNumber ?? generateReference("BILL");

    const created = await tx.transaction.create({
      data: {
        businessId,
        transactionType: "SALE",
        referenceNumber,
        transactionDate: input.transactionDate ?? new Date(),
        customerId: customer?.id ?? null,
        documentId: input.documentId ?? null,
        totalAmount,
        paidAmount,
        paymentStatus,
        status: "CONFIRMED",
        notes: input.notes ?? null,
        items: {
          create: preparedItems,
        },
      },
    });

    for (const item of preparedItems) {
      await removeStockTx(tx, {
        businessId,
        productId: item.productId,
        quantity: item.quantity,
        movementType: "SALE_OUT",
        referenceId: created.id,
        notes: `Sale ${referenceNumber}`,
      });
    }

    if (paidAmount.gt(0)) {
      await tx.payment.create({
        data: {
          businessId,
          transactionId: created.id,
          amount: paidAmount,
          paymentMethod: input.paymentMethod,
          notes: `Initial payment for ${referenceNumber}`,
        },
      });
    }

    if (customer) {
      await ledgerService.recordCustomerDebitTx(tx, {
        businessId,
        customerId: customer.id,
        transactionId: created.id,
        amount: totalAmount,
        notes: `Sale ${referenceNumber}`,
      });

      if (paidAmount.gt(0)) {
        await ledgerService.recordCustomerCreditTx(tx, {
          businessId,
          customerId: customer.id,
          transactionId: created.id,
          amount: paidAmount,
          notes: `Payment on sale ${referenceNumber}`,
        });
      }
    }

    const full = await tx.transaction.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return serializeTransaction(full);
  },

  /**
   * Central Sales Engine:
   * Validates products and stock availability, computes totals on the backend using Prisma.Decimal,
   * creates Transaction + TransactionItems, deducts stock atomically (SALE_OUT),
   * records Payment, and updates customer Udhaar LedgerEntry — all inside one atomic Prisma transaction.
   */
  async recordSale(
    businessId: string,
    input: SaleTxInput,
    db?: PrismaClient
  ): Promise<SerializedTransaction> {
    const prisma = db ?? requirePrisma();
    return prisma.$transaction((tx) =>
      transactionService.recordSaleTx(tx, businessId, input)
    );
  },

  /**
   * Records a pending CUSTOMER_ORDER transaction.
   * IMPORTANT: Does NOT deduct inventory until explicit order fulfillment.
   */
  async recordCustomerOrderTx(
    tx: TxClient,
    businessId: string,
    input: CustomerOrderTxInput
  ): Promise<SerializedTransaction> {
    if (input.items.length === 0) {
      throw new ValidationError("Customer order must contain at least one item.");
    }

    if (input.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundError("Customer not found for this business.");
      }
    }

    const preparedItems = input.items.map((item) => {
      const qty = roundStock(item.quantity);
      const unitPrice = roundMoney(item.unitPrice);
      const totalPrice = roundMoney(mulDecimals(qty, unitPrice));
      return {
        productId: item.productId ?? null,
        productNameSnapshot: item.productNameSnapshot,
        quantity: qty,
        unitPrice,
        totalPrice,
      };
    });

    const totalAmount = roundMoney(
      sumDecimals(preparedItems.map((i) => i.totalPrice))
    );
    const referenceNumber = input.referenceNumber ?? generateReference("ORD");

    const created = await tx.transaction.create({
      data: {
        businessId,
        transactionType: "CUSTOMER_ORDER",
        referenceNumber,
        transactionDate: input.transactionDate ?? new Date(),
        customerId: input.customerId ?? null,
        documentId: input.documentId ?? null,
        totalAmount,
        paidAmount: roundMoney(0),
        paymentStatus: "UNPAID",
        status: "PENDING_CONFIRMATION",
        notes: input.notes ?? null,
        items: {
          create: preparedItems,
        },
      },
    });

    const full = await tx.transaction.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return serializeTransaction(full);
  },

  /**
   * Records a business EXPENSE transaction without affecting inventory stock.
   */
  async recordExpenseTx(
    tx: TxClient,
    businessId: string,
    input: ExpenseTxInput
  ): Promise<SerializedTransaction> {
    const totalAmount = roundMoney(input.totalAmount);
    const paidAmount = roundMoney(input.paidAmount);
    if (totalAmount.lte(0)) {
      throw new ValidationError("Expense amount must be greater than zero.");
    }
    if (paidAmount.gt(totalAmount)) {
      throw new ValidationError(
        "Expense paid amount cannot exceed total expense amount."
      );
    }

    const paymentStatus = computePaymentStatus(totalAmount, paidAmount);
    const referenceNumber = input.referenceNumber ?? generateReference("EXP");
    const label = input.category
      ? `[${input.category}] ${input.description}`
      : input.description;

    const created = await tx.transaction.create({
      data: {
        businessId,
        transactionType: "EXPENSE",
        referenceNumber,
        transactionDate: input.transactionDate ?? new Date(),
        documentId: input.documentId ?? null,
        totalAmount,
        paidAmount,
        paymentStatus,
        status: "CONFIRMED",
        notes: input.notes ?? label,
        items: {
          create: [
            {
              productId: null,
              productNameSnapshot: label,
              quantity: roundStock(1),
              unitPrice: totalAmount,
              totalPrice: totalAmount,
            },
          ],
        },
      },
    });

    if (paidAmount.gt(0)) {
      await tx.payment.create({
        data: {
          businessId,
          transactionId: created.id,
          amount: paidAmount,
          paymentMethod: input.paymentMethod,
          notes: `Expense payment (${referenceNumber})`,
        },
      });
    }

    const full = await tx.transaction.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return serializeTransaction(full);
  },

  /**
   * Central Payment Engine:
   * Validates remaining balance, records Payment, updates Transaction paidAmount & paymentStatus,
   * and writes the corresponding Customer or Supplier LedgerEntry atomically.
   */
  async recordPayment(
    businessId: string,
    input: RecordPaymentInput,
    db?: PrismaClient
  ): Promise<SerializedTransaction> {
    const prisma = db ?? requirePrisma();

    return prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.findFirst({
        where: { id: input.transactionId, businessId },
      });

      if (!txn) {
        throw new NotFoundError("Transaction not found for this business.");
      }

      if (txn.status !== "CONFIRMED") {
        throw new ConflictError(
          "Payments can only be recorded for confirmed transactions."
        );
      }

      const amount = roundMoney(input.amount);
      const remaining = roundMoney(subDecimals(txn.totalAmount, txn.paidAmount));

      if (remaining.lte(0)) {
        throw new ConflictError("This transaction is already fully paid.");
      }

      if (amount.gt(remaining)) {
        throw new ValidationError(
          `Payment amount (₹${amount.toString()}) exceeds remaining balance (₹${remaining.toString()}).`
        );
      }

      const newPaidAmount = roundMoney(addDecimals(txn.paidAmount, amount));
      const newPaymentStatus = computePaymentStatus(
        txn.totalAmount,
        newPaidAmount
      );

      await tx.payment.create({
        data: {
          businessId,
          transactionId: txn.id,
          amount,
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? null,
        },
      });

      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      });

      if (txn.transactionType === "SALE" && txn.customerId) {
        await ledgerService.recordCustomerCreditTx(tx, {
          businessId,
          customerId: txn.customerId,
          transactionId: txn.id,
          amount,
          notes: input.notes ?? `Payment for ${txn.referenceNumber ?? txn.id}`,
        });
      } else if (txn.transactionType === "PURCHASE" && txn.supplierId) {
        await ledgerService.recordSupplierDebitTx(tx, {
          businessId,
          supplierId: txn.supplierId,
          transactionId: txn.id,
          amount,
          notes: input.notes ?? `Payment for ${txn.referenceNumber ?? txn.id}`,
        });
      }

      const full = await tx.transaction.findUniqueOrThrow({
        where: { id: txn.id },
        include: {
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
          items: true,
          payments: { orderBy: { createdAt: "desc" } },
        },
      });

      return serializeTransaction(full);
    });
  },

  async listTransactions(
    businessId: string,
    filters: TransactionFilters = {},
    db?: PrismaClient
  ): Promise<SerializedTransaction[]> {
    const prisma = db ?? requirePrisma();
    const transactions = await prisma.transaction.findMany({
      where: {
        businessId,
        ...(filters.transactionType
          ? { transactionType: filters.transactionType }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.fromDate || filters.toDate
          ? {
              transactionDate: {
                ...(filters.fromDate ? { gte: filters.fromDate } : {}),
                ...(filters.toDate ? { lte: filters.toDate } : {}),
              },
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                {
                  referenceNumber: {
                    contains: filters.search,
                    mode: "insensitive",
                  },
                },
                {
                  customer: {
                    name: { contains: filters.search, mode: "insensitive" },
                  },
                },
                {
                  supplier: {
                    name: { contains: filters.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { transactionDate: "desc" },
      take: filters.limit ?? 100,
    });

    return transactions.map(serializeTransaction);
  },

  async getTransactionById(
    businessId: string,
    transactionId: string,
    db?: PrismaClient
  ) {
    const prisma = db ?? requirePrisma();
    const txn = await prisma.transaction.findFirst({
      where: { id: transactionId, businessId },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!txn) {
      throw new NotFoundError("Transaction not found");
    }

    const stockMovements = await prisma.stockMovement.findMany({
      where: { businessId, referenceId: txn.id },
      include: { product: { select: { name: true, unit: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      ...serializeTransaction(txn),
      stockMovements: stockMovements.map((m) => ({
        id: m.id,
        productId: m.productId,
        productName: m.product.name,
        productUnit: m.product.unit,
        movementType: m.movementType,
        quantity: decimalToNumber(m.quantity),
        notes: m.notes,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  },
};
