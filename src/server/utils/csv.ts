function sanitizeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Prevent CSV formula injection in spreadsheet tools
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatInrPlain(amount: number): string {
  return `INR ${amount.toFixed(2)}`;
}

/**
 * Generates an RFC-4180 compliant CSV string with explicit headers and sanitized cells.
 */
export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const headerLine = headers.map(sanitizeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(sanitizeCsvCell).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}
