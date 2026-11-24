import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import {
  decimalToNumber,
  roundStock,
  toDecimal,
} from "@/server/utils/decimal";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { serializeProduct, type SerializedProduct } from "./product.service";
import type { StockAdjustmentInput } from "@/server/validations/phase2";

export type TxClient = Prisma.TransactionClient;

export interface StockMutationParams {
  businessId: string;
  productId: string;
  quantity: Prisma.Decimal | number | string;
  movementType:
    | "PURCHASE_IN"
    | "SALE_OUT"
    | "RETURN_IN"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT";
  referenceId?: string;
  notes?: string;
}

export interface SerializedStockMovement {
  id: string;
  businessId: string;
  productId: string;
  productName?: string;
  productUnit?: string;
  movementType: string;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Atomically increases product stock and records a StockMovement inside an active Prisma transaction.
 */
export async function addStockTx(
  tx: TxClient,
  params: StockMutationParams
): Promise<void> {
  const qty = roundStock(params.quantity);
  if (qty.lte(0)) {
    throw new ValidationError("Stock quantity to add must be positive.");
  }

  const updated = await tx.product.updateMany({
    where: { id: params.productId, businessId: params.businessId },
    data: { currentStock: { increment: qty } },
  });

  if (updated.count === 0) {
    throw new NotFoundError("Product not found for this business.");
  }

  await tx.stockMovement.create({
    data: {
      businessId: params.businessId,
      productId: params.productId,
      movementType: params.movementType,
      quantity: qty,
      referenceId: params.referenceId ?? null,
      notes: params.notes ?? null,
    },
  });
}

/**
 * Atomically decreases product stock inside an active Prisma transaction.
 * Uses a conditional update (currentStock >= qty) to prevent negative inventory under concurrency.
 */
export async function removeStockTx(
  tx: TxClient,
  params: StockMutationParams
): Promise<void> {
  const qty = roundStock(params.quantity);
  if (qty.lte(0)) {
    throw new ValidationError("Stock quantity to remove must be positive.");
  }

  const product = await tx.product.findFirst({
    where: { id: params.productId, businessId: params.businessId },
    select: { id: true, name: true, currentStock: true, unit: true },
  });

  if (!product) {
    throw new NotFoundError("Product not found for this business.");
  }

  const updated = await tx.product.updateMany({
    where: {
      id: params.productId,
      businessId: params.businessId,
      currentStock: { gte: qty },
    },
    data: { currentStock: { decrement: qty } },
  });

  if (updated.count === 0) {
    throw new ConflictError(
      `Insufficient stock for "${product.name}". Available: ${toDecimal(product.currentStock).toString()} ${product.unit}, requested: ${qty.toString()} ${product.unit}.`
    );
  }

  await tx.stockMovement.create({
    data: {
      businessId: params.businessId,
      productId: params.productId,
      movementType: params.movementType,
      quantity: qty,
      referenceId: params.referenceId ?? null,
      notes: params.notes ?? null,
    },
  });
}

export const inventoryService = {
  addStock: addStockTx,
  removeStock: removeStockTx,

  async adjustStock(
    businessId: string,
    input: StockAdjustmentInput,
    db?: PrismaClient
  ): Promise<SerializedProduct> {
    const prisma = db ?? requirePrisma();

    return prisma.$transaction(async (tx) => {
      if (
        input.movementType === "ADJUSTMENT_IN" ||
        input.movementType === "RETURN_IN"
      ) {
        await addStockTx(tx, {
          businessId,
          productId: input.productId,
          quantity: input.quantity,
          movementType: input.movementType,
          notes: input.notes,
        });
      } else {
        await removeStockTx(tx, {
          businessId,
          productId: input.productId,
          quantity: input.quantity,
          movementType: "ADJUSTMENT_OUT",
          notes: input.notes,
        });
      }

      const updated = await tx.product.findFirst({
        where: { id: input.productId, businessId },
      });
      if (!updated) {
        throw new NotFoundError("Product not found");
      }
      return serializeProduct(updated);
    });
  },

  async getAvailableStock(
    businessId: string,
    productId: string,
    db?: PrismaClient
  ): Promise<number> {
    const prisma = db ?? requirePrisma();
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { currentStock: true },
    });
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return decimalToNumber(product.currentStock);
  },

  async getLowStockProducts(
    businessId: string,
    db?: PrismaClient
  ): Promise<SerializedProduct[]> {
    const prisma = db ?? requirePrisma();
    const products = await prisma.product.findMany({
      where: { businessId, isActive: true },
      orderBy: { currentStock: "asc" },
    });

    return products
      .map(serializeProduct)
      .filter((p) => p.currentStock <= p.minimumStock);
  },

  async getStockMovementHistory(
    businessId: string,
    productId?: string,
    limit = 50,
    db?: PrismaClient
  ): Promise<SerializedStockMovement[]> {
    const prisma = db ?? requirePrisma();
    const movements = await prisma.stockMovement.findMany({
      where: {
        businessId,
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { name: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return movements.map((m) => ({
      id: m.id,
      businessId: m.businessId,
      productId: m.productId,
      productName: m.product.name,
      productUnit: m.product.unit,
      movementType: m.movementType,
      quantity: decimalToNumber(m.quantity),
      referenceId: m.referenceId,
      notes: m.notes,
      createdAt: m.createdAt.toISOString(),
    }));
  },
};
