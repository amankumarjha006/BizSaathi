import type { NextRequest } from "next/server";
import { customerService } from "@/server/services/customer.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { updatePartySchema } from "@/server/validations/phase2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const customer = await customerService.getCustomerById(businessId, id);
    return jsonOk(customer);
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
    const input = updatePartySchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const updated = await customerService.updateCustomer(businessId, id, input);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
