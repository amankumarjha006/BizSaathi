import { AppError } from "@/server/utils/errors";

export type VoiceLanguage = "EN" | "HI" | "HINGLISH";

export interface VoiceIntentInput {
  businessId: string;
  transcript: string;
  language: VoiceLanguage;
}

/**
 * Voice Assistant Service (Phase 4)
 * Extracts structured business intents from Hindi, English, and Hinglish transcripts
 * using Gemini, validates parameters, and requires explicit user confirmation before
 * delegating mutations to transactionService or inventoryService.
 */
export const voiceService = {
  async parseIntent(input: VoiceIntentInput): Promise<never> {
    void input;
    throw new AppError("Voice intent parsing will be implemented in Phase 4.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
