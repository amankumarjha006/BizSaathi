import { AppError } from "@/server/utils/errors";

export type SupportedTransactionType =
  | "PURCHASE"
  | "SALE"
  | "CUSTOMER_ORDER"
  | "EXPENSE"
  | "RETURN";

export interface RecordTransactionInput {
  businessId: string;
  transactionType: SupportedTransactionType;
  customerId?: string;
  supplierId?: string;
  documentId?: string;
}

/**
 * Transaction Service (Phase 2)
 * Single source of truth for recording confirmed purchases, sales, customer orders,
 * expenses, and returns across manual entry, document extraction, and voice commands.
 * All stock updates, payment records, and ledger entries execute inside a Prisma $transaction.
 */
export const transactionService = {
  async confirmTransaction(input: RecordTransactionInput): Promise<never> {
    void input;
    throw new AppError("Transaction service will be implemented in Phase 2.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
