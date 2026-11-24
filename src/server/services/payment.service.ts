import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber } from "@/server/utils/decimal";
import { transactionService } from "./transaction.service";
import type { RecordPaymentInput } from "@/server/validations/phase2";

export const paymentService = {
  recordPayment(
    businessId: string,
    input: RecordPaymentInput,
    db?: PrismaClient
  ) {
    return transactionService.recordPayment(businessId, input, db);
  },

  async listPayments(businessId: string, limit = 50, db?: PrismaClient) {
    const prisma = db ?? requirePrisma();
    const payments = await prisma.payment.findMany({
      where: { businessId },
      include: {
        transaction: {
          select: {
            referenceNumber: true,
            transactionType: true,
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return payments.map((p) => ({
      id: p.id,
      transactionId: p.transactionId,
      referenceNumber: p.transaction.referenceNumber,
      transactionType: p.transaction.transactionType,
      partyName:
        p.transaction.customer?.name ??
        p.transaction.supplier?.name ??
        "Walk-in",
      amount: decimalToNumber(p.amount),
      paymentMethod: p.paymentMethod,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
    }));
  },
};
