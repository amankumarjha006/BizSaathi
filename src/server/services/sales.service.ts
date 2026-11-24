import type { PrismaClient } from "@/generated/prisma/client";
import { transactionService } from "./transaction.service";
import type { CreateSaleInput } from "@/server/validations/phase2";

export const salesService = {
  recordSale(businessId: string, input: CreateSaleInput, db?: PrismaClient) {
    return transactionService.recordSale(businessId, input, db);
  },

  listSales(businessId: string, search?: string, db?: PrismaClient) {
    return transactionService.listTransactions(
      businessId,
      { transactionType: "SALE", search },
      db
    );
  },

  getSaleById(businessId: string, id: string, db?: PrismaClient) {
    return transactionService.getTransactionById(businessId, id, db);
  },
};
