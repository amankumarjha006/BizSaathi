import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber, roundMoney, roundStock } from "@/server/utils/decimal";
import { ConflictError, NotFoundError } from "@/server/utils/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/server/validations/phase2";

export interface ProductListFilters {
  search?: string;
  category?: string;
  includeArchived?: boolean;
  sortBy?: "name" | "currentStock" | "sellingPrice" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface SerializedProduct {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  category: string | null;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minimumStock: number;
  unit: string;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeProduct(product: {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  category: string | null;
  purchasePrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  currentStock: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SerializedProduct {
  const currentStock = decimalToNumber(product.currentStock);
  const minimumStock = decimalToNumber(product.minimumStock);
  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    sku: product.sku,
    category: product.category,
    purchasePrice: decimalToNumber(product.purchasePrice),
    sellingPrice: decimalToNumber(product.sellingPrice),
    currentStock,
    minimumStock,
    unit: product.unit,
    isActive: product.isActive,
    isLowStock: product.isActive && currentStock <= minimumStock,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const productService = {
  async listProducts(
    businessId: string,
    filters: ProductListFilters = {},
    db?: PrismaClient
  ): Promise<SerializedProduct[]> {
    const prisma = db ?? requirePrisma();
    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(filters.includeArchived ? {} : { isActive: true }),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { sku: { contains: filters.search, mode: "insensitive" } },
              { category: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const sortBy = filters.sortBy ?? "name";
    const sortOrder = filters.sortOrder ?? "asc";

    const products = await prisma.product.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
    });

    return products.map(serializeProduct);
  },

  async getProductById(
    businessId: string,
    productId: string,
    db?: PrismaClient
  ): Promise<SerializedProduct> {
    const prisma = db ?? requirePrisma();
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return serializeProduct(product);
  },

  async createProduct(
    businessId: string,
    input: CreateProductInput,
    db?: PrismaClient
  ): Promise<SerializedProduct> {
    const prisma = db ?? requirePrisma();

    if (input.sku) {
      const existing = await prisma.product.findFirst({
        where: { businessId, sku: input.sku },
      });
      if (existing) {
        throw new ConflictError(
          `A product with SKU "${input.sku}" already exists.`
        );
      }
    }

    const created = await prisma.product.create({
      data: {
        businessId,
        name: input.name,
        sku: input.sku ?? null,
        category: input.category ?? null,
        purchasePrice: roundMoney(input.purchasePrice),
        sellingPrice: roundMoney(input.sellingPrice),
        currentStock: roundStock(input.currentStock),
        minimumStock: roundStock(input.minimumStock),
        unit: input.unit,
        isActive: true,
      },
    });

    return serializeProduct(created);
  },

  async updateProduct(
    businessId: string,
    productId: string,
    input: UpdateProductInput,
    db?: PrismaClient
  ): Promise<SerializedProduct> {
    const prisma = db ?? requirePrisma();

    const existing = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!existing) {
      throw new NotFoundError("Product not found");
    }

    if (input.sku && input.sku !== existing.sku) {
      const duplicateSku = await prisma.product.findFirst({
        where: {
          businessId,
          sku: input.sku,
          NOT: { id: productId },
        },
      });
      if (duplicateSku) {
        throw new ConflictError(
          `A product with SKU "${input.sku}" already exists.`
        );
      }
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.purchasePrice !== undefined
          ? { purchasePrice: roundMoney(input.purchasePrice) }
          : {}),
        ...(input.sellingPrice !== undefined
          ? { sellingPrice: roundMoney(input.sellingPrice) }
          : {}),
        ...(input.minimumStock !== undefined
          ? { minimumStock: roundStock(input.minimumStock) }
          : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return serializeProduct(updated);
  },

  async archiveProduct(
    businessId: string,
    productId: string,
    db?: PrismaClient
  ): Promise<SerializedProduct> {
    return productService.updateProduct(
      businessId,
      productId,
      { isActive: false },
      db
    );
  },
};
