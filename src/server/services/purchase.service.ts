import type { PrismaClient } from "@/generated/prisma/client";
import { transactionService } from "./transaction.service";
import type { CreatePurchaseInput } from "@/server/validations/phase2";

export const purchaseService = {
  recordPurchase(
    businessId: string,
    input: CreatePurchaseInput,
    db?: PrismaClient
  ) {
    return transactionService.recordPurchase(businessId, input, db);
  },

  listPurchases(businessId: string, search?: string, db?: PrismaClient) {
    return transactionService.listTransactions(
      businessId,
      { transactionType: "PURCHASE", search },
      db
    );
  },

  getPurchaseById(businessId: string, id: string, db?: PrismaClient) {
    return transactionService.getTransactionById(businessId, id, db);
  },
};
