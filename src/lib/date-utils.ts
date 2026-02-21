/**
 * Format a date range string from start_date and end_date.
 * Output format: "Mar 14, 2025" or "Mar 14 – 16, 2025" or "Mar 14 – Apr 2, 2025"
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate?: string | null,
): string {
  if (!startDate) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const start = new Date(startDate);
  const startStr = start.toLocaleDateString("en-US", opts);

  if (!endDate || endDate === startDate) return startStr;

  const end = new Date(endDate);
  // Same month+year: "Feb 11 – 13, 2026"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const monthDay = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${monthDay} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  // Different months: "Mar 28 – Apr 2, 2025"
  if (start.getFullYear() === end.getFullYear()) {
    const startPart = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endPart = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startPart} – ${endPart}, ${end.getFullYear()}`;
  }
  return `${startStr} – ${end.toLocaleDateString("en-US", opts)}`;
}
