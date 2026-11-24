import { checkDatabaseHealth } from "@/server/db/prisma";
import { isGeminiConfigured } from "@/server/ai/gemini";
import { handleApiError, jsonOk } from "@/server/utils/api-response";
import { healthResponseSchema } from "@/server/validations/common";

export async function GET() {
  try {
    const database = await checkDatabaseHealth();
    const geminiConfigured = isGeminiConfigured();

    const payload = healthResponseSchema.parse({
      status: database.connected ? "ok" : "degraded",
      service: "bizsaathi-api",
      version: "0.1.0",
      environment: process.env.NODE_ENV ?? "development",
      database,
      ai: {
        geminiConfigured,
      },
    });

    const httpStatus = database.connected ? 200 : 503;
    return jsonOk(payload, httpStatus);
  } catch (error) {
    return handleApiError(error);
  }
}
