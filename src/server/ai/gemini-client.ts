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
 * Resolves the Gemini model identifier strictly from the GEMINI_MODEL environment variable.
 * Throws ConfigurationError if unset so model identifiers are never hardcoded across services.
 */
export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) {
    throw new ConfigurationError(
      "GEMINI_MODEL is not configured on the server. Set GEMINI_MODEL in .env."
    );
  }
  return model;
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
