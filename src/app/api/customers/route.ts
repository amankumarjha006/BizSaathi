import type { NextRequest } from "next/server";
import { customerService } from "@/server/services/customer.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { createPartySchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const onlyWithDue = req.nextUrl.searchParams.get("onlyWithDue") === "true";
    const customers = await customerService.listCustomers(businessId, {
      search,
      onlyWithDue,
    });
    return jsonOk(customers);
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
    const created = await customerService.createCustomer(businessId, input);
    return jsonCreated(created);
  } catch (error) {
    return handleApiError(error);
  }
}
