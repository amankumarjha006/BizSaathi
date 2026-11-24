import type { NextRequest } from "next/server";
import { ledgerService } from "@/server/services/ledger.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId(
      req.nextUrl.searchParams.get("businessId")
    );
    const ledger = await ledgerService.getSupplierLedger(businessId, id);
    return jsonOk(ledger);
  } catch (error) {
    return handleApiError(error);
  }
}
