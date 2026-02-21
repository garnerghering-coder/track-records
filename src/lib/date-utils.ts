/**
 * Format a date range string from start_date and end_date.
 * If both are the same or end_date is missing, shows just the start date.
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!startDate) return "";
  const opts = options || { day: "numeric", month: "short", year: "numeric" };
  const start = new Date(startDate);
  const startStr = start.toLocaleDateString(undefined, opts);

  if (!endDate || endDate === startDate) return startStr;

  const end = new Date(endDate);
  // If same month+year, show "14 – 16 Mar 2025"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const dayOnly = start.toLocaleDateString(undefined, { day: "numeric" });
    return `${dayOnly} – ${end.toLocaleDateString(undefined, opts)}`;
  }
  return `${startStr} – ${end.toLocaleDateString(undefined, opts)}`;
}
