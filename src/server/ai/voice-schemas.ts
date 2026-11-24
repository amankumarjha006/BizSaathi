import { z } from "zod";
import { paymentMethodSchema } from "@/server/validations/phase2";

export const voiceLanguageSchema = z.enum(["EN", "HI", "HINGLISH"]);
export const voiceInputModeSchema = z.enum(["VOICE", "TEXT"]);

export const voiceIntentSchema = z.enum([
  "CHECK_STOCK",
  "ADD_STOCK",
  "RECORD_SALE",
  "CHECK_CUSTOMER_DUES",
  "RECORD_PAYMENT",
  "GET_SALES_SUMMARY",
  "RECORD_EXPENSE",
  "RECORD_PURCHASE",
  "GET_LOW_STOCK",
  "GET_CUSTOMER_TRANSACTIONS",
  "GET_REVENUE_REPORT",
  "UNSUPPORTED",
]);

export const READ_ONLY_INTENTS = new Set<z.infer<typeof voiceIntentSchema>>([
  "CHECK_STOCK",
  "CHECK_CUSTOMER_DUES",
  "GET_SALES_SUMMARY",
  "GET_LOW_STOCK",
  "GET_CUSTOMER_TRANSACTIONS",
  "GET_REVENUE_REPORT",
]);

export const voiceDatePeriodSchema = z.enum([
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "THIS_MONTH",
]);

export const voiceExtractedItemSchema = z.object({
  productName: z.string().trim().min(1),
  quantity: z.number().positive(),
  unit: z.string().trim().nullable(),
  unitPrice: z.number().min(0).nullable(),
});

export const voiceExtractedIntentSchema = z.object({
  intent: voiceIntentSchema,
  language: voiceLanguageSchema,
  entities: z.object({
    productName: z.string().trim().nullable(),
    customerName: z.string().trim().nullable(),
    supplierName: z.string().trim().nullable(),
    items: z.array(voiceExtractedItemSchema),
    quantity: z.number().positive().nullable(),
    unit: z.string().trim().nullable(),
    unitPrice: z.number().min(0).nullable(),
    paymentAmount: z.number().min(0).nullable(),
    paymentMethod: paymentMethodSchema.nullable(),
    expenseAmount: z.number().min(0).nullable(),
    expenseCategory: z.string().trim().nullable(),
    expenseDescription: z.string().trim().nullable(),
    datePeriod: voiceDatePeriodSchema.nullable(),
    adjustmentReason: z.string().trim().nullable(),
  }),
  missingInformation: z.array(z.string()),
  clarificationRequired: z.boolean(),
  clarificationQuestion: z.string().trim().nullable(),
  responseText: z.string().trim(),
});

export const interpretVoiceCommandSchema = z.object({
  transcript: z.string().trim().min(1, "Command transcript cannot be empty").max(500),
  language: voiceLanguageSchema.default("HINGLISH"),
  inputMode: voiceInputModeSchema.default("VOICE"),
});

export const resolvedCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string().optional(),
  score: z.number(),
});

export const resolvedVoiceItemSchema = z.object({
  sourceName: z.string(),
  resolvedProductId: z.string().nullable(),
  resolvedProductName: z.string().nullable(),
  unit: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  availableStock: z.number().nullable(),
  lineTotal: z.number().min(0),
  candidates: z.array(resolvedCandidateSchema),
});

export const voiceDraftStateSchema = z.object({
  intent: voiceIntentSchema,
  language: voiceLanguageSchema,
  isReadOnly: z.boolean(),
  items: z.array(resolvedVoiceItemSchema),
  resolvedCustomerId: z.string().nullable(),
  resolvedCustomerName: z.string().nullable(),
  customerOutstandingDue: z.number().nullable(),
  customerCandidates: z.array(resolvedCandidateSchema),
  resolvedSupplierId: z.string().nullable(),
  resolvedSupplierName: z.string().nullable(),
  supplierCandidates: z.array(resolvedCandidateSchema),
  paymentAmount: z.number().min(0).nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  expenseAmount: z.number().min(0).nullable(),
  expenseCategory: z.string().nullable(),
  expenseDescription: z.string().nullable(),
  datePeriod: voiceDatePeriodSchema.nullable(),
  adjustmentReason: z.string().nullable(),
  calculatedTotal: z.number().min(0),
  missingInformation: z.array(z.string()),
  clarificationQuestion: z.string().nullable(),
  assistantMessage: z.string(),
});

export const updateVoiceDraftSchema = z.object({
  items: z
    .array(
      z.object({
        sourceName: z.string().optional(),
        resolvedProductId: z.string().nullable(),
        quantity: z.coerce.number().positive("Quantity must be greater than zero"),
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .optional(),
  resolvedCustomerId: z.string().nullable().optional(),
  resolvedSupplierId: z.string().nullable().optional(),
  paymentAmount: z.coerce.number().min(0).nullable().optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  expenseAmount: z.coerce.number().positive().nullable().optional(),
  expenseCategory: z.string().trim().max(80).nullable().optional(),
  expenseDescription: z.string().trim().max(240).nullable().optional(),
  adjustmentReason: z.string().trim().max(240).nullable().optional(),
});

export type VoiceLanguage = z.infer<typeof voiceLanguageSchema>;
export type VoiceInputMode = z.infer<typeof voiceInputModeSchema>;
export type VoiceIntent = z.infer<typeof voiceIntentSchema>;
export type VoiceExtractedIntent = z.infer<typeof voiceExtractedIntentSchema>;
export type VoiceDraftState = z.infer<typeof voiceDraftStateSchema>;
export type UpdateVoiceDraftInput = z.infer<typeof updateVoiceDraftSchema>;
export type ResolvedCandidate = z.infer<typeof resolvedCandidateSchema>;
export type ResolvedVoiceItem = z.infer<typeof resolvedVoiceItemSchema>;
