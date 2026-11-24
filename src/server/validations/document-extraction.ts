import { z } from "zod";
import {
  addDecimals,
  decimalToNumber,
  mulDecimals,
  roundMoney,
  roundStock,
  subDecimals,
  sumDecimals,
} from "@/server/utils/decimal";
import { paymentMethodSchema } from "@/server/validations/phase2";

export const documentTypeSchema = z.enum([
  "PURCHASE_INVOICE",
  "SALES_RECEIPT",
  "CUSTOMER_ORDER",
  "EXPENSE_RECEIPT",
]);

export const extractedItemSchema = z.object({
  sourceProductName: z.string().trim().min(1),
  sku: z.string().trim().nullable(),
  quantity: z.number().positive(),
  unit: z.string().trim().nullable(),
  unitPrice: z.number().min(0),
  lineTotal: z.number().min(0),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  sourceExcerpt: z.string().nullable().optional(),
});

export const extractedDocumentSchema = z.object({
  documentType: documentTypeSchema,
  suggestedDocumentType: documentTypeSchema.nullable(),
  supplierName: z.string().trim().nullable(),
  customerName: z.string().trim().nullable(),
  invoiceNumber: z.string().trim().nullable(),
  documentDate: z.string().trim().nullable(),
  expectedDeliveryDate: z.string().trim().nullable(),
  expenseCategory: z.string().trim().nullable(),
  expenseDescription: z.string().trim().nullable(),
  currency: z.string().trim().nullable(),
  items: z.array(extractedItemSchema),
  subtotal: z.number().min(0).nullable(),
  discountAmount: z.number().min(0).nullable(),
  taxAmount: z.number().min(0).nullable(),
  totalAmount: z.number().min(0).nullable(),
  amountPaid: z.number().min(0).nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const matchStatusSchema = z.enum([
  "EXACT_MATCH",
  "POSSIBLE_MATCH",
  "NO_MATCH",
]);

export const productSuggestionSchema = z.object({
  productId: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  unit: z.string(),
  purchasePrice: z.number(),
  sellingPrice: z.number(),
  currentStock: z.number(),
  score: z.number(),
  matchReason: z.string(),
});

export const reviewedLineItemSchema = z.object({
  id: z.string().min(1),
  sourceProductName: z.string().trim().min(1),
  sku: z.string().trim().nullable().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unit: z.string().trim().min(1).max(24).default("pcs"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
  lineTotal: z.coerce.number().min(0).optional(),
  matchedProductId: z.string().nullable(),
  matchStatus: matchStatusSchema.default("NO_MATCH"),
  suggestions: z.array(productSuggestionSchema).optional(),
  createNewProduct: z.boolean().optional(),
  newProductSellingPrice: z.coerce.number().min(0).optional(),
  needsReview: z.boolean().default(false),
  reviewReason: z.string().nullable().optional(),
  sourceExcerpt: z.string().nullable().optional(),
});

export const reviewedDocumentDraftSchema = z.object({
  selectedDocumentType: documentTypeSchema,
  suggestedDocumentType: documentTypeSchema.nullable().optional(),
  supplierId: z.string().nullable().optional(),
  supplierName: z.string().trim().nullable().optional(),
  customerId: z.string().nullable().optional(),
  customerName: z.string().trim().nullable().optional(),
  invoiceNumber: z.string().trim().nullable().optional(),
  documentDate: z.string().trim().nullable().optional(),
  expectedDeliveryDate: z.string().trim().nullable().optional(),
  expenseCategory: z.string().trim().nullable().optional(),
  expenseDescription: z.string().trim().nullable().optional(),
  currency: z.string().trim().nullable().optional(),
  items: z.array(reviewedLineItemSchema),
  discountAmount: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  extractedTotalAmount: z.number().min(0).nullable().optional(),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentMethod: paymentMethodSchema.default("CASH"),
  discrepancyAcknowledged: z.boolean().default(false),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  notes: z.string().trim().max(400).nullable().optional(),
});

export const confirmDocumentSchema = z.object({
  discrepancyAcknowledged: z.boolean().optional(),
});

export type ExtractedDocumentData = z.infer<typeof extractedDocumentSchema>;
export type ReviewedLineItem = z.infer<typeof reviewedLineItemSchema>;
export type ReviewedDocumentDraft = z.infer<typeof reviewedDocumentDraftSchema>;

export interface FinancialValidationSummary {
  calculatedItemsSubtotal: number;
  discountAmount: number;
  taxAmount: number;
  calculatedNetTotal: number;
  extractedTotalAmount: number | null;
  discrepancyAmount: number;
  hasDiscrepancy: boolean;
  warnings: string[];
}

/**
 * Computes authoritative financial totals from line items using Prisma.Decimal
 * and flags any discrepancy against the document's printed total.
 */
export function computeDocumentFinancialSummary(
  draft: Pick<
    ReviewedDocumentDraft,
    | "selectedDocumentType"
    | "items"
    | "discountAmount"
    | "taxAmount"
    | "extractedTotalAmount"
  >
): FinancialValidationSummary {
  const lineTotals = draft.items.map((item) => {
    const qty = roundStock(item.quantity);
    const price = roundMoney(item.unitPrice);
    return roundMoney(mulDecimals(qty, price));
  });

  const subtotalDec = roundMoney(sumDecimals(lineTotals));
  const discountDec = roundMoney(draft.discountAmount ?? 0);
  const taxDec = roundMoney(draft.taxAmount ?? 0);
  const isSummaryExpense =
    draft.selectedDocumentType === "EXPENSE_RECEIPT" &&
    draft.items.length === 0 &&
    draft.extractedTotalAmount !== null &&
    draft.extractedTotalAmount !== undefined;

  const netDec = isSummaryExpense
    ? roundMoney(draft.extractedTotalAmount!)
    : roundMoney(addDecimals(subDecimals(subtotalDec, discountDec), taxDec));

  const calculatedItemsSubtotal = isSummaryExpense
    ? decimalToNumber(netDec)
    : decimalToNumber(subtotalDec);
  const calculatedNetTotal = Math.max(0, decimalToNumber(netDec));

  const extracted =
    draft.extractedTotalAmount !== null &&
    draft.extractedTotalAmount !== undefined
      ? roundMoney(draft.extractedTotalAmount)
      : null;

  const discrepancyDec =
    extracted && !isSummaryExpense
      ? roundMoney(subDecimals(extracted, netDec).abs())
      : roundMoney(0);
  const discrepancyAmount = decimalToNumber(discrepancyDec);
  const hasDiscrepancy =
    !isSummaryExpense && extracted !== null && discrepancyAmount > 0.01;

  const warnings: string[] = [];
  if (hasDiscrepancy && extracted !== null) {
    warnings.push(
      `Total mismatch: calculated net total is ₹${calculatedNetTotal.toFixed(
        2
      )} while document printed total is ₹${decimalToNumber(extracted).toFixed(
        2
      )} (difference: ₹${discrepancyAmount.toFixed(2)}).`
    );
  }

  return {
    calculatedItemsSubtotal,
    discountAmount: decimalToNumber(discountDec),
    taxAmount: decimalToNumber(taxDec),
    calculatedNetTotal,
    extractedTotalAmount: extracted ? decimalToNumber(extracted) : null,
    discrepancyAmount,
    hasDiscrepancy,
    warnings,
  };
}
