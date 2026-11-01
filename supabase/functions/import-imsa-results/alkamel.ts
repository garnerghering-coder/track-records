/**
 * Al Kamel timing-site helpers shared by import-imsa-results.
 *
 * The importer was written for https://imsa.results.alkamelcloud.com/ but every
 * Al Kamel results site uses the same layout:
 *
 *   Results/<YY_YYYY>/<NN_Event>/<NN_Series>/<YYYYMMDDHHMM_Session>/<NN_File>.<ext>
 *
 * These helpers keep the host- and series-specific parts in one place so the
 * importer can serve every series on the IMSA site (WeatherTech, Michelin Pilot
 * Challenge, VP Racing SportsCar Challenge, Porsche Carrera Cup NA, Lamborghini
 * Super Trofeo NA, Mustang Challenge, Mazda MX-5 Cup, ...) and other Al Kamel hosts.
 */

/** Hosts the importer may fetch from (the URL comes from an admin, but keep it scoped). */
const ALKAMEL_HOST_RE = /(^|\.)alkamel(cloud|systems)\.com$/i;

/**
 * Returns the site root ("https://host/") to resolve relative Results/... links
 * against, derived from the URL the admin pasted. Returns null for non-Al Kamel hosts.
 */
export function resolveAlKamelBaseUrl(inputUrl: string): string | null {
  try {
    const u = new URL(inputUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!ALKAMEL_HOST_RE.test(u.hostname)) return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/**
 * Normalises a series name or Al Kamel series folder name for comparison:
 * "03_Whelen Mazda MX-5 Cup presented by Michelin" -> "mazda mx 5 cup"
 * "05_Mustang Challenge North America"             -> "mustang challenge north america"
 * "01_IMSA WeatherTech SportsCar Championship"     -> "weathertech sportscar championship"
 */
export function normalizeSeriesLabel(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  s = s.toLowerCase()
    .replace(/^\s*\d*_/, "")                 // folder order prefix "03_" (or a bare "_")
    .replace(/\bpresented by\b.*$/, "")      // sponsor suffix
    .replace(/\bpres\.? by\b.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|imsa|whelen|welen|ford|fia)\b/g, " ") // title sponsors / sanctioning prefixes and typos seen in folder names
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/**
 * True when an Al Kamel series folder belongs to one of the given series names/aliases.
 * Short names (<= 5 chars, e.g. an alias like "WTSCC") must match the folder exactly;
 * longer names match when one normalised label contains the other.
 */
export function seriesFolderMatches(folder: string, seriesNames: string[]): boolean {
  const rawFolder = folder.replace(/^\s*\d*_/, "").toLowerCase().trim();
  const nf = normalizeSeriesLabel(folder);
  if (!rawFolder) return false;
  return seriesNames.some((name) => {
    const raw = name.toLowerCase().trim();
    if (!raw) return false;
    if (raw.length <= 5) return rawFolder === raw || nf === raw;
    // Legacy rule (kept for backward compatibility with existing IMSA imports)
    if (rawFolder.includes(raw) || raw.includes(rawFolder)) return true;
    const nn = normalizeSeriesLabel(name);
    if (!nn || !nf) return false;
    if (nf === nn) return true;
    // Containment only for meaningful labels, so e.g. a folder reduced to "cup" can't match everything.
    if (Math.min(nf.length, nn.length) < 6) return false;
    return nf.includes(nn) || nn.includes(nf);
  });
}

/** Extracts the series folder (segment after Results/<season>/<event>/) from a link. */
export function extractSeriesFolderName(urlPath: string): string {
  let decoded = urlPath;
  try { decoded = decodeURIComponent(urlPath); } catch { /* keep raw */ }
  const segments = decoded.split("/").filter(Boolean);
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].toLowerCase() === "results" && i + 3 < segments.length) {
      return segments[i + 3];
    }
  }
  return "";
}

function fileNameOf(link: string): string {
  let decoded = link;
  try { decoded = decodeURIComponent(link); } catch { /* keep raw */ }
  return (decoded.split("/").pop() || "").toLowerCase();
}

/**
 * True for a classification JSON the importer should consider:
 * "03_Results_Race 1_Official.JSON", "03_Results.JSON", "04_Results by Hour_Race_Unofficial.JSON".
 * Excludes "Results by Class" and "Results by Hour & Class" (duplicates of the same data).
 */
export function isResultsJsonLink(link: string): boolean {
  const name = fileNameOf(link);
  if (!name.endsWith(".json")) return false;
  if (!/^0[234]_results([\s_.]|$)/.test(name)) return false;
  if (/results\s+by\s+class/.test(name)) return false;
  if (/results\s+by\s+hour\s*(&|and)\s*class/.test(name)) return false;
  return true;
}

/**
 * Ranks results files of the same session folder so the most authoritative one wins:
 * 03_Results (classification) over 04/02, then Official > Provisional > (no mark) > Unofficial,
 * with "Amended"/"Revised" (and "Amended 2") re-issues ahead of the document they amend.
 */
export function resultsLinkRank(link: string): number {
  const name = fileNameOf(link);
  let rank = /^03_/.test(name) ? 100 : 0;
  if (/(^|[\s_])official/.test(name)) rank += 30;
  else if (/provisional/.test(name)) rank += 20;
  else if (/unofficial/.test(name)) rank += 10;
  else rank += 15;
  const amended = name.match(/(?:amended|revised)(?:\s*(\d+))?/);
  if (amended) rank += 5 + (amended[1] ? parseInt(amended[1], 10) : 1);
  return rank;
}

/**
 * Parses Al Kamel session_date ("22/01/2026 10:05", "31-07-2026 03:45", "31.07.2026")
 * to an ISO date. Start times are intentionally not used (unreliable across feeds).
 */
export function parseAlKamelSessionDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const datePart = raw.trim().split(/\s+/)[0];
  const m = datePart.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
