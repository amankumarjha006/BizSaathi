import { z } from "zod";

export const preferredLanguageSchema = z.enum(["EN", "HI", "HINGLISH"]);

export const businessIdSchema = z.string().min(1, "businessId is required");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  database: z.object({
    configured: z.boolean(),
    connected: z.boolean(),
    latencyMs: z.number().nullable(),
    error: z.string().optional(),
  }),
  ai: z.object({
    geminiConfigured: z.boolean(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
