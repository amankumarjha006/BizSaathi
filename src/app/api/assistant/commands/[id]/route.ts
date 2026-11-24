import type { NextRequest } from "next/server";
import { voiceService } from "@/server/services/voice.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId();
    const cmd = await voiceService.getCommandById(businessId, id);
    return jsonOk(cmd);
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
    const businessId = resolveBusinessId();
    const updated = await voiceService.updateCommandDraft(businessId, id, body);
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
