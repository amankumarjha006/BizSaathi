import { z } from "zod";
import { getGeminiClient, getGeminiModel } from "./gemini-client";
import { VOICE_INTENT_SYSTEM_PROMPT } from "./voice-prompts";
import {
  voiceExtractedIntentSchema,
  type VoiceExtractedIntent,
  type VoiceLanguage,
} from "./voice-schemas";
import { AppError, ValidationError } from "@/server/utils/errors";

export interface VoiceIntentRunner {
  extractIntentJson(params: {
    transcript: string;
    language: VoiceLanguage;
  }): Promise<string>;
}

const defaultVoiceIntentRunner: VoiceIntentRunner = {
  async extractIntentJson({ transcript, language }) {
    const ai = getGeminiClient();
    const model = getGeminiModel();
    const jsonSchema = z.toJSONSchema(voiceExtractedIntentSchema) as Record<
      string,
      unknown
    >;

    const userPrompt = `Preferred language: ${language}
Shopkeeper command transcript:
"""
${transcript}
"""
Extract the structured intent and entities into the required JSON schema.`;

    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: VOICE_INTENT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.1,
      },
    });

    if (!response.text) {
      throw new AppError("Gemini returned an empty intent response.", {
        statusCode: 502,
        code: "AI_EMPTY_RESPONSE",
      });
    }

    return response.text;
  },
};

export async function extractVoiceIntent(
  params: { transcript: string; language: VoiceLanguage },
  runner: VoiceIntentRunner = defaultVoiceIntentRunner
): Promise<VoiceExtractedIntent> {
  const raw = await runner.extractIntentJson(params);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      "Voice AI returned malformed JSON. Please try speaking or typing again."
    );
  }

  const validated = voiceExtractedIntentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ValidationError(
      "Voice AI output failed command schema validation.",
      validated.error.flatten()
    );
  }

  return validated.data;
}
