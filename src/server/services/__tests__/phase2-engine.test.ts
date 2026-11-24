import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { DecimalLike } from "@/server/utils/decimal";
import { productService } from "@/server/services/product.service";
import { inventoryService } from "@/server/services/inventory.service";
import { transactionService } from "@/server/services/transaction.service";
import { analyticsService } from "@/server/services/analytics.service";
import { createProductSchema } from "@/server/validations/phase2";
import { ConflictError, ValidationError } from "@/server/utils/errors";

const BIZ = "demo-kirana-store";

function createInMemoryPrismaMock() {
  const products: Array<{
    id: string;
    businessId: string;
    name: string;
    sku: string | null;
    category: string | null;
    purchasePrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    currentStock: Prisma.Decimal;
    minimumStock: Prisma.Decimal;
    unit: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const customers: Array<{ id: string; businessId: string; name: string; phone: string | null }> = [
    { id: "cust-1", businessId: BIZ, name: "Sunita Devi", phone: "9811100001" },
  ];

  const suppliers: Array<{ id: string; businessId: string; name: string; phone: string | null }> = [
    { id: "sup-1", businessId: BIZ, name: "Mahavir Wholesale", phone: "9822200001" },
  ];

  const transactions: Array<{
    id: string;
    businessId: string;
    transactionType: "PURCHASE" | "SALE" | "CUSTOMER_ORDER" | "EXPENSE" | "RETURN";
    referenceNumber: string | null;
    transactionDate: Date;
    customerId: string | null;
    supplierId: string | null;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    status: "DRAFT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "CANCELLED";
    notes: string | null;
    items: Array<{
      id: string;
      productId: string | null;
      productNameSnapshot: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      totalPrice: Prisma.Decimal;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const stockMovements: Array<{
    id: string;
    businessId: string;
    productId: string;
    movementType: string;
    quantity: Prisma.Decimal;
    referenceId: string | null;
    notes: string | null;
    createdAt: Date;
  }> = [];

  const payments: Array<{
    id: string;
    businessId: string;
    transactionId: string;
    amount: Prisma.Decimal;
    paymentMethod: string;
    notes: string | null;
    createdAt: Date;
  }> = [];

  const ledgerEntries: Array<{
    id: string;
    businessId: string;
    customerId: string | null;
    supplierId: string | null;
    transactionId: string;
    entryType: "DEBIT" | "CREDIT";
    amount: Prisma.Decimal;
    notes: string | null;
    createdAt: Date;
  }> = [];

  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  const txClient = {
    product: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          products.find((p) => {
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.id && p.id !== where.id) return false;
            if (where.sku && p.sku !== where.sku) return false;
            return true;
          }) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          if (where.id && typeof where.id === "object" && "in" in where.id) {
            const ids = (where.id as { in: string[] }).in;
            if (!ids.includes(p.id)) return false;
          }
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const created = {
          id: nextId("prod"),
          businessId: data.businessId as string,
          name: data.name as string,
          sku: (data.sku as string | null) ?? null,
          category: (data.category as string | null) ?? null,
          purchasePrice: new Prisma.Decimal(data.purchasePrice as DecimalLike),
          sellingPrice: new Prisma.Decimal(data.sellingPrice as DecimalLike),
          currentStock: new Prisma.Decimal(data.currentStock as DecimalLike),
          minimumStock: new Prisma.Decimal(data.minimumStock as DecimalLike),
          unit: data.unit as string,
          isActive: (data.isActive as boolean) ?? true,
          createdAt: now,
          updatedAt: now,
        };
        products.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = products.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error("Not found");
        const cur = products[idx];
        const next = {
          ...cur,
          ...data,
          purchasePrice: data.purchasePrice
            ? new Prisma.Decimal(data.purchasePrice as DecimalLike)
            : cur.purchasePrice,
          sellingPrice: data.sellingPrice
            ? new Prisma.Decimal(data.sellingPrice as DecimalLike)
            : cur.sellingPrice,
          minimumStock: data.minimumStock
            ? new Prisma.Decimal(data.minimumStock as DecimalLike)
            : cur.minimumStock,
          updatedAt: new Date(),
        };
        products[idx] = next;
        return next;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const p of products) {
          if (where.id && p.id !== where.id) continue;
          if (where.businessId && p.businessId !== where.businessId) continue;
          if (where.currentStock && typeof where.currentStock === "object" && "gte" in where.currentStock) {
            const minReq = new Prisma.Decimal((where.currentStock as { gte: DecimalLike }).gte);
            if (p.currentStock.lt(minReq)) continue;
          }
          if (data.currentStock && typeof data.currentStock === "object") {
            const op = data.currentStock as { increment?: Prisma.Decimal; decrement?: Prisma.Decimal };
            if (op.increment) p.currentStock = p.currentStock.plus(op.increment);
            if (op.decrement) p.currentStock = p.currentStock.minus(op.decrement);
          }
          count++;
        }
        return { count };
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          return true;
        }).length;
      }),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; businessId: string } }) =>
        customers.find((c) => c.id === where.id && c.businessId === where.businessId) ?? null
      ),
    },
    supplier: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; businessId: string } }) =>
        suppliers.find((s) => s.id === where.id && s.businessId === where.businessId) ?? null
      ),
    },
    transaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const rawItems = ((data.items as { create: Array<Record<string, unknown>> })?.create ?? []).map(
          (i) => ({
            id: nextId("item"),
            productId: (i.productId as string | null) ?? null,
            productNameSnapshot: i.productNameSnapshot as string,
            quantity: new Prisma.Decimal(i.quantity as DecimalLike),
            unitPrice: new Prisma.Decimal(i.unitPrice as DecimalLike),
            totalPrice: new Prisma.Decimal(i.totalPrice as DecimalLike),
          })
        );
        const created = {
          id: nextId("txn"),
          businessId: data.businessId as string,
          transactionType: data.transactionType as "PURCHASE" | "SALE",
          referenceNumber: (data.referenceNumber as string | null) ?? null,
          transactionDate: (data.transactionDate as Date) ?? now,
          customerId: (data.customerId as string | null) ?? null,
          supplierId: (data.supplierId as string | null) ?? null,
          totalAmount: new Prisma.Decimal(data.totalAmount as DecimalLike),
          paidAmount: new Prisma.Decimal(data.paidAmount as DecimalLike),
          paymentStatus: data.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
          status: data.status as "CONFIRMED",
          notes: (data.notes as string | null) ?? null,
          items: rawItems,
          createdAt: now,
          updatedAt: now,
        };
        transactions.push(created);
        return created;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; businessId: string } }) =>
        transactions.find((t) => t.id === where.id && t.businessId === where.businessId) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return transactions.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.transactionType && typeof where.transactionType === "string" && t.transactionType !== where.transactionType) return false;
          if (where.status && t.status !== where.status) return false;
          return true;
        });
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = transactions.find((t) => t.id === where.id);
        if (!found) throw new Error("Not found");
        return {
          ...found,
          customer: found.customerId
            ? customers.find((c) => c.id === found.customerId) ?? null
            : null,
          supplier: found.supplierId
            ? suppliers.find((s) => s.id === found.supplierId) ?? null
            : null,
          payments: payments.filter((p) => p.transactionId === found.id),
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = transactions.findIndex((t) => t.id === where.id);
        if (idx === -1) throw new Error("Not found");
        transactions[idx] = {
          ...transactions[idx],
          paidAmount: data.paidAmount
            ? new Prisma.Decimal(data.paidAmount as DecimalLike)
            : transactions[idx].paidAmount,
          paymentStatus: (data.paymentStatus as "UNPAID" | "PARTIAL" | "PAID") ?? transactions[idx].paymentStatus,
          updatedAt: new Date(),
        };
        return transactions[idx];
      }),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: nextId("mov"),
          businessId: data.businessId as string,
          productId: data.productId as string,
          movementType: data.movementType as string,
          quantity: new Prisma.Decimal(data.quantity as DecimalLike),
          referenceId: (data.referenceId as string | null) ?? null,
          notes: (data.notes as string | null) ?? null,
          createdAt: new Date(),
        };
        stockMovements.push(created);
        return created;
      }),
      findMany: vi.fn(async () =>
        stockMovements.map((m) => ({
          ...m,
          product: {
            name: products.find((p) => p.id === m.productId)?.name ?? "",
            unit: products.find((p) => p.id === m.productId)?.unit ?? "pcs",
          },
        }))
      ),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: nextId("pay"),
          businessId: data.businessId as string,
          transactionId: data.transactionId as string,
          amount: new Prisma.Decimal(data.amount as DecimalLike),
          paymentMethod: data.paymentMethod as string,
          notes: (data.notes as string | null) ?? null,
          createdAt: new Date(),
        };
        payments.push(created);
        return created;
      }),
    },
    ledgerEntry: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: nextId("led"),
          businessId: data.businessId as string,
          customerId: (data.customerId as string | null) ?? null,
          supplierId: (data.supplierId as string | null) ?? null,
          transactionId: data.transactionId as string,
          entryType: data.entryType as "DEBIT" | "CREDIT",
          amount: new Prisma.Decimal(data.amount as DecimalLike),
          notes: (data.notes as string | null) ?? null,
          createdAt: new Date(),
        };
        ledgerEntries.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return ledgerEntries.filter((e) => {
          if (where.businessId && e.businessId !== where.businessId) return false;
          if (where.customerId && typeof where.customerId === "string" && e.customerId !== where.customerId) return false;
          if (where.supplierId && typeof where.supplierId === "string" && e.supplierId !== where.supplierId) return false;
          if (where.customerId && typeof where.customerId === "object" && "not" in where.customerId && e.customerId === null) return false;
          if (where.supplierId && typeof where.supplierId === "object" && "not" in where.supplierId && e.supplierId === null) return false;
          return true;
        });
      }),
    },
  };

  const prismaMock = {
    ...txClient,
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      // Snapshot arrays so failed transactions roll back cleanly
      const snapProducts = products.map((p) => ({ ...p }));
      const snapTxns = transactions.map((t) => ({ ...t }));
      const snapMovs = [...stockMovements];
      const snapPays = [...payments];
      const snapLed = [...ledgerEntries];
      try {
        return await fn(txClient);
      } catch (err) {
        products.splice(0, products.length, ...snapProducts);
        transactions.splice(0, transactions.length, ...snapTxns);
        stockMovements.splice(0, stockMovements.length, ...snapMovs);
        payments.splice(0, payments.length, ...snapPays);
        ledgerEntries.splice(0, ledgerEntries.length, ...snapLed);
        throw err;
      }
    }),
  };

  return {
    db: prismaMock as unknown as PrismaClient,
    state: { products, transactions, stockMovements, payments, ledgerEntries },
  };
}

describe("BizSaathi Phase 2 Business Engine", () => {
  it("validates product prices and rejects duplicate SKUs", async () => {
    const parsed = createProductSchema.safeParse({
      name: "Bad Item",
      purchasePrice: -10,
      sellingPrice: 20,
    });
    expect(parsed.success).toBe(false);

    const { db } = createInMemoryPrismaMock();
    const created = await productService.createProduct(
      BIZ,
      {
        name: "Tata Salt 1kg",
        sku: "SALT-1",
        category: "Staples",
        purchasePrice: 24,
        sellingPrice: 28,
        currentStock: 0,
        minimumStock: 5,
        unit: "pkt",
      },
      db
    );
    expect(created.name).toBe("Tata Salt 1kg");

    await expect(
      productService.createProduct(
        BIZ,
        {
          name: "Duplicate Salt",
          sku: "SALT-1",
          purchasePrice: 24,
          sellingPrice: 28,
          currentStock: 0,
          minimumStock: 5,
          unit: "pkt",
        },
        db
      )
    ).rejects.toThrow(ConflictError);

    const archived = await productService.archiveProduct(BIZ, created.id, db);
    expect(archived.isActive).toBe(false);
  });

  it("handles dashboard empty state accurately when no records exist", async () => {
    const { db } = createInMemoryPrismaMock();
    const summary = await analyticsService.getDashboardSummary(BIZ, db);
    expect(summary.todaySales).toBe(0);
    expect(summary.todayPurchases).toBe(0);
    expect(summary.outstandingCustomerDues).toBe(0);
    expect(summary.totalSupplierPayables).toBe(0);
    expect(summary.totalProducts).toBe(0);
  });

  it("executes purchase -> sale -> partial payments -> ledger & stock invariants atomically", async () => {
    const { db, state } = createInMemoryPrismaMock();

    const milk = await productService.createProduct(
      BIZ,
      {
        name: "Amul Milk 500ml",
        sku: "MILK-500",
        category: "Dairy",
        purchasePrice: 25,
        sellingPrice: 30,
        currentStock: 0,
        minimumStock: 5,
        unit: "pkt",
      },
      db
    );

    // 1. Purchase 20 units @ ₹25 = ₹500, pay ₹200 -> ₹300 payable
    const purchase = await transactionService.recordPurchase(
      BIZ,
      {
        supplierId: "sup-1",
        items: [{ productId: milk.id, quantity: 20, unitPrice: 25 }],
        paidAmount: 200,
        paymentMethod: "BANK_TRANSFER",
      },
      db
    );
    expect(purchase.totalAmount).toBe(500);
    expect(purchase.outstandingAmount).toBe(300);
    expect(purchase.paymentStatus).toBe("PARTIAL");
    expect(await inventoryService.getAvailableStock(BIZ, milk.id, db)).toBe(20);

    // 2. Credit sale of 10 units @ ₹30 = ₹300, pay ₹100 -> ₹200 Udhaar
    const sale = await transactionService.recordSale(
      BIZ,
      {
        customerId: "cust-1",
        items: [{ productId: milk.id, quantity: 10 }],
        paidAmount: 100,
        paymentMethod: "CASH",
      },
      db
    );
    expect(sale.totalAmount).toBe(300);
    expect(sale.outstandingAmount).toBe(200);
    expect(await inventoryService.getAvailableStock(BIZ, milk.id, db)).toBe(10);

    // 3. Reject sale exceeding available stock (15 > 10) and verify rollback
    await expect(
      transactionService.recordSale(
        BIZ,
        {
          customerId: "cust-1",
          items: [{ productId: milk.id, quantity: 15 }],
          paidAmount: 0,
          paymentMethod: "CASH",
        },
        db
      )
    ).rejects.toThrow(ConflictError);
    expect(await inventoryService.getAvailableStock(BIZ, milk.id, db)).toBe(10);

    // 4. Reject walk-in partial payment
    await expect(
      transactionService.recordSale(
        BIZ,
        {
          items: [{ productId: milk.id, quantity: 2 }],
          paidAmount: 10,
          paymentMethod: "CASH",
        },
        db
      )
    ).rejects.toThrow(ValidationError);

    // 5. Partial customer payment ₹100 -> remaining Udhaar becomes ₹100
    const afterCustPay = await transactionService.recordPayment(
      BIZ,
      { transactionId: sale.id, amount: 100, paymentMethod: "UPI" },
      db
    );
    expect(afterCustPay.outstandingAmount).toBe(100);

    // 6. Reject overpayment (> ₹100)
    await expect(
      transactionService.recordPayment(
        BIZ,
        { transactionId: sale.id, amount: 150, paymentMethod: "CASH" },
        db
      )
    ).rejects.toThrow(ValidationError);

    // 7. Partial supplier payment ₹150 -> remaining payable becomes ₹150
    const afterSupPay = await transactionService.recordPayment(
      BIZ,
      { transactionId: purchase.id, amount: 150, paymentMethod: "UPI" },
      db
    );
    expect(afterSupPay.outstandingAmount).toBe(150);

    // 8. Verify dashboard aggregation
    const summary = await analyticsService.getDashboardSummary(BIZ, db);
    expect(summary.todaySales).toBe(300);
    expect(summary.todayPurchases).toBe(500);
    expect(summary.outstandingCustomerDues).toBe(100);
    expect(summary.totalSupplierPayables).toBe(150);
    expect(state.stockMovements.length).toBe(2);
  });
});
