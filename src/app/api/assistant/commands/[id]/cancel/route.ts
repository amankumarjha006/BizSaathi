import type { NextRequest } from "next/server";
import { voiceService } from "@/server/services/voice.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId();
    const cancelled = await voiceService.cancelCommand(businessId, id);
    return jsonOk(cancelled);
  } catch (error) {
    return handleApiError(error);
  }
}
