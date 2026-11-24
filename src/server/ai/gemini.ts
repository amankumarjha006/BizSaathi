import { GoogleGenAI } from "@google/genai";
import { ConfigurationError } from "@/server/utils/errors";

/**
 * Returns true when GEMINI_API_KEY is present in the server environment.
 * Never expose GEMINI_API_KEY to client components.
 */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Creates a server-only GoogleGenAI client.
 * Throws ConfigurationError if GEMINI_API_KEY is missing.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError(
      "GEMINI_API_KEY is not configured on the server."
    );
  }
  return new GoogleGenAI({ apiKey });
}
