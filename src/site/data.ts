/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EventDigest } from "@/lib/insights";
import { loadChampionship } from "@/lib/standings-data";

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

let digestsP: Promise<Record<string, EventDigest>> | null = null;
export function loadDigests() {
  return (digestsP ??= fetch(`${BASE}derived/digests.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));
}

const digestP = new Map<string, Promise<EventDigest | undefined>>();
/** One event's full digest (insights, podiums, laps led), with the light list as fallback. */
export function loadDigest(eventId: string) {
  let p = digestP.get(eventId);
  if (!p) {
    p = fetch(`${BASE}derived/digests/${encodeURIComponent(eventId)}.json`)
      .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? (r.json() as Promise<EventDigest>) : null))
      .catch(() => null)
      .then(async (d) => d ?? (await loadDigests())[eventId]);
    digestP.set(eventId, p);
  }
  return p;
}
export const useDigest = (eventId: string | null | undefined) => useLoad(eventId ? `digest:${eventId}` : null, () => loadDigest(eventId!));

/** Every event's light digest (winners, classes, stats): for lists. */
export function useDigests() {
  const [d, setD] = useState<Record<string, EventDigest> | null>(null);
  useEffect(() => {
    loadDigests().then(setD);
  }, []);
  return d;
}

/** Generic cached async loader keyed by string. */
const cache = new Map<string, Promise<any>>();
export function useLoad<T>(key: string | null, fn: () => Promise<T>): { data: T | undefined; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; data: T | undefined }>({ key: null, data: undefined });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    if (!cache.has(key)) cache.set(key, fn());
    cache.get(key)!.then((data) => alive && setState({ key, data }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: state.key === key ? state.data : undefined, loading: !!key && state.key !== key };
}

export interface EventLite {
  id: string;
  name: string;
  short_name?: string | null;
  start_date: string | null;
  end_date: string | null;
  round_number?: number | null;
  season_id: string;
  circuit_id: string | null;
  layout_id?: string | null;
  year: number | null;
  series: { id: string; name: string; short_name: string | null } | null;
  circuit: { id: string; name: string; country: string | null; location?: string | null } | null;
}

export async function fetchEvents(): Promise<EventLite[]> {
  const { data } = await supabase
    .from("v2_events")
    .select("id, name, short_name, start_date, end_date, round_number, season_id, circuit_id, layout_id, v2_seasons(year, v2_series(id, name, short_name)), v2_circuits(id, name, country, location)")
    .eq("status", "published" as never)
    .order("start_date", { ascending: false });
  return ((data || []) as any[]).map((e) => ({
    id: e.id,
    name: e.name,
    short_name: e.short_name,
    start_date: e.start_date,
    end_date: e.end_date,
    round_number: e.round_number,
    season_id: e.season_id,
    circuit_id: e.circuit_id,
    layout_id: e.layout_id,
    year: e.v2_seasons?.year ?? null,
    series: e.v2_seasons?.v2_series ?? null,
    circuit: e.v2_circuits ?? null,
  }));
}
export const useEvents = () => useLoad("events", fetchEvents).data;

export async function fetchNameMaps() {
  const [d, t, c] = await Promise.all([
    supabase.from("v2_drivers").select("id, full_name, nationality"),
    supabase.from("v2_teams").select("id, full_name, short_name"),
    supabase.from("v2_cars").select("id, model_name, manufacturer"),
  ]);
  return {
    drivers: Object.fromEntries(((d.data || []) as any[]).map((x) => [x.id, x])) as Record<string, { id: string; full_name: string; nationality: string | null }>,
    teams: Object.fromEntries(((t.data || []) as any[]).map((x) => [x.id, x])) as Record<string, { id: string; full_name: string; short_name: string | null }>,
    cars: Object.fromEntries(((c.data || []) as any[]).map((x) => [x.id, x])) as Record<string, { id: string; model_name: string; manufacturer: string | null }>,
  };
}
export const useNames = () => useLoad("names", fetchNameMaps).data;

export async function fetchLayouts() {
  const { data } = await supabase.from("v2_circuit_layouts").select("*");
  return (data || []) as any[];
}
export const useLayouts = () => useLoad("layouts", fetchLayouts).data;

export function layoutFor(ev: Pick<EventLite, "layout_id" | "circuit_id">, layouts: any[] | undefined) {
  if (!layouts) return undefined;
  return (
    layouts.find((l) => l.id === ev.layout_id) ||
    layouts.filter((l) => l.circuit_id === ev.circuit_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
  );
}

/** "Bobby Gossett" → "B. Gossett"; strips rookie "(R)" suffix */
export function shortName(full?: string | null) {
  if (!full) return "";
  const clean = full.replace(/\s*\(R\)\s*$/i, "").trim();
  const parts = clean.split(/\s+/);
  return parts.length < 2 ? clean : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}
export const cleanName = (full?: string | null) => (full || "").replace(/\s*\(R\)\s*$/i, "").trim();
export const isRookie = (full?: string | null) => /\(R\)\s*$/i.test(full || "");
const PARTICLES = new Set(["van", "von", "der", "den", "de", "da", "di", "dos", "das", "du", "del", "della", "le", "la", "st", "st.", "ter", "ten", "al", "bin", "mac"]);
/**
 * Surname for compact labels: the last word, plus any name particles before it
 * ("Sting Ray Robb" → "Robb", "Juan Pablo Montoya" → "Montoya",
 * "Giedo van der Garde" → "van der Garde", "Kevin Estre" → "Estre").
 */
export const lastName = (full?: string | null) => {
  const parts = cleanName(full).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  let i = parts.length - 1;
  // generational suffixes stay with the surname ("Ricky Stenhouse Jr." → "Stenhouse Jr.")
  if (i > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[i])) i--;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
};

/* ── Championships ────────────────────────────────────────────── */

export interface SeasonLite {
  id: string;
  year: number;
  series: { id: string; name: string; short_name: string | null };
  eventCount: number;
}

export async function fetchSeasons(): Promise<SeasonLite[]> {
  const { data } = await supabase.from("v2_seasons").select("id, year, v2_series(id, name, short_name), v2_events(id, status)");
  return ((data || []) as any[])
    .map((s) => ({ id: s.id, year: s.year, series: s.v2_series, eventCount: (s.v2_events || []).filter((e: any) => e.status === "published").length }))
    .filter((s) => s.series)
    .sort((a, b) => b.year - a.year || a.series.name.localeCompare(b.series.name));
}
export const useSeasons = () => useLoad("seasons", fetchSeasons).data;

export interface SeasonStandingRow {
  key: string;
  driverId: string;
  className: string;
  carNumbers: string[];
  teamId: string | null;
  totalPoints: number;
  position: number;
  wins: number;
  podiums: number;
  name: string;
  nationality: string | null;
  /** Cumulative points after each round. */
  cumulative: number[];
}

export interface SeasonStandings {
  byClass: { className: string; color?: string | null; rows: SeasonStandingRow[] }[];
  rounds: number;
}

let leadersP: Promise<Record<string, SeasonStandings>> | null = null;
/** The top two of each class (precomputed for every season), falling back to the season's standings. */
export async function fetchSeasonLeaders(seasonId: string): Promise<SeasonStandings> {
  leadersP ??= fetch(`${BASE}derived/standings/leaders.json`)
    .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : {}))
    .catch(() => ({}));
  const all = await leadersP;
  return all[seasonId] ?? fetchSeasonStandings(seasonId);
}
export const useSeasonLeaders = (seasonId: string | null | undefined) =>
  useLoad(seasonId ? `leaders:${seasonId}` : null, () => fetchSeasonLeaders(seasonId!)).data;

/** Drivers' standings per class, from the season's (precomputed) championship. */
export async function fetchSeasonStandings(seasonId: string): Promise<SeasonStandings> {
  const ch = await loadChampionship(seasonId);
  return {
    rounds: ch.rounds.length,
    byClass: Object.entries(ch.drivers).map(([className, list]) => ({
      className,
      rows: list.map((e) => ({
        key: e.key,
        driverId: e.driverIds[0],
        className,
        carNumbers: e.carNumbers,
        teamId: e.teamId,
        totalPoints: e.totalPoints,
        position: e.position,
        wins: e.wins,
        podiums: e.podiums,
        name: e.name,
        nationality: e.nationality,
        cumulative: e.cumulative,
      })),
    })),
  };
}
export const useSeasonStandings = (seasonId: string | null | undefined) =>
  useLoad(seasonId ? `standings:${seasonId}` : null, () => fetchSeasonStandings(seasonId!)).data;
