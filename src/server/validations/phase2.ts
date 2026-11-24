import { z } from "zod";

export const paymentMethodSchema = z.enum([
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "OTHER",
]);

export const transactionTypeSchema = z.enum([
  "PURCHASE",
  "SALE",
  "CUSTOMER_ORDER",
  "EXPENSE",
  "RETURN",
]);

export const transactionStatusSchema = z.enum([
  "DRAFT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED",
]);

// ============================================================================
// PRODUCT & INVENTORY
// ============================================================================

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length > 0 ? v : undefined))
    .optional();

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v))
    .optional();

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(120),
  sku: optionalTrimmed(60),
  category: optionalTrimmed(60),
  purchasePrice: z.coerce.number().min(0, "Purchase price cannot be negative"),
  sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative"),
  currentStock: z.coerce
    .number()
    .min(0, "Initial stock cannot be negative")
    .default(0),
  minimumStock: z.coerce
    .number()
    .min(0, "Minimum stock threshold cannot be negative")
    .default(0),
  unit: z.string().trim().min(1, "Unit is required").max(24).default("pcs"),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sku: nullableTrimmed(60),
  category: nullableTrimmed(60),
  purchasePrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  isActive: z.boolean().optional(),
});

export const stockAdjustmentSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  movementType: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN_IN"]),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  notes: z.string().trim().max(240).optional(),
});

// ============================================================================
// CUSTOMERS & SUPPLIERS
// ============================================================================

export const createPartySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: optionalTrimmed(20),
});

export const updatePartySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: nullableTrimmed(20),
});

// ============================================================================
// PURCHASES & SALES
// ============================================================================

export const purchaseItemInputSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  referenceNumber: optionalTrimmed(60),
  transactionDate: z.coerce.date().optional(),
  items: z
    .array(purchaseItemInputSchema)
    .min(1, "At least one product item is required"),
  paidAmount: z.coerce.number().min(0, "Paid amount cannot be negative").default(0),
  paymentMethod: paymentMethodSchema.default("CASH"),
  notes: z.string().trim().max(300).optional(),
});

export const saleItemInputSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPrice: z.coerce
    .number()
    .min(0, "Unit price cannot be negative")
    .optional(),
});

export const createSaleSchema = z.object({
  customerId: optionalTrimmed(60),
  transactionDate: z.coerce.date().optional(),
  items: z
    .array(saleItemInputSchema)
    .min(1, "At least one product item is required"),
  paidAmount: z.coerce.number().min(0, "Paid amount cannot be negative").default(0),
  paymentMethod: paymentMethodSchema.default("CASH"),
  notes: z.string().trim().max(300).optional(),
});

// ============================================================================
// PAYMENTS
// ============================================================================

export const recordPaymentSchema = z.object({
  transactionId: z.string().min(1, "Transaction is required"),
  amount: z.coerce.number().positive("Payment amount must be greater than zero"),
  paymentMethod: paymentMethodSchema.default("CASH"),
  notes: z.string().trim().max(240).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
