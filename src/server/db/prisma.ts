import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createPrismaClient(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      max: 10,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Returns the singleton PrismaClient instance, or null if DATABASE_URL is not configured.
 */
export function getPrismaClient(): PrismaClient | null {
  if (!globalForPrisma.prisma) {
    const client = createPrismaClient();
    if (!client) {
      return null;
    }
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
    }
    return client;
  }
  return globalForPrisma.prisma;
}

export interface DatabaseHealthResult {
  configured: boolean;
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}

/**
 * Performs an honest connectivity check against PostgreSQL.
 * Never reports connected=true unless a live query succeeds.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!process.env.DATABASE_URL) {
    return {
      configured: false,
      connected: false,
      latencyMs: null,
      error: "DATABASE_URL is not configured",
    };
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return {
      configured: false,
      connected: false,
      latencyMs: null,
      error: "Prisma client could not be initialized",
    };
  }

  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      configured: true,
      connected: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "Database connection failed",
    };
  }
}
