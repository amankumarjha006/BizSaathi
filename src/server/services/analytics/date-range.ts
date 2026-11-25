export type DateRangePreset =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "CUSTOM";

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface ResolvedDateRange {
  preset: DateRangePreset;
  timeZone: string;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
  comparisonLabel: string;
}

/**
 * Formats a Date as YYYY-MM-DD in the given IANA business timezone (default Asia/Kolkata).
 */
export function formatDateInBusinessTz(
  date: Date,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Converts a YYYY-MM-DD calendar date into the UTC Date representing 00:00:00.000 in IST.
 */
function startOfBusinessDayUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

function endOfBusinessDayUtc(isoDate: string): Date {
  const start = startOfBusinessDayUtc(isoDate);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function addDaysToIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolves business-timezone date boundaries and an equivalent previous comparison period.
 */
export function resolveAnalyticsDateRange(
  params: {
    preset?: DateRangePreset;
    from?: string;
    to?: string;
    timeZone?: string;
    referenceNow?: Date;
  } = {}
): ResolvedDateRange {
  const timeZone = params.timeZone ?? DEFAULT_BUSINESS_TIMEZONE;
  const now = params.referenceNow ?? new Date();
  const todayIso = formatDateInBusinessTz(now, timeZone);
  const preset = params.preset ?? "LAST_7_DAYS";

  let startIso = todayIso;
  let endIso = todayIso;
  let prevStartIso = addDaysToIso(todayIso, -1);
  let prevEndIso = prevStartIso;
  let label = "Today";
  let comparisonLabel = "Yesterday";

  switch (preset) {
    case "TODAY": {
      startIso = todayIso;
      endIso = todayIso;
      prevStartIso = addDaysToIso(todayIso, -1);
      prevEndIso = prevStartIso;
      label = "Today";
      comparisonLabel = "Yesterday";
      break;
    }
    case "YESTERDAY": {
      const yest = addDaysToIso(todayIso, -1);
      startIso = yest;
      endIso = yest;
      prevStartIso = addDaysToIso(yest, -1);
      prevEndIso = prevStartIso;
      label = "Yesterday";
      comparisonLabel = "Day before yesterday";
      break;
    }
    case "LAST_7_DAYS": {
      startIso = addDaysToIso(todayIso, -6);
      endIso = todayIso;
      prevEndIso = addDaysToIso(startIso, -1);
      prevStartIso = addDaysToIso(prevEndIso, -6);
      label = "Last 7 days";
      comparisonLabel = "Previous 7 days";
      break;
    }
    case "LAST_30_DAYS": {
      startIso = addDaysToIso(todayIso, -29);
      endIso = todayIso;
      prevEndIso = addDaysToIso(startIso, -1);
      prevStartIso = addDaysToIso(prevEndIso, -29);
      label = "Last 30 days";
      comparisonLabel = "Previous 30 days";
      break;
    }
    case "THIS_MONTH": {
      const [y, m, d] = todayIso.split("-").map(Number);
      startIso = `${y}-${String(m).padStart(2, "0")}-01`;
      endIso = todayIso;
      const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));
      const prevY = prevMonthEnd.getUTCFullYear();
      const prevM = prevMonthEnd.getUTCMonth() + 1;
      const clampedDay = Math.min(d, prevMonthEnd.getUTCDate());
      prevStartIso = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
      prevEndIso = `${prevY}-${String(prevM).padStart(2, "0")}-${String(
        clampedDay
      ).padStart(2, "0")}`;
      label = "This month";
      comparisonLabel = "Equivalent previous month period";
      break;
    }
    case "PREVIOUS_MONTH": {
      const [y, m] = todayIso.split("-").map(Number);
      const prevEnd = new Date(Date.UTC(y, m - 1, 0));
      const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth(), 1));
      startIso = prevStart.toISOString().slice(0, 10);
      endIso = prevEnd.toISOString().slice(0, 10);

      const twoMonthsEnd = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth(), 0));
      const twoMonthsStart = new Date(Date.UTC(twoMonthsEnd.getUTCFullYear(), twoMonthsEnd.getUTCMonth(), 1));
      prevStartIso = twoMonthsStart.toISOString().slice(0, 10);
      prevEndIso = twoMonthsEnd.toISOString().slice(0, 10);
      label = "Previous month";
      comparisonLabel = "Month prior";
      break;
    }
    case "CUSTOM": {
      startIso = params.from ?? todayIso;
      endIso = params.to ?? startIso;
      if (endIso < startIso) {
        const tmp = startIso;
        startIso = endIso;
        endIso = tmp;
      }
      const startMs = Date.parse(`${startIso}T00:00:00Z`);
      const endMs = Date.parse(`${endIso}T00:00:00Z`);
      const spanDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
      prevEndIso = addDaysToIso(startIso, -1);
      prevStartIso = addDaysToIso(prevEndIso, -(spanDays - 1));
      label = `${startIso} to ${endIso}`;
      comparisonLabel = `Previous ${spanDays} day(s)`;
      break;
    }
  }

  return {
    preset,
    timeZone,
    start: startOfBusinessDayUtc(startIso),
    end: endOfBusinessDayUtc(endIso),
    previousStart: startOfBusinessDayUtc(prevStartIso),
    previousEnd: endOfBusinessDayUtc(prevEndIso),
    label,
    comparisonLabel,
  };
}

export function enumerateBusinessDates(
  start: Date,
  end: Date,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): string[] {
  const startIso = formatDateInBusinessTz(start, timeZone);
  const endIso = formatDateInBusinessTz(end, timeZone);
  const out: string[] = [];
  let cursor = startIso;
  let guard = 0;
  while (cursor <= endIso && guard < 366) {
    out.push(cursor);
    cursor = addDaysToIso(cursor, 1);
    guard++;
  }
  return out;
}

export function getBusinessWeekdayLabel(
  date: Date,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
}
