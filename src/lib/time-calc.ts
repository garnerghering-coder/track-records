/**
 * Time parsing and auto-calculation utilities for lap times, gaps, and intervals.
 */

/**
 * Parse a time string to milliseconds.
 * Supports formats: "M:SS.mmm", "SS.mmm", "+S.mmm", "+SS.mmm", "+M:SS.mmm"
 */
export function parseTime(str: string): number | null {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/^\+/, "");
  if (!s) return null;

  // M:SS.mmm or MM:SS.mmm
  const colonMatch = s.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1]);
    const secs = parseInt(colonMatch[2]);
    const msStr = colonMatch[3].padEnd(3, "0");
    const ms = parseInt(msStr);
    return mins * 60000 + secs * 1000 + ms;
  }

  // SS.mmm or S.mmm
  const secMatch = s.match(/^(\d+)\.(\d{1,3})$/);
  if (secMatch) {
    const secs = parseInt(secMatch[1]);
    const msStr = secMatch[2].padEnd(3, "0");
    const ms = parseInt(msStr);
    return secs * 1000 + ms;
  }

  return null;
}

/**
 * Format milliseconds as a lap time: "M:SS.mmm"
 */
export function formatLapTime(ms: number): string {
  if (ms < 0) return "";
  const totalSecs = Math.floor(ms / 1000);
  const millis = Math.round(ms % 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/**
 * Format milliseconds as a gap/interval: "+S.mmm", "+SS.mmm", or "+M:SS.mmm"
 */
export function formatGap(ms: number): string {
  if (ms <= 0) return "";
  const totalSecs = Math.floor(ms / 1000);
  const millis = Math.round(ms % 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) {
    return `+${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `+${secs}.${millis.toString().padStart(3, "0")}`;
}
