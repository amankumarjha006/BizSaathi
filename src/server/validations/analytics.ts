import { z } from "zod";
import { paymentMethodSchema } from "@/server/validations/phase2";

export const dateRangePresetSchema = z.enum([
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "PREVIOUS_MONTH",
  "CUSTOM",
]);

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const analyticsQuerySchema = z.object({
  preset: dateRangePresetSchema.default("LAST_7_DAYS"),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  groupBy: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  paymentMethod: paymentMethodSchema.optional(),
  supplierId: z.string().trim().min(1).optional(),
  direction: z.enum(["INFLOW", "OUTFLOW", "ALL"]).default("ALL"),
  category: z.string().trim().min(1).optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(["amount", "name", "units", "date"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  format: z.enum(["json", "csv"]).default("json"),
  explain: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
