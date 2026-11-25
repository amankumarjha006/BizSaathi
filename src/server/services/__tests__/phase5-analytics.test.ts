import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { businessInsightsService } from "@/server/services/analytics/business-insights.service";
import { dashboardAnalyticsService } from "@/server/services/analytics/dashboard.service";
import {
  formatDateInBusinessTz,
  resolveAnalyticsDateRange,
} from "@/server/services/analytics/date-range";
import { expenseAnalyticsService } from "@/server/services/analytics/expense-analytics.service";
import { inventoryAnalyticsService } from "@/server/services/analytics/inventory-analytics.service";
import { paymentAnalyticsService } from "@/server/services/analytics/payment-analytics.service";
import { salesAnalyticsService } from "@/server/services/analytics/sales-analytics.service";
import { voiceService } from "@/server/services/voice.service";
import { buildCsv, formatInrPlain } from "@/server/utils/csv";
import { analyticsQuerySchema } from "@/server/validations/analytics";

const BIZ = "demo-kirana-store";

function createAnalyticsPrismaMock(options: { empty?: boolean } = {}) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const products = options.empty
    ? []
    : [
        {
          id: "p-milk",
          businessId: BIZ,
          name: "Amul Milk 500ml",
          sku: "DAIRY-001",
          category: "Dairy",
          purchasePrice: new Prisma.Decimal(25),
          sellingPrice: new Prisma.Decimal(30),
          currentStock: new Prisma.Decimal(8),
          minimumStock: new Prisma.Decimal(15), // Low stock
          unit: "pkt",
          isActive: true,
        },
        {
          id: "p-bread",
          businessId: BIZ,
          name: "Britannia Bread",
          sku: "BAK-001",
          category: "Bakery",
          purchasePrice: new Prisma.Decimal(30),
          sellingPrice: new Prisma.Decimal(40),
          currentStock: new Prisma.Decimal(25),
          minimumStock: new Prisma.Decimal(10), // Healthy
          unit: "pkt",
          isActive: true,
        },
        {
          id: "p-salt",
          businessId: BIZ,
          name: "Tata Salt 1kg",
          sku: "STP-001",
          category: "Staples",
          purchasePrice: new Prisma.Decimal(20),
          sellingPrice: new Prisma.Decimal(28),
          currentStock: new Prisma.Decimal(0), // Out of stock
          minimumStock: new Prisma.Decimal(10),
          unit: "pkt",
          isActive: true,
        },
      ];

  const customers = options.empty
    ? []
    : [
        {
          id: "c-rahul",
          businessId: BIZ,
          name: "Rahul Sharma",
          phone: "9811100001",
          createdAt: now,
          updatedAt: now,
          transactions: [
            { totalAmount: new Prisma.Decimal(1000), paidAmount: new Prisma.Decimal(700) },
          ],
          ledgerEntries: [
            { entryType: "DEBIT", amount: new Prisma.Decimal(1000) },
            { entryType: "CREDIT", amount: new Prisma.Decimal(700) },
          ],
        },
      ];

  const suppliers = options.empty
    ? []
    : [
        {
          id: "s-mahavir",
          businessId: BIZ,
          name: "Mahavir Wholesale",
          phone: "9822200001",
          createdAt: now,
          updatedAt: now,
          transactions: [
            { totalAmount: new Prisma.Decimal(500), paidAmount: new Prisma.Decimal(200) },
          ],
          ledgerEntries: [
            { entryType: "CREDIT", amount: new Prisma.Decimal(500) },
            { entryType: "DEBIT", amount: new Prisma.Decimal(200) },
          ],
        },
      ];

  const transactions = options.empty
    ? []
    : [
        // Today confirmed sale: ₹1000 (₹700 paid -> ₹300 Udhaar)
        {
          id: "tx-sale-1",
          businessId: BIZ,
          transactionType: "SALE",
          referenceNumber: "BILL-101",
          transactionDate: now,
          customerId: "c-rahul",
          supplierId: null,
          totalAmount: new Prisma.Decimal(1000),
          paidAmount: new Prisma.Decimal(700),
          paymentStatus: "PARTIAL",
          status: "CONFIRMED",
          notes: null,
          customer: { name: "Rahul Sharma" },
          supplier: null,
          items: [
            {
              id: "i-1",
              productId: "p-bread",
              productNameSnapshot: "Britannia Bread",
              quantity: new Prisma.Decimal(25),
              unitPrice: new Prisma.Decimal(40),
              totalPrice: new Prisma.Decimal(1000),
            },
          ],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        // Yesterday confirmed sale: ₹400
        {
          id: "tx-sale-yest",
          businessId: BIZ,
          transactionType: "SALE",
          referenceNumber: "BILL-100",
          transactionDate: yesterday,
          customerId: null,
          supplierId: null,
          totalAmount: new Prisma.Decimal(400),
          paidAmount: new Prisma.Decimal(400),
          paymentStatus: "PAID",
          status: "CONFIRMED",
          notes: null,
          customer: null,
          supplier: null,
          items: [
            {
              id: "i-2",
              productId: "p-milk",
              productNameSnapshot: "Amul Milk 500ml",
              quantity: new Prisma.Decimal(10),
              unitPrice: new Prisma.Decimal(40),
              totalPrice: new Prisma.Decimal(400),
            },
          ],
          payments: [],
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        // Cancelled sale (MUST be excluded)
        {
          id: "tx-sale-cancelled",
          businessId: BIZ,
          transactionType: "SALE",
          referenceNumber: "BILL-BAD",
          transactionDate: now,
          customerId: null,
          supplierId: null,
          totalAmount: new Prisma.Decimal(9999),
          paidAmount: new Prisma.Decimal(0),
          paymentStatus: "UNPAID",
          status: "CANCELLED",
          notes: null,
          customer: null,
          supplier: null,
          items: [],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        // Pending customer order (MUST be excluded from sales)
        {
          id: "tx-order-pending",
          businessId: BIZ,
          transactionType: "CUSTOMER_ORDER",
          referenceNumber: "ORD-1",
          transactionDate: now,
          customerId: "c-rahul",
          supplierId: null,
          totalAmount: new Prisma.Decimal(800),
          paidAmount: new Prisma.Decimal(0),
          paymentStatus: "UNPAID",
          status: "PENDING_CONFIRMATION",
          notes: null,
          customer: { name: "Rahul Sharma" },
          supplier: null,
          items: [],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        // Today return: ₹100
        {
          id: "tx-return-1",
          businessId: BIZ,
          transactionType: "RETURN",
          referenceNumber: "RET-1",
          transactionDate: now,
          customerId: null,
          supplierId: null,
          totalAmount: new Prisma.Decimal(100),
          paidAmount: new Prisma.Decimal(100),
          paymentStatus: "PAID",
          status: "CONFIRMED",
          notes: null,
          customer: null,
          supplier: null,
          items: [],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        // Today purchase: ₹500 (₹200 paid)
        {
          id: "tx-pur-1",
          businessId: BIZ,
          transactionType: "PURCHASE",
          referenceNumber: "PUR-1",
          transactionDate: now,
          customerId: null,
          supplierId: "s-mahavir",
          totalAmount: new Prisma.Decimal(500),
          paidAmount: new Prisma.Decimal(200),
          paymentStatus: "PARTIAL",
          status: "CONFIRMED",
          notes: null,
          customer: null,
          supplier: { name: "Mahavir Wholesale" },
          items: [],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        // Today expense: ₹150 (Utilities) + ₹50 (Uncategorized)
        {
          id: "tx-exp-1",
          businessId: BIZ,
          transactionType: "EXPENSE",
          referenceNumber: "EXP-1",
          transactionDate: now,
          customerId: null,
          supplierId: null,
          totalAmount: new Prisma.Decimal(150),
          paidAmount: new Prisma.Decimal(150),
          paymentStatus: "PAID",
          status: "CONFIRMED",
          notes: "[Utilities] Electricity bill",
          customer: null,
          supplier: null,
          items: [
            {
              id: "i-e1",
              productId: null,
              productNameSnapshot: "[Utilities] Electricity bill",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(150),
              totalPrice: new Prisma.Decimal(150),
            },
          ],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "tx-exp-2",
          businessId: BIZ,
          transactionType: "EXPENSE",
          referenceNumber: "EXP-2",
          transactionDate: now,
          customerId: null,
          supplierId: null,
          totalAmount: new Prisma.Decimal(50),
          paidAmount: new Prisma.Decimal(50),
          paymentStatus: "PAID",
          status: "CONFIRMED",
          notes: "Tea for shop helper",
          customer: null,
          supplier: null,
          items: [
            {
              id: "i-e2",
              productId: null,
              productNameSnapshot: "Tea for shop helper",
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(50),
              totalPrice: new Prisma.Decimal(50),
            },
          ],
          payments: [],
          createdAt: now,
          updatedAt: now,
        },
      ];

  const payments = options.empty
    ? []
    : [
        {
          id: "pay-1",
          businessId: BIZ,
          transactionId: "tx-sale-1",
          amount: new Prisma.Decimal(700),
          paymentMethod: "UPI",
          createdAt: now,
          transaction: {
            transactionType: "SALE",
            status: "CONFIRMED",
            referenceNumber: "BILL-101",
            customer: { name: "Rahul Sharma" },
            supplier: null,
          },
        },
        {
          id: "pay-2",
          businessId: BIZ,
          transactionId: "tx-pur-1",
          amount: new Prisma.Decimal(200),
          paymentMethod: "BANK_TRANSFER",
          createdAt: now,
          transaction: {
            transactionType: "PURCHASE",
            status: "CONFIRMED",
            referenceNumber: "PUR-1",
            customer: null,
            supplier: { name: "Mahavir Wholesale" },
          },
        },
        {
          id: "pay-3",
          businessId: BIZ,
          transactionId: "tx-exp-1",
          amount: new Prisma.Decimal(150),
          paymentMethod: "CASH",
          createdAt: now,
          transaction: {
            transactionType: "EXPENSE",
            status: "CONFIRMED",
            referenceNumber: "EXP-1",
            customer: null,
            supplier: null,
          },
        },
        {
          id: "pay-4",
          businessId: BIZ,
          transactionId: "tx-exp-2",
          amount: new Prisma.Decimal(50),
          paymentMethod: "CASH",
          createdAt: now,
          transaction: {
            transactionType: "EXPENSE",
            status: "CONFIRMED",
            referenceNumber: "EXP-2",
            customer: null,
            supplier: null,
          },
        },
      ];

  const voiceCommands: Array<Record<string, unknown>> = [];
  let seq = 1;

  const matchesDateRange = (
    dt: Date,
    filter?: { gte?: Date; lte?: Date }
  ): boolean => {
    if (!filter) return true;
    if (filter.gte && dt < filter.gte) return false;
    if (filter.lte && dt > filter.lte) return false;
    return true;
  };

  const mock = {
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
          return true;
        });
      }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return customers.filter((c) => !where.businessId || c.businessId === where.businessId);
      }),
    },
    supplier: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return suppliers.filter((s) => !where.businessId || s.businessId === where.businessId);
      }),
    },
    transaction: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return transactions.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.status && t.status !== where.status) return false;
          if (where.transactionType) {
            if (typeof where.transactionType === "string" && t.transactionType !== where.transactionType) return false;
            if (typeof where.transactionType === "object" && "in" in where.transactionType) {
              const list = (where.transactionType as { in: string[] }).in;
              if (!list.includes(t.transactionType)) return false;
            }
          }
          if (where.transactionDate && !matchesDateRange(t.transactionDate, where.transactionDate as { gte?: Date; lte?: Date })) {
            return false;
          }
          return true;
        });
      }),
    },
    payment: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return payments.filter((p) => {
          if (where.businessId && p.businessId !== where.businessId) return false;
          if (where.createdAt && !matchesDateRange(p.createdAt, where.createdAt as { gte?: Date; lte?: Date })) {
            return false;
          }
          if (where.transaction && typeof where.transaction === "object") {
            const txW = where.transaction as Record<string, unknown>;
            if (txW.transactionType && p.transaction.transactionType !== txW.transactionType) return false;
            if (txW.status && p.transaction.status !== txW.status) return false;
          }
          return true;
        });
      }),
    },
    voiceCommand: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `vc-${seq++}`,
          ...data,
          interpretedIntent: null,
          extractedEntities: null,
          resultSummary: null,
          failureReason: null,
          relatedTransactionId: null,
          createdAt: now,
          executedAt: null,
        };
        voiceCommands.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = voiceCommands.findIndex((c) => c.id === where.id);
        voiceCommands[idx] = { ...voiceCommands[idx], ...data };
        return voiceCommands[idx];
      }),
    },
  };

  return mock as unknown as PrismaClient;
}

describe("BizSaathi Phase 5 Business Intelligence & Smart Dashboard", () => {
  it("computes Asia/Kolkata business date boundaries accurately across UTC midnight", () => {
    // 2026-11-24 19:00:00Z is 2026-11-25 00:30:00 IST
    const istEarlyMorning = new Date("2026-11-24T19:00:00.000Z");
    expect(formatDateInBusinessTz(istEarlyMorning, "Asia/Kolkata")).toBe(
      "2026-11-25"
    );

    const range = resolveAnalyticsDateRange({
      preset: "TODAY",
      referenceNow: istEarlyMorning,
    });
    expect(formatDateInBusinessTz(range.start, "Asia/Kolkata")).toBe("2026-11-25");
    expect(formatDateInBusinessTz(range.previousStart, "Asia/Kolkata")).toBe("2026-11-24");
  });

  it("calculates net sales (excluding cancelled/pending orders, subtracting returns) and separates collections", async () => {
    const db = createAnalyticsPrismaMock();
    const range = resolveAnalyticsDateRange({ preset: "TODAY" });

    const sales = await salesAnalyticsService.getSalesAnalytics(BIZ, range, {}, db);
    // Gross ₹1000 - Return ₹100 = Net ₹900; Previous (yesterday) = ₹400; Growth = +125%
    expect(sales.summary.grossSales).toBe(1000);
    expect(sales.summary.returnsTotal).toBe(100);
    expect(sales.summary.netSales).toBe(900);
    expect(sales.summary.amountCollected).toBe(700);
    expect(sales.summary.previousNetSales).toBe(400);
    expect(sales.summary.salesGrowthPct).toBe(125);
    expect(sales.paymentDistribution.UPI).toBe(700);

    // Cash movement: ₹700 received - (₹200 supplier + ₹200 expenses) = ₹300
    const cash = await paymentAnalyticsService.getPaymentAnalytics(BIZ, range, {}, db);
    expect(cash.cashReceived).toBe(700);
    expect(cash.cashPaidSuppliers).toBe(200);
    expect(cash.cashPaidExpenses).toBe(200);
    expect(cash.netRecordedCashMovement).toBe(300);
  });

  it("computes inventory health, purchase-cost valuation, and expense categories cleanly", async () => {
    const db = createAnalyticsPrismaMock();
    const range = resolveAnalyticsDateRange({ preset: "TODAY" });

    const inv = await inventoryAnalyticsService.getInventoryAnalytics(BIZ, range, {}, db);
    expect(inv.stockHealth.totalActiveProducts).toBe(3);
    expect(inv.stockHealth.healthyCount).toBe(1);
    expect(inv.stockHealth.lowStockCount).toBe(2); // milk (8 <= 15) + salt (0 <= 10)
    expect(inv.stockHealth.outOfStockCount).toBe(1); // salt
    // Valuation: (8 * 25) + (25 * 30) + (0 * 20) = 200 + 750 = 950 (uses purchasePrice, NOT sellingPrice)
    expect(inv.valuation.estimatedPurchaseCostValue).toBe(950);
    // Least sold with history excludes zero-sale salt
    expect(inv.productPerformance.leastSoldWithHistory.length).toBe(1);
    expect(inv.productPerformance.leastSoldWithHistory[0].name).toBe("Britannia Bread");

    const exp = await expenseAnalyticsService.getExpenseAnalytics(BIZ, range, {}, db);
    expect(exp.summary.totalExpenses).toBe(200);
    expect(exp.categories.map((c) => c.category)).toContain("Utilities");
    expect(exp.categories.map((c) => c.category)).toContain("Uncategorized");
  });

  it("generates rule-based smart insights, handles empty state, and matches voice assistant metrics", async () => {
    const emptyDb = createAnalyticsPrismaMock({ empty: true });
    const range = resolveAnalyticsDateRange({ preset: "TODAY" });

    const emptyInsights = await businessInsightsService.getInsights(BIZ, range, {}, emptyDb);
    expect(emptyInsights.insights).toEqual([]);

    const db = createAnalyticsPrismaMock();
    const [dash, insightsRes, voiceSalesRes] = await Promise.all([
      dashboardAnalyticsService.getDashboardAnalytics(BIZ, range, "daily", db),
      businessInsightsService.getInsights(
        BIZ,
        range,
        {
          includeAiNarrative: true,
          narrativeRunner: {
            explainMetrics: async () =>
              "Your net sales reached ₹900 today with ₹700 collected via UPI.",
          },
        },
        db
      ),
      voiceService.interpretCommand(
        BIZ,
        {
          transcript: "Aaj ki total sale kitni hui?",
          language: "HINGLISH",
          inputMode: "VOICE",
        },
        {
          db,
          intentRunner: {
            extractIntentJson: async () =>
              JSON.stringify({
                intent: "GET_SALES_SUMMARY",
                language: "HINGLISH",
                entities: {
                  productName: null,
                  customerName: null,
                  supplierName: null,
                  items: [],
                  quantity: null,
                  unit: null,
                  unitPrice: null,
                  paymentAmount: null,
                  paymentMethod: null,
                  expenseAmount: null,
                  expenseCategory: null,
                  expenseDescription: null,
                  datePeriod: "TODAY",
                  adjustmentReason: null,
                },
                missingInformation: [],
                clarificationRequired: false,
                clarificationQuestion: null,
                responseText: "Checking today's sales",
              }),
          },
        }
      ),
    ]);

    expect(insightsRes.insights.some((i) => i.category === "INVENTORY_WARNING")).toBe(true);
    expect(insightsRes.insights.some((i) => i.category === "CUSTOMER_DUES")).toBe(true);
    expect(insightsRes.aiNarrative).toContain("₹900");

    // Dashboard and Voice Assistant report the exact same net sales (₹900)
    expect(dash.salesSummary.netSales).toBe(900);
    expect(voiceSalesRes.commandStatus).toBe("EXECUTED");
    expect(voiceSalesRes.resultSummary).toContain("₹900");
  });

  it("sanitizes CSV exports and validates analytics query params", () => {
    const csv = buildCsv(
      ["Customer", "Due"],
      [["=cmd|' /C calc'!A0", formatInrPlain(300)]]
    );
    expect(csv).toContain("'=cmd|");
    expect(csv).toContain("INR 300.00");

    expect(
      analyticsQuerySchema.safeParse({ preset: "INVALID_RANGE" }).success
    ).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({ preset: "CUSTOM", from: "2026-11-25" }).success
    ).toBe(true);
  });
});
