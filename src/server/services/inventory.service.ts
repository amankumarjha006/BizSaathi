import { AppError } from "@/server/utils/errors";

export interface StockAdjustmentInput {
  businessId: string;
  productId: string;
  quantityDelta: number;
  reason: string;
  referenceId?: string;
}

/**
 * Inventory Service (Phase 2)
 * Handles product catalog CRUD, alias matching, stock level checks,
 * and atomic stock movement recording via Prisma transactions.
 */
export const inventoryService = {
  async listProducts(businessId: string): Promise<never> {
    void businessId;
    throw new AppError("Inventory service will be implemented in Phase 2.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },

  async adjustStock(input: StockAdjustmentInput): Promise<never> {
    void input;
    throw new AppError("Stock adjustment will be implemented in Phase 2.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
