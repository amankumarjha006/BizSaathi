import type { NextRequest } from "next/server";
import { productService } from "@/server/services/product.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { createProductSchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const includeArchived =
      req.nextUrl.searchParams.get("includeArchived") === "true";
    const sortBy = req.nextUrl.searchParams.get("sortBy") as
      | "name"
      | "currentStock"
      | "sellingPrice"
      | "updatedAt"
      | null;
    const sortOrder = req.nextUrl.searchParams.get("sortOrder") as
      | "asc"
      | "desc"
      | null;

    const products = await productService.listProducts(businessId, {
      search,
      category,
      includeArchived,
      sortBy: sortBy ?? undefined,
      sortOrder: sortOrder ?? undefined,
    });

    return jsonOk(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createProductSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const created = await productService.createProduct(businessId, input);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
