/**
 * Format a date range string from start_date and end_date.
 * Output format: "Mar 14, 2025" or "Mar 14 – 16, 2025" or "Mar 14 – Apr 2, 2025"
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate?: string | null,
): string {
  if (!startDate) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  // Parse as UTC to prevent timezone-induced date shifts
  const start = new Date(startDate + (startDate.includes("T") ? "" : "T00:00:00Z"));
  const startStr = start.toLocaleDateString("en-US", opts);

  if (!endDate || endDate === startDate) return startStr;

  const end = new Date(endDate + (endDate.includes("T") ? "" : "T00:00:00Z"));
  // Same month+year: "Feb 11 – 13, 2026"
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    const monthDay = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${monthDay} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  // Different months: "Mar 28 – Apr 2, 2025"
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    const startPart = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const endPart = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${startPart} – ${endPart}, ${end.getUTCFullYear()}`;
  }
  return `${startStr} – ${end.toLocaleDateString("en-US", opts)}`;
}
