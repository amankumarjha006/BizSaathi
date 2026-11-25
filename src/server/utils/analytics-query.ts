import { NextResponse, type NextRequest } from "next/server";
import { resolveAnalyticsDateRange } from "@/server/services/analytics/date-range";
import {
  analyticsQuerySchema,
  type AnalyticsQueryInput,
} from "@/server/validations/analytics";

export function parseAnalyticsQuery(req: NextRequest): {
  query: AnalyticsQueryInput;
  range: ReturnType<typeof resolveAnalyticsDateRange>;
} {
  const sp = req.nextUrl.searchParams;
  const raw: Record<string, string> = {};
  sp.forEach((value, key) => {
    if (value !== "") raw[key] = value;
  });

  const query = analyticsQuerySchema.parse(raw);
  const range = resolveAnalyticsDateRange({
    preset: query.preset,
    from: query.from,
    to: query.to,
  });

  return { query, range };
}

export function csvResponse(csvContent: string, fileName: string): NextResponse {
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
