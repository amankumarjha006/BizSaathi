import type { NextRequest } from "next/server";
import { productService } from "@/server/services/product.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const products = await productService.listProducts(businessId, { search });
    return jsonOk(products);
  } catch (error) {
    return handleApiError(error);
  }
}
