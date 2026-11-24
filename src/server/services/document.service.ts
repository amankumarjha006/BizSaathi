import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  extractDocumentWithGemini,
  type GeminiExtractionRunner,
  type SupportedDocumentType,
} from "@/server/ai/document-extraction.service";
import {
  documentStorage,
  type DocumentStorageProvider,
} from "@/server/storage/document-storage";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber, roundMoney, roundStock } from "@/server/utils/decimal";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import {
  computeDocumentFinancialSummary,
  reviewedDocumentDraftSchema,
  type FinancialValidationSummary,
  type ReviewedDocumentDraft,
  type ReviewedLineItem,
} from "@/server/validations/document-extraction";
import { validateUploadedDocument } from "@/server/validations/document-upload";
import {
  normalizeProductText,
  normalizeUnit,
  productMatchingService,
} from "./product-matching.service";
import { transactionService } from "./transaction.service";

export interface DocumentServiceDeps {
  db?: PrismaClient;
  storage?: DocumentStorageProvider;
  aiRunner?: GeminiExtractionRunner;
}

export interface SerializedDocumentSummary {
  id: string;
  businessId: string;
  documentType: SupportedDocumentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  processingStatus: string;
  extractionWarnings: string[];
  failureReason: string | null;
  supplierId: string | null;
  supplierName: string | null;
  customerId: string | null;
  customerName: string | null;
  confirmedTransactionId: string | null;
  extractedTotalAmount: number | null;
  uploadedAt: string;
  processedAt: string | null;
  confirmedAt: string | null;
}

export interface SerializedDocumentDetail extends SerializedDocumentSummary {
  draft: ReviewedDocumentDraft | null;
  financialSummary: FinancialValidationSummary | null;
}

export interface DocumentListFilters {
  page?: number;
  pageSize?: number;
  documentType?: SupportedDocumentType;
  processingStatus?:
    | "UPLOADED"
    | "PROCESSING"
    | "REVIEW_REQUIRED"
    | "CONFIRMED"
    | "FAILED"
    | "DUPLICATE";
  fromDate?: Date;
  toDate?: Date;
}

function sanitizeAiErrorMessage(err: unknown): string {
  if (err instanceof ValidationError) {
    return err.message;
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("GEMINI_API_KEY") || msg.includes("GEMINI_MODEL")) {
      return msg;
    }
    if (msg.toLowerCase().includes("api key")) {
      return "AI provider authentication failed. Check server Gemini configuration.";
    }
    return "Document analysis failed. You can retry processing.";
  }
  return "Document analysis failed. You can retry processing.";
}

function parseWarnings(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function parseDraft(raw: unknown): ReviewedDocumentDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = reviewedDocumentDraftSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function serializeDocumentSummary(doc: {
  id: string;
  businessId: string;
  documentType: SupportedDocumentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  processingStatus: string;
  extractedData: unknown;
  extractionWarnings: unknown;
  failureReason: string | null;
  supplierId: string | null;
  supplier?: { name: string } | null;
  customerId: string | null;
  customer?: { name: string } | null;
  confirmedTransactionId: string | null;
  uploadedAt: Date;
  processedAt: Date | null;
  confirmedAt: Date | null;
}): SerializedDocumentSummary {
  const draft = parseDraft(doc.extractedData);
  const financial = draft ? computeDocumentFinancialSummary(draft) : null;

  return {
    id: doc.id,
    businessId: doc.businessId,
    documentType: doc.documentType,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    checksum: doc.checksum,
    processingStatus: doc.processingStatus,
    extractionWarnings: parseWarnings(doc.extractionWarnings),
    failureReason: doc.failureReason,
    supplierId: doc.supplierId,
    supplierName: doc.supplier?.name ?? draft?.supplierName ?? null,
    customerId: doc.customerId,
    customerName: doc.customer?.name ?? draft?.customerName ?? null,
    confirmedTransactionId: doc.confirmedTransactionId,
    extractedTotalAmount:
      draft?.extractedTotalAmount ?? financial?.calculatedNetTotal ?? null,
    uploadedAt: doc.uploadedAt.toISOString(),
    processedAt: doc.processedAt ? doc.processedAt.toISOString() : null,
    confirmedAt: doc.confirmedAt ? doc.confirmedAt.toISOString() : null,
  };
}

export const documentService = {
  async uploadDocument(
    businessId: string,
    params: {
      fileName: string;
      declaredMimeType: string;
      buffer: Buffer;
      documentType: SupportedDocumentType;
    },
    deps: DocumentServiceDeps = {}
  ): Promise<{
    document: SerializedDocumentSummary;
    isDuplicate: boolean;
    duplicateOfId: string | null;
  }> {
    const prisma = deps.db ?? requirePrisma();
    const storage = deps.storage ?? documentStorage;

    const validated = validateUploadedDocument({
      fileName: params.fileName,
      declaredMimeType: params.declaredMimeType,
      buffer: params.buffer,
    });

    const existingDuplicate = await prisma.document.findFirst({
      where: {
        businessId,
        checksum: validated.checksumSha256,
      },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, fileName: true, processingStatus: true },
    });

    const { storageKey } = await storage.save(
      businessId,
      params.buffer,
      validated.safeExtension
    );

    const warnings: string[] = [];
    if (existingDuplicate) {
      warnings.push(
        `Duplicate file detected: matches previously uploaded document "${existingDuplicate.fileName}" (${existingDuplicate.processingStatus}).`
      );
    }

    const created = await prisma.document.create({
      data: {
        businessId,
        documentType: params.documentType,
        fileName: params.fileName,
        mimeType: validated.verifiedMimeType,
        fileSize: validated.fileSize,
        checksum: validated.checksumSha256,
        storageKey,
        processingStatus: existingDuplicate ? "DUPLICATE" : "UPLOADED",
        extractionWarnings: warnings,
      },
      include: {
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });

    return {
      document: serializeDocumentSummary(created),
      isDuplicate: Boolean(existingDuplicate),
      duplicateOfId: existingDuplicate?.id ?? null,
    };
  },

  async listDocuments(
    businessId: string,
    filters: DocumentListFilters = {},
    deps: DocumentServiceDeps = {}
  ) {
    const prisma = deps.db ?? requirePrisma();
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const where: Prisma.DocumentWhereInput = {
      businessId,
      ...(filters.documentType ? { documentType: filters.documentType } : {}),
      ...(filters.processingStatus
        ? { processingStatus: filters.processingStatus }
        : {}),
      ...(filters.fromDate || filters.toDate
        ? {
            uploadedAt: {
              ...(filters.fromDate ? { gte: filters.fromDate } : {}),
              ...(filters.toDate ? { lte: filters.toDate } : {}),
            },
          }
        : {}),
    };

    const [docs, total, allStatuses] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { uploadedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.document.count({ where }),
      prisma.document.groupBy({
        by: ["processingStatus"],
        where: { businessId },
        _count: { _all: true },
      }),
    ]);

    const statusCounts = new Map(
      allStatuses.map((s) => [s.processingStatus, s._count._all])
    );

    const totalAll = allStatuses.reduce((acc, s) => acc + s._count._all, 0);

    return {
      items: docs.map(serializeDocumentSummary),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      stats: {
        total: totalAll,
        pendingReview:
          (statusCounts.get("REVIEW_REQUIRED") ?? 0) +
          (statusCounts.get("UPLOADED") ?? 0) +
          (statusCounts.get("DUPLICATE") ?? 0) +
          (statusCounts.get("PROCESSING") ?? 0),
        confirmed: statusCounts.get("CONFIRMED") ?? 0,
        failed: statusCounts.get("FAILED") ?? 0,
      },
    };
  },

  async getDocumentById(
    businessId: string,
    documentId: string,
    deps: DocumentServiceDeps = {}
  ): Promise<SerializedDocumentDetail> {
    const prisma = deps.db ?? requirePrisma();
    const doc = await prisma.document.findFirst({
      where: { id: documentId, businessId },
      include: {
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }

    const draft = parseDraft(doc.extractedData);
    const financialSummary = draft
      ? computeDocumentFinancialSummary(draft)
      : null;

    return {
      ...serializeDocumentSummary(doc),
      draft,
      financialSummary,
    };
  },

  async getDocumentFileForPreview(
    businessId: string,
    documentId: string,
    deps: DocumentServiceDeps = {}
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const prisma = deps.db ?? requirePrisma();
    const storage = deps.storage ?? documentStorage;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, businessId },
      select: { storageKey: true, mimeType: true, fileName: true },
    });
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }

    const buffer = await storage.read(doc.storageKey);
    return {
      buffer,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
    };
  },

  async analyzeDocument(
    businessId: string,
    documentId: string,
    deps: DocumentServiceDeps = {}
  ): Promise<SerializedDocumentDetail> {
    const prisma = deps.db ?? requirePrisma();
    const storage = deps.storage ?? documentStorage;

    const doc = await prisma.document.findFirst({
      where: { id: documentId, businessId },
    });
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }

    if (doc.processingStatus === "CONFIRMED" || doc.confirmedTransactionId) {
      throw new ConflictError(
        "Confirmed documents cannot be re-analyzed."
      );
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { processingStatus: "PROCESSING", failureReason: null },
    });

    try {
      const buffer = await storage.read(doc.storageKey);
      const extracted = await extractDocumentWithGemini(
        {
          buffer,
          mimeType: doc.mimeType,
          fileName: doc.fileName,
          selectedDocumentType: doc.documentType,
        },
        deps.aiRunner
      );

      // Match products against the business catalog
      const matchResults = await productMatchingService.matchItems(
        businessId,
        extracted.items.map((item) => ({
          sourceProductName: item.sourceProductName,
          sku: item.sku,
        })),
        prisma
      );

      const reviewedItems: ReviewedLineItem[] = extracted.items.map(
        (item, idx) => {
          const match = matchResults[idx];
          return {
            id: randomUUID(),
            sourceProductName: item.sourceProductName,
            sku: item.sku,
            quantity: item.quantity,
            unit: normalizeUnit(item.unit),
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            matchedProductId: match.matchedProductId,
            matchStatus: match.matchStatus,
            suggestions: match.suggestions,
            createNewProduct: false,
            needsReview: item.needsReview || match.matchStatus !== "EXACT_MATCH",
            reviewReason:
              item.reviewReason ??
              (match.matchStatus === "POSSIBLE_MATCH"
                ? "Possible catalog match found — please verify."
                : match.matchStatus === "NO_MATCH"
                ? "Unmatched item — select a product or choose Create New Product."
                : null),
            sourceExcerpt: item.sourceExcerpt ?? null,
          };
        }
      );

      // Match existing supplier or customer by name
      let matchedSupplierId: string | null = null;
      let matchedCustomerId: string | null = null;

      if (extracted.supplierName) {
        const sup = await prisma.supplier.findFirst({
          where: {
            businessId,
            name: { equals: extracted.supplierName, mode: "insensitive" },
          },
          select: { id: true },
        });
        matchedSupplierId = sup?.id ?? null;
      }

      if (extracted.customerName) {
        const cust = await prisma.customer.findFirst({
          where: {
            businessId,
            name: { equals: extracted.customerName, mode: "insensitive" },
          },
          select: { id: true },
        });
        matchedCustomerId = cust?.id ?? null;
      }

      const warnings: string[] = [...parseWarnings(doc.extractionWarnings), ...extracted.warnings];

      if (
        extracted.suggestedDocumentType &&
        extracted.suggestedDocumentType !== doc.documentType
      ) {
        warnings.push(
          `AI detected this document as ${extracted.suggestedDocumentType}, while you selected ${doc.documentType}. Please verify the document category.`
        );
      }

      // Duplicate invoice/receipt number detection
      if (extracted.invoiceNumber) {
        const existingTx = await prisma.transaction.findFirst({
          where: {
            businessId,
            referenceNumber: {
              equals: extracted.invoiceNumber,
              mode: "insensitive",
            },
            status: "CONFIRMED",
            ...(matchedSupplierId ? { supplierId: matchedSupplierId } : {}),
          },
          select: { id: true, transactionType: true, referenceNumber: true },
        });
        if (existingTx) {
          warnings.push(
            `Possible duplicate: reference "${extracted.invoiceNumber}" already exists in a confirmed ${existingTx.transactionType} transaction.`
          );
        }
      }

      const draft: ReviewedDocumentDraft = {
        selectedDocumentType: doc.documentType,
        suggestedDocumentType: extracted.suggestedDocumentType,
        supplierId: matchedSupplierId,
        supplierName: extracted.supplierName,
        customerId: matchedCustomerId,
        customerName: extracted.customerName,
        invoiceNumber: extracted.invoiceNumber,
        documentDate: extracted.documentDate,
        expectedDeliveryDate: extracted.expectedDeliveryDate,
        expenseCategory: extracted.expenseCategory,
        expenseDescription: extracted.expenseDescription,
        currency: extracted.currency ?? "INR",
        items: reviewedItems,
        discountAmount: extracted.discountAmount ?? 0,
        taxAmount: extracted.taxAmount ?? 0,
        extractedTotalAmount: extracted.totalAmount,
        amountPaid: extracted.amountPaid ?? 0,
        paymentMethod: extracted.paymentMethod ?? "CASH",
        discrepancyAcknowledged: false,
        missingFields: extracted.missingFields,
        warnings,
        notes: null,
      };

      const financialSummary = computeDocumentFinancialSummary(draft);
      const allWarnings = [...warnings, ...financialSummary.warnings];

      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: {
          processingStatus: "REVIEW_REQUIRED",
          extractedData: draft as unknown as Prisma.InputJsonValue,
          extractionWarnings: allWarnings,
          supplierId: matchedSupplierId,
          customerId: matchedCustomerId,
          processedAt: new Date(),
          failureReason: null,
        },
        include: {
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });

      return {
        ...serializeDocumentSummary(updated),
        draft,
        financialSummary,
      };
    } catch (err) {
      const reason = sanitizeAiErrorMessage(err);
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          processingStatus: "FAILED",
          failureReason: reason,
        },
      });
      throw err;
    }
  },

  async reviewDocument(
    businessId: string,
    documentId: string,
    payload: unknown,
    deps: DocumentServiceDeps = {}
  ): Promise<SerializedDocumentDetail> {
    const prisma = deps.db ?? requirePrisma();
    const doc = await prisma.document.findFirst({
      where: { id: documentId, businessId },
    });
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }
    if (doc.processingStatus === "CONFIRMED" || doc.confirmedTransactionId) {
      throw new ConflictError("Confirmed documents cannot be modified.");
    }

    const draft = reviewedDocumentDraftSchema.parse(payload);
    const financialSummary = computeDocumentFinancialSummary(draft);
    const mergedWarnings = Array.from(
      new Set([...draft.warnings, ...financialSummary.warnings])
    );

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        processingStatus: "REVIEW_REQUIRED",
        extractedData: draft as unknown as Prisma.InputJsonValue,
        extractionWarnings: mergedWarnings,
        supplierId: draft.supplierId ?? null,
        customerId: draft.customerId ?? null,
      },
      include: {
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });

    return {
      ...serializeDocumentSummary(updated),
      draft,
      financialSummary,
    };
  },

  /**
   * Atomically confirms a reviewed document and posts the corresponding transaction
   * through Phase 2's central transactionService inside a single Prisma transaction.
   * Idempotent: prevents duplicate confirmation or double-posting.
   */
  async confirmDocument(
    businessId: string,
    documentId: string,
    options: { discrepancyAcknowledged?: boolean } = {},
    deps: DocumentServiceDeps = {}
  ) {
    const prisma = deps.db ?? requirePrisma();

    return prisma.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id: documentId, businessId },
      });
      if (!doc) {
        throw new NotFoundError("Document not found.");
      }

      if (doc.processingStatus === "CONFIRMED" || doc.confirmedTransactionId) {
        throw new ConflictError(
          "This document has already been confirmed and converted into a transaction."
        );
      }

      if (doc.processingStatus !== "REVIEW_REQUIRED") {
        throw new ConflictError(
          `Document must be analyzed and reviewed before confirmation (current status: ${doc.processingStatus}).`
        );
      }

      const draft = parseDraft(doc.extractedData);
      if (!draft) {
        throw new ValidationError(
          "Document has no valid reviewed extraction data to confirm."
        );
      }

      const financialSummary = computeDocumentFinancialSummary(draft);
      const acknowledged =
        options.discrepancyAcknowledged ?? draft.discrepancyAcknowledged;

      if (financialSummary.hasDiscrepancy && !acknowledged) {
        throw new ValidationError(
          `Calculated net total (₹${financialSummary.calculatedNetTotal.toFixed(
            2
          )}) differs from printed document total (₹${(
            financialSummary.extractedTotalAmount ?? 0
          ).toFixed(
            2
          )}). Resolve the line items or acknowledge the discrepancy before confirming.`
        );
      }

      const docDate = draft.documentDate
        ? new Date(draft.documentDate)
        : new Date();
      const validDate = Number.isNaN(docDate.getTime()) ? new Date() : docDate;

      let resolvedSupplierId = draft.supplierId ?? null;
      let resolvedCustomerId = draft.customerId ?? null;
      let createdTransaction;

      if (doc.documentType === "PURCHASE_INVOICE") {
        if (draft.items.length === 0) {
          throw new ValidationError(
            "Purchase invoice must contain at least one line item."
          );
        }

        if (!resolvedSupplierId) {
          if (!draft.supplierName) {
            throw new ValidationError(
              "Select or enter a supplier name before confirming this purchase invoice."
            );
          }
          const existingSupplier = await tx.supplier.findFirst({
            where: {
              businessId,
              name: { equals: draft.supplierName, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (existingSupplier) {
            resolvedSupplierId = existingSupplier.id;
          } else {
            const newSup = await tx.supplier.create({
              data: { businessId, name: draft.supplierName },
              select: { id: true },
            });
            resolvedSupplierId = newSup.id;
          }
        }

        const purchaseItems: Array<{
          productId: string;
          quantity: number;
          unitPrice: number;
        }> = [];

        for (const item of draft.items) {
          let productId = item.matchedProductId;
          if (!productId) {
            if (!item.createNewProduct) {
              throw new ValidationError(
                `Unmatched product "${item.sourceProductName}". Map it to an existing product or select "Create new product" first.`
              );
            }
            const newProd = await tx.product.create({
              data: {
                businessId,
                name: item.sourceProductName,
                sku: item.sku ?? null,
                purchasePrice: roundMoney(item.unitPrice),
                sellingPrice: roundMoney(
                  item.newProductSellingPrice ?? item.unitPrice
                ),
                currentStock: roundStock(0),
                minimumStock: roundStock(5),
                unit: normalizeUnit(item.unit),
                isActive: true,
              },
              select: { id: true },
            });
            productId = newProd.id;
          } else {
            // Save product alias if source name differs from catalog name
            const prod = await tx.product.findFirst({
              where: { id: productId, businessId },
              select: { name: true },
            });
            if (
              prod &&
              normalizeProductText(prod.name) !==
                normalizeProductText(item.sourceProductName)
            ) {
              const normalizedAlias = normalizeProductText(
                item.sourceProductName
              );
              const existingAlias = await tx.productAlias.findFirst({
                where: { businessId, normalizedAlias },
              });
              if (!existingAlias) {
                await tx.productAlias.create({
                  data: {
                    businessId,
                    productId,
                    alias: item.sourceProductName,
                    normalizedAlias,
                  },
                });
              }
            }
          }

          purchaseItems.push({
            productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        }

        createdTransaction = await transactionService.recordPurchaseTx(
          tx,
          businessId,
          {
            supplierId: resolvedSupplierId,
            documentId: doc.id,
            referenceNumber: draft.invoiceNumber ?? undefined,
            transactionDate: validDate,
            items: purchaseItems,
            discountAmount: draft.discountAmount,
            taxAmount: draft.taxAmount,
            paidAmount: draft.amountPaid,
            paymentMethod: draft.paymentMethod,
            notes: draft.notes ?? `Confirmed from document ${doc.fileName}`,
          }
        );
      } else if (doc.documentType === "SALES_RECEIPT") {
        if (draft.items.length === 0) {
          throw new ValidationError(
            "Sales receipt must contain at least one line item."
          );
        }

        if (draft.invoiceNumber) {
          const duplicateSale = await tx.transaction.findFirst({
            where: {
              businessId,
              transactionType: "SALE",
              referenceNumber: {
                equals: draft.invoiceNumber,
                mode: "insensitive",
              },
              status: "CONFIRMED",
            },
            select: { id: true },
          });
          if (duplicateSale) {
            throw new ConflictError(
              `Duplicate sales receipt: sale with reference "${draft.invoiceNumber}" already exists.`
            );
          }
        }

        if (!resolvedCustomerId && draft.customerName) {
          const existingCust = await tx.customer.findFirst({
            where: {
              businessId,
              name: { equals: draft.customerName, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (existingCust) {
            resolvedCustomerId = existingCust.id;
          } else {
            const newCust = await tx.customer.create({
              data: { businessId, name: draft.customerName },
              select: { id: true },
            });
            resolvedCustomerId = newCust.id;
          }
        }

        const saleItems = draft.items.map((item) => {
          if (!item.matchedProductId) {
            throw new ValidationError(
              `Unmatched product "${item.sourceProductName}". Every item on a sales receipt must be matched to an existing catalog product.`
            );
          }
          return {
            productId: item.matchedProductId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          };
        });

        createdTransaction = await transactionService.recordSaleTx(
          tx,
          businessId,
          {
            customerId: resolvedCustomerId ?? undefined,
            documentId: doc.id,
            referenceNumber: draft.invoiceNumber ?? undefined,
            transactionDate: validDate,
            items: saleItems,
            discountAmount: draft.discountAmount,
            taxAmount: draft.taxAmount,
            paidAmount: draft.amountPaid,
            paymentMethod: draft.paymentMethod,
            notes: draft.notes ?? `Confirmed from sales receipt ${doc.fileName}`,
          }
        );
      } else if (doc.documentType === "CUSTOMER_ORDER") {
        if (!resolvedCustomerId && draft.customerName) {
          const existingCust = await tx.customer.findFirst({
            where: {
              businessId,
              name: { equals: draft.customerName, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (existingCust) {
            resolvedCustomerId = existingCust.id;
          } else {
            const newCust = await tx.customer.create({
              data: { businessId, name: draft.customerName },
              select: { id: true },
            });
            resolvedCustomerId = newCust.id;
          }
        }

        createdTransaction = await transactionService.recordCustomerOrderTx(
          tx,
          businessId,
          {
            customerId: resolvedCustomerId ?? undefined,
            documentId: doc.id,
            referenceNumber: draft.invoiceNumber ?? undefined,
            transactionDate: validDate,
            items: draft.items.map((item) => ({
              productId: item.matchedProductId,
              productNameSnapshot: item.sourceProductName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            notes: [
              draft.notes,
              draft.expectedDeliveryDate
                ? `Expected delivery: ${draft.expectedDeliveryDate}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }
        );
      } else {
        // EXPENSE_RECEIPT
        const expenseAmount =
          financialSummary.calculatedNetTotal > 0
            ? financialSummary.calculatedNetTotal
            : draft.extractedTotalAmount ?? 0;

        if (expenseAmount <= 0) {
          throw new ValidationError(
            "Expense receipt must have a positive total amount."
          );
        }

        const effectivePaid =
          draft.amountPaid > 0 ? draft.amountPaid : expenseAmount;

        createdTransaction = await transactionService.recordExpenseTx(
          tx,
          businessId,
          {
            documentId: doc.id,
            referenceNumber: draft.invoiceNumber ?? undefined,
            transactionDate: validDate,
            description:
              draft.expenseDescription ??
              draft.supplierName ??
              doc.fileName,
            category: draft.expenseCategory,
            totalAmount: expenseAmount,
            paidAmount: Math.min(effectivePaid, expenseAmount),
            paymentMethod: draft.paymentMethod,
            notes: draft.notes ?? `Confirmed from expense receipt ${doc.fileName}`,
          }
        );
      }

      // Atomic conditional claim on Document to prevent double confirmation
      const claim = await tx.document.updateMany({
        where: {
          id: doc.id,
          businessId,
          processingStatus: "REVIEW_REQUIRED",
          confirmedTransactionId: null,
        },
        data: {
          processingStatus: "CONFIRMED",
          confirmedTransactionId: createdTransaction.id,
          confirmedAt: new Date(),
          supplierId: resolvedSupplierId,
          customerId: resolvedCustomerId,
        },
      });

      if (claim.count === 0) {
        throw new ConflictError(
          "Document confirmation conflicted with another concurrent request."
        );
      }

      const confirmedDoc = await tx.document.findUniqueOrThrow({
        where: { id: doc.id },
        include: {
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });

      return {
        document: serializeDocumentSummary(confirmedDoc),
        transaction: createdTransaction,
      };
    });
  },

  async retryDocument(
    businessId: string,
    documentId: string,
    deps: DocumentServiceDeps = {}
  ): Promise<SerializedDocumentDetail> {
    const prisma = deps.db ?? requirePrisma();
    const doc = await prisma.document.findFirst({
      where: { id: documentId, businessId },
      select: { id: true, processingStatus: true, confirmedTransactionId: true },
    });
    if (!doc) {
      throw new NotFoundError("Document not found.");
    }
    if (doc.processingStatus === "CONFIRMED" || doc.confirmedTransactionId) {
      throw new ConflictError("Confirmed documents cannot be retried.");
    }
    if (
      doc.processingStatus !== "FAILED" &&
      doc.processingStatus !== "UPLOADED" &&
      doc.processingStatus !== "DUPLICATE"
    ) {
      throw new ConflictError(
        `Only FAILED, UPLOADED, or DUPLICATE documents can be retried (current status: ${doc.processingStatus}).`
      );
    }

    return documentService.analyzeDocument(businessId, documentId, deps);
  },
};

export function formatDecimalCheck(value: Prisma.Decimal): number {
  return decimalToNumber(value);
}
