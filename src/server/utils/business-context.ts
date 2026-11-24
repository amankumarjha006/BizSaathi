import { getPrismaClient } from "@/server/db/prisma";
import { ConfigurationError } from "@/server/utils/errors";
import type { PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_DEMO_BUSINESS_ID = "demo-kirana-store";

/**
 * Returns the configured PrismaClient or throws a 503 ConfigurationError
 * when DATABASE_URL is missing.
 */
export function requirePrisma(): PrismaClient {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new ConfigurationError(
      "Database is not configured. Set DATABASE_URL in .env and run Prisma migrations."
    );
  }
  return prisma;
}

/**
 * Resolves the active businessId for the current request.
 * In Phase 2 (prior to full multi-tenant auth), falls back to the demo business ID.
 */
export function resolveBusinessId(explicitBusinessId?: string | null): string {
  const trimmed = explicitBusinessId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_DEMO_BUSINESS_ID;
}
