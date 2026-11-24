import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { extractDocumentWithGemini } from "@/server/ai/document-extraction.service";
import { documentService } from "@/server/services/document.service";
import {
  matchProductAgainstCatalog,
  type CatalogProductCandidate,
} from "@/server/services/product-matching.service";
import { LocalPrivateDocumentStorage } from "@/server/storage/document-storage";
import type { DecimalLike } from "@/server/utils/decimal";
import { ConflictError, ValidationError } from "@/server/utils/errors";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  validateUploadedDocument,
} from "@/server/validations/document-upload";

const BIZ = "demo-kirana-store";

function makeValidJpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function makeValidPngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function makeValidPdfBuffer(pages = 1): Buffer {
  const pageObjs = Array.from({ length: pages }, (_, i) => `${i + 1} 0 obj << /Type /Page >> endobj`).join("\n");
  return Buffer.from(
    `%PDF-1.4\n0 0 obj << /Type /Pages /Count ${pages} >> endobj\n${pageObjs}\n%%EOF`,
    "latin1"
  );
}

function createPhase3InMemoryMock() {
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
    aliases: Array<{ alias: string; normalizedAlias: string }>;
  }> = [
    {
      id: "prod-milk",
      businessId: BIZ,
      name: "Amul Taaza Milk 500ml",
      sku: "DAIRY-001",
      category: "Dairy",
      purchasePrice: new Prisma.Decimal(25),
      sellingPrice: new Prisma.Decimal(27),
      currentStock: new Prisma.Decimal(10),
      minimumStock: new Prisma.Decimal(5),
      unit: "pkt",
      isActive: true,
      aliases: [{ alias: "Amul Milk 500ml", normalizedAlias: "amul milk 500ml" }],
    },
    {
      id: "prod-bread",
      businessId: BIZ,
      name: "Britannia Whole Wheat Bread",
      sku: "BAK-001",
      category: "Bakery",
      purchasePrice: new Prisma.Decimal(30),
      sellingPrice: new Prisma.Decimal(35),
      currentStock: new Prisma.Decimal(5),
      minimumStock: new Prisma.Decimal(4),
      unit: "pkt",
      isActive: true,
      aliases: [],
    },
  ];

  const productAliases: Array<{
    id: string;
    businessId: string;
    productId: string;
    alias: string;
    normalizedAlias: string;
  }> = [
    {
      id: "alias-1",
      businessId: BIZ,
      productId: "prod-milk",
      alias: "Amul Milk 500ml",
      normalizedAlias: "amul milk 500ml",
    },
  ];

  const suppliers: Array<{ id: string; businessId: string; name: string }> = [];
  const customers: Array<{ id: string; businessId: string; name: string }> = [];
  const documents: Array<Record<string, unknown>> = [];
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
        const created = {
          id: nextId("prod"),
          businessId: data.businessId as string,
          name: data.name as string,
          sku: (data.sku as string | null) ?? null,
          category: null,
          purchasePrice: new Prisma.Decimal(data.purchasePrice as DecimalLike),
          sellingPrice: new Prisma.Decimal(data.sellingPrice as DecimalLike),
          currentStock: new Prisma.Decimal(data.currentStock as DecimalLike),
          minimumStock: new Prisma.Decimal(data.minimumStock as DecimalLike),
          unit: data.unit as string,
          isActive: true,
          aliases: [],
        };
        products.push(created);
        return created;
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
    productAlias: {
      findFirst: vi.fn(async ({ where }: { where: { businessId: string; normalizedAlias: string } }) =>
        productAliases.find(
          (a) => a.businessId === where.businessId && a.normalizedAlias === where.normalizedAlias
        ) ?? null
      ),
      create: vi.fn(async ({ data }: { data: { businessId: string; productId: string; alias: string; normalizedAlias: string } }) => {
        const created = { id: nextId("alias"), ...data };
        productAliases.push(created);
        return created;
      }),
    },
    supplier: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          suppliers.find((s) => {
            if (where.businessId && s.businessId !== where.businessId) return false;
            if (where.id && s.id !== where.id) return false;
            if (where.name && typeof where.name === "object" && "equals" in where.name) {
              const target = String((where.name as { equals: string }).equals).toLowerCase();
              if (s.name.toLowerCase() !== target) return false;
            }
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: { businessId: string; name: string } }) => {
        const created = { id: nextId("sup"), ...data };
        suppliers.push(created);
        return created;
      }),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          customers.find((c) => {
            if (where.businessId && c.businessId !== where.businessId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.name && typeof where.name === "object" && "equals" in where.name) {
              const target = String((where.name as { equals: string }).equals).toLowerCase();
              if (c.name.toLowerCase() !== target) return false;
            }
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: { businessId: string; name: string } }) => {
        const created = { id: nextId("cust"), ...data };
        customers.push(created);
        return created;
      }),
    },
    document: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          documents.find((d) => {
            if (where.id && d.id !== where.id) return false;
            if (where.businessId && d.businessId !== where.businessId) return false;
            if (where.checksum && d.checksum !== where.checksum) return false;
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const created = {
          id: nextId("doc"),
          ...data,
          extractionWarnings: data.extractionWarnings ?? [],
          failureReason: null,
          supplierId: null,
          customerId: null,
          confirmedTransactionId: null,
          uploadedAt: now,
          processedAt: null,
          confirmedAt: null,
          createdAt: now,
          updatedAt: now,
          supplier: null,
          customer: null,
        };
        documents.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = documents.findIndex((d) => d.id === where.id);
        if (idx === -1) throw new Error("Document not found");
        documents[idx] = { ...documents[idx], ...data, updatedAt: new Date() };
        return documents[idx];
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < documents.length; i++) {
          const d = documents[i];
          if (where.id && d.id !== where.id) continue;
          if (where.businessId && d.businessId !== where.businessId) continue;
          if (where.processingStatus && d.processingStatus !== where.processingStatus) continue;
          if (where.confirmedTransactionId === null && d.confirmedTransactionId !== null) continue;
          documents[i] = { ...d, ...data, updatedAt: new Date() };
          count++;
        }
        return { count };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = documents.find((d) => d.id === where.id);
        if (!found) throw new Error("Not found");
        return found;
      }),
    },
    transaction: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          transactions.find((t) => {
            if (where.businessId && t.businessId !== where.businessId) return false;
            if (where.transactionType && t.transactionType !== where.transactionType) return false;
            if (where.status && t.status !== where.status) return false;
            if (where.referenceNumber && typeof where.referenceNumber === "object" && "equals" in where.referenceNumber) {
              const target = String((where.referenceNumber as { equals: string }).equals).toLowerCase();
              if (String(t.referenceNumber ?? "").toLowerCase() !== target) return false;
            }
            return true;
          }) ?? null
        );
      }),
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
    },
  };

  const prismaMock = {
    ...txClient,
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      const snapProducts = products.map((p) => ({ ...p }));
      const snapDocs = documents.map((d) => ({ ...d }));
      const snapTxns = [...transactions];
      const snapMovs = [...stockMovements];
      const snapPays = [...payments];
      const snapLed = [...ledgerEntries];
      try {
        return await fn(txClient);
      } catch (err) {
        products.splice(0, products.length, ...snapProducts);
        documents.splice(0, documents.length, ...snapDocs);
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
    state: { products, documents, transactions, stockMovements, payments, ledgerEntries },
  };
}

describe("BizSaathi Phase 3 Document Intelligence", () => {
  it("validates JPG, PNG, PDF uploads and rejects invalid signatures, oversized files, and traversal", async () => {
    expect(
      validateUploadedDocument({
        fileName: "invoice.jpg",
        declaredMimeType: "image/jpeg",
        buffer: makeValidJpegBuffer(),
      }).safeExtension
    ).toBe("jpg");

    expect(
      validateUploadedDocument({
        fileName: "receipt.png",
        declaredMimeType: "image/png",
        buffer: makeValidPngBuffer(),
      }).safeExtension
    ).toBe("png");

    expect(
      validateUploadedDocument({
        fileName: "bill.pdf",
        declaredMimeType: "application/pdf",
        buffer: makeValidPdfBuffer(2),
      }).pdfPageCount
    ).toBe(2);

    // Unsupported extension
    expect(() =>
      validateUploadedDocument({
        fileName: "script.exe",
        declaredMimeType: "application/octet-stream",
        buffer: Buffer.from("MZ"),
      })
    ).toThrow(ValidationError);

    // Spoofed signature
    expect(() =>
      validateUploadedDocument({
        fileName: "fake.jpg",
        declaredMimeType: "image/jpeg",
        buffer: Buffer.from("not actually a jpeg"),
      })
    ).toThrow(ValidationError);

    // Oversized file
    expect(() =>
      validateUploadedDocument({
        fileName: "huge.jpg",
        declaredMimeType: "image/jpeg",
        buffer: Buffer.alloc(DEFAULT_MAX_UPLOAD_BYTES + 1, 0xff),
      })
    ).toThrow(ValidationError);

    // PDF exceeding 10-page limit
    expect(() =>
      validateUploadedDocument({
        fileName: "long.pdf",
        declaredMimeType: "application/pdf",
        buffer: makeValidPdfBuffer(12),
      })
    ).toThrow(ValidationError);

    // Storage path traversal check
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "bs-doc-test-"));
    try {
      const storage = new LocalPrivateDocumentStorage(tempDir);
      await expect(storage.read("../../etc/passwd")).rejects.toThrow(ValidationError);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("extracts valid Gemini JSON and rejects malformed or schema-invalid output", async () => {
    const valid = await extractDocumentWithGemini(
      {
        buffer: makeValidJpegBuffer(),
        mimeType: "image/jpeg",
        fileName: "inv.jpg",
        selectedDocumentType: "PURCHASE_INVOICE",
      },
      {
        generateStructuredJson: async () =>
          JSON.stringify({
            documentType: "PURCHASE_INVOICE",
            suggestedDocumentType: "PURCHASE_INVOICE",
            supplierName: "ABC Distributors",
            customerName: null,
            invoiceNumber: "INV-101",
            documentDate: "2026-11-24",
            expectedDeliveryDate: null,
            expenseCategory: null,
            expenseDescription: null,
            currency: "INR",
            items: [
              {
                sourceProductName: "Amul Milk 500ml",
                sku: null,
                quantity: 50,
                unit: "pkt",
                unitPrice: 25,
                lineTotal: 1250,
                needsReview: false,
                reviewReason: null,
              },
            ],
            subtotal: 1250,
            discountAmount: 0,
            taxAmount: null,
            totalAmount: 1250,
            amountPaid: null,
            paymentMethod: null,
            missingFields: [],
            warnings: [],
          }),
      }
    );

    expect(valid.supplierName).toBe("ABC Distributors");
    expect(valid.items[0].quantity).toBe(50);

    await expect(
      extractDocumentWithGemini(
        {
          buffer: makeValidJpegBuffer(),
          mimeType: "image/jpeg",
          fileName: "bad.jpg",
          selectedDocumentType: "PURCHASE_INVOICE",
        },
        { generateStructuredJson: async () => "{not-json" }
      )
    ).rejects.toThrow(ValidationError);

    await expect(
      extractDocumentWithGemini(
        {
          buffer: makeValidJpegBuffer(),
          mimeType: "image/jpeg",
          fileName: "bad-schema.jpg",
          selectedDocumentType: "PURCHASE_INVOICE",
        },
        { generateStructuredJson: async () => JSON.stringify({ supplierName: "ABC" }) }
      )
    ).rejects.toThrow(ValidationError);
  });

  it("matches SKU, normalized name, alias, fuzzy match, and keeps distinct package sizes separate", () => {
    const catalog: CatalogProductCandidate[] = [
      {
        id: "p1",
        name: "Amul Taaza Milk 500ml",
        sku: "DAIRY-001",
        unit: "pkt",
        purchasePrice: 25,
        sellingPrice: 27,
        currentStock: 10,
        aliases: ["Amul Milk 500ml"],
      },
      {
        id: "p2",
        name: "Britannia Whole Wheat Bread",
        sku: "BAK-001",
        unit: "pkt",
        purchasePrice: 30,
        sellingPrice: 35,
        currentStock: 5,
        aliases: [],
      },
    ];

    expect(
      matchProductAgainstCatalog({ sourceProductName: "Anything", sku: "DAIRY-001" }, catalog).matchStatus
    ).toBe("EXACT_MATCH");

    expect(
      matchProductAgainstCatalog({ sourceProductName: "Amul Milk 500ml" }, catalog).matchedProductId
    ).toBe("p1");

    expect(
      matchProductAgainstCatalog({ sourceProductName: "Britannia Bread" }, catalog).matchStatus
    ).toBe("POSSIBLE_MATCH");

    // Package size guard: 1L must NOT match 500ml
    expect(
      matchProductAgainstCatalog({ sourceProductName: "Amul Milk 1L" }, catalog).matchStatus
    ).toBe("NO_MATCH");
  });

  it("runs full ABC Distributors purchase workflow, flags duplicates, and prevents double confirmation", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "bs-doc-e2e-"));
    try {
      const storage = new LocalPrivateDocumentStorage(tempDir);
      const { db, state } = createPhase3InMemoryMock();
      const buffer = makeValidJpegBuffer();

      // 1. Upload invoice
      const uploaded = await documentService.uploadDocument(
        BIZ,
        {
          fileName: "abc-distributors-inv.jpg",
          declaredMimeType: "image/jpeg",
          buffer,
          documentType: "PURCHASE_INVOICE",
        },
        { db, storage }
      );
      expect(uploaded.isDuplicate).toBe(false);

      // Duplicate file detection
      const dupUpload = await documentService.uploadDocument(
        BIZ,
        {
          fileName: "abc-distributors-inv-copy.jpg",
          declaredMimeType: "image/jpeg",
          buffer,
          documentType: "PURCHASE_INVOICE",
        },
        { db, storage }
      );
      expect(dupUpload.isDuplicate).toBe(true);
      expect(dupUpload.document.processingStatus).toBe("DUPLICATE");

      // 2. Analyze with mocked Gemini extraction (ABC Distributors: 50*25 + 20*30 = 1850)
      const analyzed = await documentService.analyzeDocument(
        BIZ,
        uploaded.document.id,
        {
          db,
          storage,
          aiRunner: {
            generateStructuredJson: async () =>
              JSON.stringify({
                documentType: "PURCHASE_INVOICE",
                suggestedDocumentType: "PURCHASE_INVOICE",
                supplierName: "ABC Distributors",
                customerName: null,
                invoiceNumber: "INV-ABC-101",
                documentDate: "2026-11-24",
                expectedDeliveryDate: null,
                expenseCategory: null,
                expenseDescription: null,
                currency: "INR",
                items: [
                  {
                    sourceProductName: "Amul Milk 500ml",
                    sku: null,
                    quantity: 50,
                    unit: "pkt",
                    unitPrice: 25,
                    lineTotal: 1250,
                    needsReview: false,
                    reviewReason: null,
                  },
                  {
                    sourceProductName: "Britannia Bread",
                    sku: null,
                    quantity: 20,
                    unit: "pkt",
                    unitPrice: 30,
                    lineTotal: 600,
                    needsReview: true,
                    reviewReason: "Verify match",
                  },
                ],
                subtotal: 1850,
                discountAmount: 0,
                taxAmount: 0,
                totalAmount: 1850,
                amountPaid: 0,
                paymentMethod: null,
                missingFields: [],
                warnings: [],
              }),
          },
        }
      );

      expect(analyzed.processingStatus).toBe("REVIEW_REQUIRED");
      expect(analyzed.draft?.items[0].matchedProductId).toBe("prod-milk");
      expect(analyzed.draft?.items[1].matchStatus).toBe("POSSIBLE_MATCH");

      // Unmatched product cannot be silently confirmed
      await expect(
        documentService.confirmDocument(BIZ, uploaded.document.id, {}, { db, storage })
      ).rejects.toThrow(ValidationError);

      // 3. User reviews and confirms the match for Britannia Bread
      const correctedDraft = {
        ...analyzed.draft!,
        items: analyzed.draft!.items.map((item, idx) =>
          idx === 1 ? { ...item, matchedProductId: "prod-bread", matchStatus: "EXACT_MATCH" as const } : item
        ),
      };
      await documentService.reviewDocument(BIZ, uploaded.document.id, correctedDraft, { db });

      // 4. Confirm document
      const confirmed = await documentService.confirmDocument(
        BIZ,
        uploaded.document.id,
        {},
        { db, storage }
      );

      expect(confirmed.document.processingStatus).toBe("CONFIRMED");
      expect(confirmed.transaction.totalAmount).toBe(1850);
      expect(state.products[0].currentStock.toNumber()).toBe(60); // 10 + 50
      expect(state.products[1].currentStock.toNumber()).toBe(25); // 5 + 20
      expect(state.stockMovements.length).toBe(2);

      // 5. Idempotency: second confirmation rejected
      await expect(
        documentService.confirmDocument(BIZ, uploaded.document.id, {}, { db, storage })
      ).rejects.toThrow(ConflictError);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles sales receipt stock deduction, customer order non-deduction, and expense non-inventory impact", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "bs-doc-types-"));
    try {
      const storage = new LocalPrivateDocumentStorage(tempDir);
      const { db, state } = createPhase3InMemoryMock();
      const buf1 = Buffer.concat([makeValidPngBuffer(), Buffer.from("1")]);
      const buf2 = Buffer.concat([makeValidPngBuffer(), Buffer.from("2")]);
      const buf3 = Buffer.concat([makeValidPngBuffer(), Buffer.from("3")]);

      // Sales receipt: deducts 4 milk (10 -> 6)
      const upSale = await documentService.uploadDocument(
        BIZ,
        { fileName: "sale.png", declaredMimeType: "image/png", buffer: buf1, documentType: "SALES_RECEIPT" },
        { db, storage }
      );
      await documentService.analyzeDocument(BIZ, upSale.document.id, {
        db,
        storage,
        aiRunner: {
          generateStructuredJson: async () =>
            JSON.stringify({
              documentType: "SALES_RECEIPT",
              suggestedDocumentType: "SALES_RECEIPT",
              supplierName: null,
              customerName: "Sunita Devi",
              invoiceNumber: "RCP-101",
              documentDate: "2026-11-24",
              expectedDeliveryDate: null,
              expenseCategory: null,
              expenseDescription: null,
              currency: "INR",
              items: [
                {
                  sourceProductName: "Amul Milk 500ml",
                  sku: null,
                  quantity: 4,
                  unit: "pkt",
                  unitPrice: 27,
                  lineTotal: 108,
                  needsReview: false,
                  reviewReason: null,
                },
              ],
              subtotal: 108,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 108,
              amountPaid: 108,
              paymentMethod: "UPI",
              missingFields: [],
              warnings: [],
            }),
        },
      });
      await documentService.confirmDocument(BIZ, upSale.document.id, {}, { db, storage });
      expect(state.products[0].currentStock.toNumber()).toBe(6);

      // Customer order: does NOT reduce stock (stays 6)
      const upOrder = await documentService.uploadDocument(
        BIZ,
        { fileName: "order.png", declaredMimeType: "image/png", buffer: buf2, documentType: "CUSTOMER_ORDER" },
        { db, storage }
      );
      await documentService.analyzeDocument(BIZ, upOrder.document.id, {
        db,
        storage,
        aiRunner: {
          generateStructuredJson: async () =>
            JSON.stringify({
              documentType: "CUSTOMER_ORDER",
              suggestedDocumentType: "CUSTOMER_ORDER",
              supplierName: null,
              customerName: "Rajesh Verma",
              invoiceNumber: "ORD-202",
              documentDate: "2026-11-24",
              expectedDeliveryDate: "2026-11-26",
              expenseCategory: null,
              expenseDescription: null,
              currency: "INR",
              items: [
                {
                  sourceProductName: "Amul Milk 500ml",
                  sku: null,
                  quantity: 3,
                  unit: "pkt",
                  unitPrice: 27,
                  lineTotal: 81,
                  needsReview: false,
                  reviewReason: null,
                },
              ],
              subtotal: 81,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 81,
              amountPaid: 0,
              paymentMethod: null,
              missingFields: [],
              warnings: [],
            }),
        },
      });
      const confirmedOrder = await documentService.confirmDocument(
        BIZ,
        upOrder.document.id,
        {},
        { db, storage }
      );
      expect(confirmedOrder.transaction.transactionType).toBe("CUSTOMER_ORDER");
      expect(state.products[0].currentStock.toNumber()).toBe(6);

      // Expense receipt: does NOT touch inventory (stays 6)
      const upExpense = await documentService.uploadDocument(
        BIZ,
        { fileName: "electricity.png", declaredMimeType: "image/png", buffer: buf3, documentType: "EXPENSE_RECEIPT" },
        { db, storage }
      );
      await documentService.analyzeDocument(BIZ, upExpense.document.id, {
        db,
        storage,
        aiRunner: {
          generateStructuredJson: async () =>
            JSON.stringify({
              documentType: "EXPENSE_RECEIPT",
              suggestedDocumentType: "EXPENSE_RECEIPT",
              supplierName: "BSES Electricity",
              customerName: null,
              invoiceNumber: "ELEC-99",
              documentDate: "2026-11-24",
              expectedDeliveryDate: null,
              expenseCategory: "Utilities",
              expenseDescription: "Shop monthly electricity bill",
              currency: "INR",
              items: [],
              subtotal: 950,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 950,
              amountPaid: 950,
              paymentMethod: "UPI",
              missingFields: [],
              warnings: [],
            }),
        },
      });
      const confirmedExpense = await documentService.confirmDocument(
        BIZ,
        upExpense.document.id,
        {},
        { db, storage }
      );
      expect(confirmedExpense.transaction.transactionType).toBe("EXPENSE");
      expect(confirmedExpense.transaction.totalAmount).toBe(950);
      expect(state.products[0].currentStock.toNumber()).toBe(6);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
