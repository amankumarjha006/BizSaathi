import type { NextRequest } from "next/server";
import { transactionService } from "@/server/services/transaction.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const transactionType = req.nextUrl.searchParams.get("type") as
      | "PURCHASE"
      | "SALE"
      | "CUSTOMER_ORDER"
      | "EXPENSE"
      | "RETURN"
      | null;
    const status = req.nextUrl.searchParams.get("status") as
      | "DRAFT"
      | "PENDING_CONFIRMATION"
      | "CONFIRMED"
      | "CANCELLED"
      | null;
    const search = req.nextUrl.searchParams.get("search") ?? undefined;

    const txns = await transactionService.listTransactions(businessId, {
      transactionType: transactionType ?? undefined,
      status: status ?? undefined,
      search,
    });
    return jsonOk(txns);
  } catch (error) {
    return handleApiError(error);
  }
}
