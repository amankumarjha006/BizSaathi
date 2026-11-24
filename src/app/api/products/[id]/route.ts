import type { NextRequest } from "next/server";
import { productService } from "@/server/services/product.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { updateProductSchema } from "@/server/validations/phase2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const product = await productService.getProductById(businessId, id);
    return jsonOk(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = updateProductSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const updated = await productService.updateProduct(businessId, id, input);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const archived = await productService.archiveProduct(businessId, id);
    return jsonOk(archived);
  } catch (error) {
    return handleApiError(error);
  }
}
