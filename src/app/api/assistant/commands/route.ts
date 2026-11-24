import type { NextRequest } from "next/server";
import { voiceService } from "@/server/services/voice.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(req: NextRequest) {
  try {
    const businessId = resolveBusinessId();
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get("page") ?? "1") || 1;
    const pageSize = Math.min(50, Number(sp.get("pageSize") ?? "20") || 20);
    const status = sp.get("status") ?? undefined;
    const result = await voiceService.listCommands(businessId, {
      page,
      pageSize,
      status,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
