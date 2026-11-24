import type { NextRequest } from "next/server";
import { paymentService } from "@/server/services/payment.service";
import { handleApiError, jsonCreated, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";
import { recordPaymentSchema } from "@/server/validations/phase2";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const payments = await paymentService.listPayments(businessId);
    return jsonOk(payments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = recordPaymentSchema.parse(body);
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const updatedTxn = await paymentService.recordPayment(businessId, input);
    return jsonCreated(updatedTxn);
  } catch (error) {
    return handleApiError(error);
  }
}
