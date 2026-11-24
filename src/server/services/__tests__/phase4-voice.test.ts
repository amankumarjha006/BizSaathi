import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { BrowserSpeechProvider } from "@/lib/speech/browser-speech-provider";
import { speakResponse } from "@/lib/speech/speech-synthesis";
import { extractVoiceIntent } from "@/server/ai/voice-intent.service";
import { voiceEntityResolutionService } from "@/server/services/voice-entity-resolution.service";
import { voiceService } from "@/server/services/voice.service";
import type { DecimalLike } from "@/server/utils/decimal";
import { ConflictError, ValidationError } from "@/server/utils/errors";

const BIZ = "demo-kirana-store";

function createPhase4InMemoryMock() {
  const products = [
    {
      id: "prod-bread",
      businessId: BIZ,
      name: "Britannia Whole Wheat Bread",
      sku: "BAK-001",
      category: "Bakery",
      purchasePrice: new Prisma.Decimal(25),
      sellingPrice: new Prisma.Decimal(35),
      currentStock: new Prisma.Decimal(15),
      minimumStock: new Prisma.Decimal(5),
      unit: "pkt",
      isActive: true,
      aliases: [{ alias: "Bread" }],
    },
    {
      id: "prod-maggi",
      businessId: BIZ,
      name: "Maggi 2-Minute Noodles 70g",
      sku: "SNK-001",
      category: "Snacks",
      purchasePrice: new Prisma.Decimal(12),
      sellingPrice: new Prisma.Decimal(14),
      currentStock: new Prisma.Decimal(8),
      minimumStock: new Prisma.Decimal(10),
      unit: "pkt",
      isActive: true,
      aliases: [{ alias: "Maggi" }],
    },
    {
      id: "prod-milk",
      businessId: BIZ,
      name: "Amul Taaza Milk 500ml",
      sku: "DAIRY-001",
      category: "Dairy",
      purchasePrice: new Prisma.Decimal(25),
      sellingPrice: new Prisma.Decimal(27),
      currentStock: new Prisma.Decimal(20),
      minimumStock: new Prisma.Decimal(10),
      unit: "pkt",
      isActive: true,
      aliases: [],
    },
  ];

  const customers = [
    { id: "cust-rahul-s", businessId: BIZ, name: "Rahul Sharma", phone: "9811100001" },
    { id: "cust-rahul-v", businessId: BIZ, name: "Rahul Verma", phone: "9811100002" },
  ];

  const suppliers = [
    { id: "sup-1", businessId: BIZ, name: "Mahavir Wholesale", phone: "9822200001" },
  ];

  const voiceCommands: Array<Record<string, unknown>> = [];
  const transactions: Array<Record<string, unknown>> = [];
  const stockMovements: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const ledgerEntries: Array<Record<string, unknown>> = [];

  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  const txClient = {
    product: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          products.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.isActive !== undefined && p.isActive !== where.isActive) return false;
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
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const p of products) {
          if (where.id && p.id !== where.id) continue;
          if (where.businessId && p.businessId !== where.businessId) continue;
          if (where.currentStock && typeof where.currentStock === "object" && "gte" in where.currentStock) {
            const req = new Prisma.Decimal((where.currentStock as { gte: DecimalLike }).gte);
            if (p.currentStock.lt(req)) continue;
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
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        customers.find((c) => c.id === where.id && c.businessId === where.businessId) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        customers.filter((c) => !where.businessId || c.businessId === where.businessId)
      ),
    },
    supplier: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        suppliers.find((s) => s.id === where.id && s.businessId === where.businessId) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        suppliers.filter((s) => !where.businessId || s.businessId === where.businessId)
      ),
    },
    voiceCommand: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const created = {
          id: nextId("vc"),
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
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        voiceCommands.find((c) => c.id === where.id && c.businessId === where.businessId) ?? null
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = voiceCommands.find((c) => c.id === where.id);
        if (!found) throw new Error("Not found");
        return found;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = voiceCommands.findIndex((c) => c.id === where.id);
        if (idx === -1) throw new Error("Not found");
        voiceCommands[idx] = { ...voiceCommands[idx], ...data };
        return voiceCommands[idx];
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < voiceCommands.length; i++) {
          const c = voiceCommands[i];
          if (where.id && c.id !== where.id) continue;
          if (where.businessId && c.businessId !== where.businessId) continue;
          if (where.commandStatus && c.commandStatus !== where.commandStatus) continue;
          voiceCommands[i] = { ...c, ...data };
          count++;
        }
        return { count };
      }),
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
          ...data,
          items: rawItems,
          createdAt: now,
          updatedAt: now,
        };
        transactions.push(created);
        return created;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        transactions.find((t) => t.id === where.id && t.businessId === where.businessId) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return transactions.filter((t) => {
          if (where.businessId && t.businessId !== where.businessId) return false;
          if (where.customerId && t.customerId !== where.customerId) return false;
          if (where.transactionType && t.transactionType !== where.transactionType) return false;
          if (where.status && t.status !== where.status) return false;
          if (where.paymentStatus && typeof where.paymentStatus === "object" && "in" in where.paymentStatus) {
            const list = (where.paymentStatus as { in: string[] }).in;
            if (!list.includes(String(t.paymentStatus))) return false;
          }
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
        transactions[idx] = { ...transactions[idx], ...data };
        return transactions[idx];
      }),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: nextId("mov"), ...data, createdAt: new Date() };
        stockMovements.push(created);
        return created;
      }),
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: nextId("pay"), ...data, createdAt: new Date() };
        payments.push(created);
        return created;
      }),
    },
    ledgerEntry: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: nextId("led"), ...data, createdAt: new Date() };
        ledgerEntries.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return ledgerEntries.filter((e) => {
          if (where.businessId && e.businessId !== where.businessId) return false;
          if (where.customerId && e.customerId !== where.customerId) return false;
          return true;
        });
      }),
    },
  };

  const prismaMock = {
    ...txClient,
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
      fn(txClient)
    ),
  };

  return {
    db: prismaMock as unknown as PrismaClient,
    state: { products, voiceCommands, transactions, stockMovements, payments, ledgerEntries },
  };
}

describe("BizSaathi Phase 4 Multilingual Voice Assistant", () => {
  it("handles unsupported browser SpeechRecognition and SpeechSynthesis gracefully", async () => {
    const provider = new BrowserSpeechProvider();
    expect(provider.isSupported()).toBe(false);

    const states: string[] = [];
    const errors: string[] = [];
    await provider.start("en-IN", {
      onStateChange: (s) => states.push(s),
      onTranscript: () => {},
      onError: (e) => errors.push(e),
    });
    expect(states).toContain("ERROR");
    expect(errors.length).toBe(1);
    expect(speakResponse("Namaste", "HINGLISH")).toBe(false);
  });

  it("validates Gemini voice intent JSON and rejects malformed output", async () => {
    const valid = await extractVoiceIntent(
      { transcript: "Maggi ka kitna stock hai?", language: "HINGLISH" },
      {
        extractIntentJson: async () =>
          JSON.stringify({
            intent: "CHECK_STOCK",
            language: "HINGLISH",
            entities: {
              productName: "Maggi",
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
              datePeriod: null,
              adjustmentReason: null,
            },
            missingInformation: [],
            clarificationRequired: false,
            clarificationQuestion: null,
            responseText: "Maggi ka stock check kar raha hoon.",
          }),
      }
    );
    expect(valid.intent).toBe("CHECK_STOCK");
    expect(valid.entities.productName).toBe("Maggi");

    await expect(
      extractVoiceIntent(
        { transcript: "hello", language: "EN" },
        { extractIntentJson: async () => "{broken-json" }
      )
    ).rejects.toThrow(ValidationError);
  });

  it("resolves Hindi retail synonyms and flags ambiguous customer names", async () => {
    const { db } = createPhase4InMemoryMock();

    const milk = await voiceEntityResolutionService.resolveProduct(
      BIZ,
      "Amul doodh",
      db
    );
    expect(milk.status).toBe("EXACT");
    expect(milk.resolvedProduct?.id).toBe("prod-milk");

    const rahul = await voiceEntityResolutionService.resolveCustomer(
      BIZ,
      "Rahul",
      db
    );
    expect(rahul.status).toBe("AMBIGUOUS");
    expect(rahul.candidates.length).toBe(2);
  });

  it("executes read-only commands immediately and enforces preview + confirmation + idempotency for writes", async () => {
    const { db, state } = createPhase4InMemoryMock();

    // 1. Read-only CHECK_STOCK executes without confirmation
    const stockRes = await voiceService.interpretCommand(
      BIZ,
      {
        transcript: "Maggi ka kitna stock hai?",
        language: "HINGLISH",
        inputMode: "VOICE",
      },
      {
        db,
        intentRunner: {
          extractIntentJson: async () =>
            JSON.stringify({
              intent: "CHECK_STOCK",
              language: "HINGLISH",
              entities: {
                productName: "Maggi",
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
                datePeriod: null,
                adjustmentReason: null,
              },
              missingInformation: [],
              clarificationRequired: false,
              clarificationQuestion: null,
              responseText: "Checking stock",
            }),
        },
      }
    );
    expect(stockRes.commandStatus).toBe("EXECUTED");
    expect(stockRes.resultSummary).toContain("8 pkt");

    // 2. Ambiguous ADD_STOCK without product triggers NEEDS_CLARIFICATION
    const ambigStock = await voiceService.interpretCommand(
      BIZ,
      {
        transcript: "20 packet stock mein add karo",
        language: "HI",
        inputMode: "VOICE",
      },
      {
        db,
        intentRunner: {
          extractIntentJson: async () =>
            JSON.stringify({
              intent: "ADD_STOCK",
              language: "HI",
              entities: {
                productName: null,
                customerName: null,
                supplierName: null,
                items: [],
                quantity: 20,
                unit: "pkt",
                unitPrice: null,
                paymentAmount: null,
                paymentMethod: null,
                expenseAmount: null,
                expenseCategory: null,
                expenseDescription: null,
                datePeriod: null,
                adjustmentReason: null,
              },
              missingInformation: ["productName"],
              clarificationRequired: true,
              clarificationQuestion: "स्टॉक में कौनसा प्रोडक्ट जोड़ना है?",
              responseText: "स्टॉक में कौनसा प्रोडक्ट जोड़ना है?",
            }),
        },
      }
    );
    expect(ambigStock.commandStatus).toBe("NEEDS_CLARIFICATION");

    // 3. Cancel pending command -> cannot execute afterwards
    const cancelled = await voiceService.cancelCommand(BIZ, ambigStock.id, { db });
    expect(cancelled.commandStatus).toBe("CANCELLED");
    await expect(
      voiceService.confirmCommand(BIZ, cancelled.id, { db })
    ).rejects.toThrow(ConflictError);

    // 4. Write RECORD_SALE for Rahul Sharma: 2 Bread @ ₹35 (catalog price) = ₹70, paid ₹60 cash -> ₹10 Udhaar
    const saleDraft = await voiceService.interpretCommand(
      BIZ,
      {
        transcript: "Rahul Sharma ko 2 bread packets de do, 60 rupaye cash mile",
        language: "HINGLISH",
        inputMode: "VOICE",
      },
      {
        db,
        intentRunner: {
          extractIntentJson: async () =>
            JSON.stringify({
              intent: "RECORD_SALE",
              language: "HINGLISH",
              entities: {
                productName: null,
                customerName: "Rahul Sharma",
                supplierName: null,
                items: [
                  {
                    productName: "Bread",
                    quantity: 2,
                    unit: "pkt",
                    unitPrice: 999, // untrusted AI price: backend must override with catalog ₹35
                  },
                ],
                quantity: null,
                unit: null,
                unitPrice: null,
                paymentAmount: 60,
                paymentMethod: "CASH",
                expenseAmount: null,
                expenseCategory: null,
                expenseDescription: null,
                datePeriod: null,
                adjustmentReason: null,
              },
              missingInformation: [],
              clarificationRequired: false,
              clarificationQuestion: null,
              responseText: "Sale preview ready.",
            }),
        },
      }
    );
    expect(saleDraft.commandStatus).toBe("AWAITING_CONFIRMATION");
    expect(saleDraft.draft?.calculatedTotal).toBe(70); // Uses catalog ₹35 * 2, not AI ₹999

    const confirmedSale = await voiceService.confirmCommand(
      BIZ,
      saleDraft.id,
      { db }
    );
    expect(confirmedSale.commandStatus).toBe("EXECUTED");
    expect(confirmedSale.relatedTransactionId).toBeTruthy();
    expect(state.products[0].currentStock.toNumber()).toBe(13); // 15 - 2

    // Idempotency: second confirm blocked
    await expect(
      voiceService.confirmCommand(BIZ, saleDraft.id, { db })
    ).rejects.toThrow(ConflictError);

    // 5. Read-only CHECK_CUSTOMER_DUES shows ₹10 pending for Rahul Sharma
    const duesRes = await voiceService.interpretCommand(
      BIZ,
      {
        transcript: "Rahul Sharma ka kitna udhaar baaki hai?",
        language: "HINGLISH",
        inputMode: "TEXT",
      },
      {
        db,
        intentRunner: {
          extractIntentJson: async () =>
            JSON.stringify({
              intent: "CHECK_CUSTOMER_DUES",
              language: "HINGLISH",
              entities: {
                productName: null,
                customerName: "Rahul Sharma",
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
                datePeriod: null,
                adjustmentReason: null,
              },
              missingInformation: [],
              clarificationRequired: false,
              clarificationQuestion: null,
              responseText: "Checking dues",
            }),
        },
      }
    );
    expect(duesRes.commandStatus).toBe("EXECUTED");
    expect(duesRes.resultSummary).toContain("₹10");

    // 6. Read-only GET_SALES_SUMMARY returns ₹70
    const salesSum = await voiceService.interpretCommand(
      BIZ,
      {
        transcript: "Show today's total sales",
        language: "EN",
        inputMode: "TEXT",
      },
      {
        db,
        intentRunner: {
          extractIntentJson: async () =>
            JSON.stringify({
              intent: "GET_SALES_SUMMARY",
              language: "EN",
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
    );
    expect(salesSum.commandStatus).toBe("EXECUTED");
    expect(salesSum.resultSummary).toContain("₹70");
  });
});
