import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber } from "@/server/utils/decimal";
import { customerService } from "@/server/services/customer.service";

export interface CustomerAnalyticsResult {
  totalOutstanding: number;
  pendingCustomersCount: number;
  totalCustomersCount: number;
  customers: Array<{
    id: string;
    name: string;
    phone: string | null;
    totalPurchased: number;
    totalPaid: number;
    outstandingDue: number;
    transactionCount: number;
  }>;
  recentCollections: Array<{
    id: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export const customerAnalyticsService = {
  async getCustomerAnalytics(
    businessId: string,
    options: { search?: string; sortOrder?: "asc" | "desc" } = {},
    db?: PrismaClient
  ): Promise<CustomerAnalyticsResult> {
    const prisma = db ?? requirePrisma();

    const [customers, recentPayments] = await Promise.all([
      customerService.listCustomers(
        businessId,
        { search: options.search },
        prisma
      ),
      prisma.payment.findMany({
        where: {
          businessId,
          transaction: {
            transactionType: "SALE",
            customerId: { not: null },
            status: "CONFIRMED",
          },
        },
        include: {
          transaction: {
            select: { customer: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const sorted = [...customers].sort((a, b) =>
      options.sortOrder === "asc"
        ? a.outstandingDue - b.outstandingDue
        : b.outstandingDue - a.outstandingDue
    );

    const pending = sorted.filter((c) => c.outstandingDue > 0);
    const totalOutstanding = Number(
      pending.reduce((sum, c) => sum + c.outstandingDue, 0).toFixed(2)
    );

    return {
      totalOutstanding,
      pendingCustomersCount: pending.length,
      totalCustomersCount: sorted.length,
      customers: sorted.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        totalPurchased: c.totalPurchased,
        totalPaid: c.totalPaid,
        outstandingDue: c.outstandingDue,
        transactionCount: c.transactionCount,
      })),
      recentCollections: recentPayments.map((p) => ({
        id: p.id,
        customerName: p.transaction.customer?.name ?? "Customer",
        amount: decimalToNumber(p.amount),
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  },
};
