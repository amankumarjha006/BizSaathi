import type { NextRequest } from "next/server";
import { interpretVoiceCommandSchema } from "@/server/ai/voice-schemas";
import { voiceService } from "@/server/services/voice.service";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = interpretVoiceCommandSchema.parse(body);
    const businessId = resolveBusinessId();
    const result = await voiceService.interpretCommand(businessId, input);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
