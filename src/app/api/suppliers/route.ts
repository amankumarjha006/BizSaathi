import type { NextRequest } from "next/server";
import { supplierService } from "@/server/services/supplier.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { createPartySchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const suppliers = await supplierService.listSuppliers(businessId, search);
    return jsonOk(suppliers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createPartySchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const created = await supplierService.createSupplier(businessId, input);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
