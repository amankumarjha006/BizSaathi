import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber } from "@/server/utils/decimal";
import { supplierService } from "@/server/services/supplier.service";

export interface SupplierAnalyticsResult {
  totalPayables: number;
  pendingSuppliersCount: number;
  totalSuppliersCount: number;
  suppliers: Array<{
    id: string;
    name: string;
    phone: string | null;
    totalPurchased: number;
    totalPaid: number;
    outstandingPayable: number;
    transactionCount: number;
  }>;
  recentPayments: Array<{
    id: string;
    supplierName: string;
    amount: number;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export const supplierAnalyticsService = {
  async getSupplierAnalytics(
    businessId: string,
    options: { search?: string; sortOrder?: "asc" | "desc" } = {},
    db?: PrismaClient
  ): Promise<SupplierAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const [suppliers, recentPayments] = await Promise.all([
      supplierService.listSuppliers(businessId, options.search, prisma),
      prisma.payment.findMany({
        where: {
          businessId,
          transaction: {
            transactionType: "PURCHASE",
            supplierId: { not: null },
            status: "CONFIRMED",
          },
        },
        include: {
          transaction: {
            select: { supplier: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const sorted = [...suppliers].sort((a, b) =>
      options.sortOrder === "asc"
        ? a.outstandingPayable - b.outstandingPayable
        : b.outstandingPayable - a.outstandingPayable
    );

    const pending = sorted.filter((s) => s.outstandingPayable > 0);
    const totalPayables = Number(
      pending.reduce((sum, s) => sum + s.outstandingPayable, 0).toFixed(2)
    );

    return {
      totalPayables,
      pendingSuppliersCount: pending.length,
      totalSuppliersCount: sorted.length,
      suppliers: sorted.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        totalPurchased: s.totalPurchased,
        totalPaid: s.totalPaid,
        outstandingPayable: s.outstandingPayable,
        transactionCount: s.transactionCount,
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        supplierName: p.transaction.supplier?.name ?? "Supplier",
        amount: decimalToNumber(p.amount),
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  },
};
