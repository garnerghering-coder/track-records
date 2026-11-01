/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The record book in the browser. The book itself (types, builder, tallies,
 * compact per-entity records) lives in src/lib/record-book.ts, shared with the
 * build. Record pages load precomputed files from public/data/derived/records/
 * (written by scripts/build-derived.mjs):
 *
 *   useRecord("drivers" | "teams" | "cars", id) → that entity's slice of the book
 *   useRecords("drivers", [a, b])               → several merged (Compare)
 *   useRecordIndex()                            → the directory (/drivers, /teams, /cars)
 *
 * When a file is missing (e.g. a dev build before build-derived ran) they fall
 * back to building the whole book here from the full results tables.
 */
import { supabase } from "@/integrations/supabase/client";
import { classRank } from "@/lib/insights";
import { getCountryCode, COUNTRIES } from "@/lib/countries";
import {
  buildRecordBook,
  buildRecordIndex,
  decodeRecordIndex,
  expandRecordSlice,
  loadRecordTables,
  mergeRecordBooks,
  recordFile,
  recordIndexFile,
  sliceRecordBook,
  isWin,
  type CarRow,
  type Entry,
  type Fingerprint,
  type RecordBook,
  type RecordIndex,
  type RecordIndexWire,
  type RecordKind,
  type RecordSlice,
} from "@/lib/record-book";
import { cleanName, useLoad } from "@/site/data";

export * from "@/lib/record-book";

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

async function fetchJson<T>(path: string, ok: (x: any) => boolean): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    const data = await res.json();
    return ok(data) ? (data as T) : null;
  } catch {
    return null;
  }
}

/* ── Full book (fallback) ──────────────────────────────────────── */

let fullBook: Promise<RecordBook> | null = null;
/** Builds the whole book from the full results tables (~15 MB): fallback only. */
export const loadRecordBook = () => (fullBook ??= loadRecordTables(supabase).then(buildRecordBook));
export const useRecordBook = () => useLoad("record-book", loadRecordBook).data;

/* ── Precomputed records ───────────────────────────────────────── */

const sliceCache = new Map<string, Promise<RecordBook>>();
export function loadRecord(kind: RecordKind, id: string): Promise<RecordBook> {
  const k = `${kind}:${id}`;
  let p = sliceCache.get(k);
  if (!p) {
    p = fetchJson<RecordSlice>(recordFile(kind, id), (x) => x && x.v === 1 && Array.isArray(x.entries)).then(async (s) =>
      s ? expandRecordSlice(s) : expandRecordSlice(sliceRecordBook(await loadRecordBook(), kind, id)),
    );
    sliceCache.set(k, p);
  }
  return p;
}
export const useRecord = (kind: RecordKind, id: string) => useLoad(id ? `record:${kind}:${id}` : null, () => loadRecord(kind, id)).data;

/** Several records merged into one book (Compare). */
export function useRecords(kind: RecordKind, ids: string[]) {
  const list = ids.filter(Boolean);
  const key = list.length ? `records:${kind}:${list.join(",")}` : "records:none";
  return useLoad(key, () => Promise.all(list.map((id) => loadRecord(kind, id))).then(mergeRecordBooks)).data;
}

let indexP: Promise<RecordIndex> | null = null;
export const loadRecordIndex = () =>
  (indexP ??= fetchJson<RecordIndexWire>(recordIndexFile(), (x) => x && x.v === 2 && Array.isArray(x.drivers)).then(async (w) =>
    decodeRecordIndex(w ?? buildRecordIndex(await loadRecordBook())),
  ));
export const useRecordIndex = () => useLoad("record-index", loadRecordIndex).data;

/** Group entries by season (newest first), each with its own tally. */
export function bySeason(list: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of list) {
    if (!m.has(e.seasonId)) m.set(e.seasonId, []);
    m.get(e.seasonId)!.push(e);
  }
  return [...m.entries()]
    .map(([seasonId, rows]) => ({ seasonId, year: rows[0].year, seriesId: rows[0].seriesId, seriesName: rows[0].seriesName, seriesShort: rows[0].seriesShort, rows }))
    .sort((a, b) => b.year - a.year || a.seriesShort.localeCompare(b.seriesShort));
}

/** Group a list of car entries by race session (newest first). */
export function byRace(list: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of list) {
    if (!m.has(e.sessionId)) m.set(e.sessionId, []);
    m.get(e.sessionId)!.push(e);
  }
  return [...m.values()]
    .map((rows) => rows.sort((a, b) => classRank(a.className) - classRank(b.className) || (a.pic ?? 99) - (b.pic ?? 99)))
    .sort((a, b) => b[0].raceDate.localeCompare(a[0].raceDate) || b[0].sessionName.localeCompare(a[0].sessionName));
}

/** Co-drivers who shared a car with `driverId`. */
export function teammatesOf(driverId: string, list: Entry[]) {
  const m = new Map<string, { id: string; races: Entry[] }>();
  for (const e of list)
    for (const d of e.driverIds) {
      if (d === driverId) continue;
      if (!m.has(d)) m.set(d, { id: d, races: [] });
      m.get(d)!.races.push(e);
    }
  return [...m.values()].sort((a, b) => b.races.length - a.races.length || b.races[b.races.length - 1].raceDate.localeCompare(a.races[a.races.length - 1].raceDate));
}

/** Count items by key, most frequent first (ties: most recent). */
export function countBy<T>(list: Entry[], key: (e: Entry) => T | null | undefined) {
  const m = new Map<T, { key: T; n: number; last: Entry; wins: number }>();
  for (const e of list) {
    const k = key(e);
    if (k == null || (k as any) === "") continue;
    const cur = m.get(k);
    if (cur) {
      cur.n++;
      cur.last = e;
      if (isWin(e)) cur.wins++;
    } else m.set(k, { key: k, n: 1, last: e, wins: isWin(e) ? 1 : 0 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last.raceDate.localeCompare(a.last.raceDate));
}

/* ── Formatting ───────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${dd}, ${y}`;
};
export const fmtDayShort = (d: string) => {
  if (!d) return "";
  const [, m, dd] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${dd}`;
};
export const stripYear = (name: string) => name.replace(/^\d{4}\s+/, "");
export const raceTitle = (e: Entry) => stripYear(e.eventName) + (e.multiRace ? ` · ${e.sessionName}` : "");
export const carLabel = (c?: CarRow | null) => (c ? [c.manufacturer, c.model_name].map((s) => (s || "").trim()).filter(Boolean).join(" ") : "");
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const resultLabel = (e: Entry) => (e.status === "dns" ? "DNS" : e.status === "dnf" ? "DNF" : e.pic != null ? `P${e.pic}` : e.position != null ? `P${e.position}` : "—");

export function age(dob?: string | null) {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00Z");
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
  return Number.isFinite(a) && a > 10 && a < 100 ? a : null;
}

/** "Dallas, United States" → { code: "US", country: "United States", place: "Dallas" } */
export function origin(nationality?: string | null) {
  const code = getCountryCode(nationality);
  const country = code ? COUNTRIES.find((c) => c.code === code)?.name ?? null : null;
  const raw = (nationality || "").trim();
  const place = raw.includes(",") ? raw.split(",").slice(0, -1).join(",").trim() : null;
  return { code, country: country === "United States of America" ? "United States" : country, place: place || null };
}

/** Sort key for a person: last name, then first. */
export const personSortKey = (full: string) => {
  const parts = cleanName(full).split(/\s+/);
  return `${parts.slice(1).join(" ") || parts[0]} ${parts[0]}`.toLocaleLowerCase();
};

/* ── Driver shape ─────────────────────────────────────────────── */

export interface ShapeAxis {
  key: "dps" | "adps" | "dcs" | "das" | "dws";
  label: string;
  short: string;
  value: number | null;
  band: string | null;
  about: string;
  needs: string;
}

export function shapeAxes(fp?: Fingerprint | null): ShapeAxis[] {
  return [
    { key: "dps", label: "Pace", short: "Pace", value: fp?.dps ?? null, band: fp?.dps_band ?? null, about: "Where they finish within their class, averaged over events (race, qualifying and practice weighted).", needs: "5 events" },
    { key: "adps", label: "Class-adjusted pace", short: "Adj. pace", value: fp?.adps ?? null, band: fp?.adps_band ?? null, about: "Pace scaled by how hard the class is to win: a GTP podium weighs more than a GS one.", needs: "5 events in a rated class" },
    { key: "dcs", label: "Consistency", short: "Consistency", value: fp?.dcs ?? null, band: fp?.dcs_band ?? null, about: "How tightly their results cluster around their own level. High means dependable.", needs: "8 events" },
    { key: "das", label: "Adaptability", short: "Adaptability", value: fp?.das ?? null, band: fp?.das_band ?? null, about: "Whether they perform equally on fast and twisty, flat and hilly, light- and heavy-braking circuits.", needs: "5 events across varied circuits" },
    { key: "dws", label: "Weather", short: "Weather", value: fp?.dws ?? null, band: fp?.dws_band ?? null, about: "Wet results against dry ones. Above 50 means they gain in the rain.", needs: "2 wet and 4 dry events" },
  ];
}
