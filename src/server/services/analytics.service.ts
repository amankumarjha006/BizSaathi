import { AppError } from "@/server/utils/errors";

/**
 * Analytics Service (Phase 5)
 * Computes daily sales, purchase totals, outstanding customer Udhaar,
 * low-stock alerts, and voice-queried business summaries from PostgreSQL.
 */
export const analyticsService = {
  async getDashboardSummary(businessId: string): Promise<never> {
    void businessId;
    throw new AppError("Analytics service will be implemented in Phase 5.", {
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
