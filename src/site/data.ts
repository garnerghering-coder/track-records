/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EventDigest } from "@/lib/insights";
import { computeDriverStandings, type DriverStanding } from "@/lib/standings";
import { fetchSeasonStandingsInput } from "@/lib/standings-data";

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

let digestsP: Promise<Record<string, EventDigest>> | null = null;
export function loadDigests() {
  return (digestsP ??= fetch(`${BASE}derived/digests.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));
}

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
export const lastName = (full?: string | null) => cleanName(full).split(/\s+/).slice(1).join(" ") || cleanName(full);

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

export interface SeasonStandings {
  byClass: { className: string; rows: (DriverStanding & { name: string; nationality: string | null; cumulative: number[] })[] }[];
  rounds: number;
}

export async function fetchSeasonStandings(seasonId: string): Promise<SeasonStandings> {
  const input = await fetchSeasonStandingsInput(seasonId);
  const standings = computeDriverStandings(input.sessions, input.rows);
  const order = [...new Set(input.sessions.map((s) => s.eventId))];
  const sessionEvent = new Map(input.sessions.map((s) => [s.id, s.eventId]));
  const byClass = new Map<string, SeasonStandings["byClass"][number]["rows"]>();
  for (const s of standings) {
    const meta = input.drivers.get(s.driverId);
    const perEvent = order.map((ev) => s.results.filter((r) => sessionEvent.get(r.sessionId) === ev).reduce((n, r) => n + r.points, 0));
    let acc = 0;
    const cumulative = perEvent.map((p) => (acc += p));
    const row = { ...s, name: meta?.name || "Unknown", nationality: meta?.nationality ?? null, cumulative };
    if (!byClass.has(s.className)) byClass.set(s.className, []);
    byClass.get(s.className)!.push(row);
  }
  return {
    rounds: order.length,
    byClass: [...byClass.entries()].map(([className, rows]) => ({ className, rows: rows.sort((a, b) => a.position - b.position) })),
  };
}
export const useSeasonStandings = (seasonId: string | null | undefined) =>
  useLoad(seasonId ? `standings:${seasonId}` : null, () => fetchSeasonStandings(seasonId!)).data;
