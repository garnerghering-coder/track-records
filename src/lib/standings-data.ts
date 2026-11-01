/**
 * Browser data layer for championship standings.
 *
 * `loadChampionship` fetches the season's precomputed table
 * (public/data/derived/standings/<seasonId>.json, written by
 * scripts/build-derived.mjs) and only falls back to computing it here from the
 * full results tables when that file is missing. All rules live in the pure
 * modules src/lib/standings.ts and src/lib/season-standings.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildChampionship, championshipFile, loadSeasonStandingsInput, type Championship, type SeasonStandingsInput } from "@/lib/season-standings";

export type { ChampEntry, Championship, SeasonStandingsInput, StandingsDriverMeta } from "@/lib/season-standings";

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

/** One season's raw points-bearing results (used by the PDF export and the fallback). */
export function fetchSeasonStandingsInput(seasonId: string): Promise<SeasonStandingsInput> {
  return loadSeasonStandingsInput(supabase, seasonId);
}

/** Computes the championship in the browser from the full results tables (slow: several MB). */
export async function computeChampionship(seasonId: string): Promise<Championship> {
  return buildChampionship(await fetchSeasonStandingsInput(seasonId));
}

async function fetchPrecomputed(seasonId: string): Promise<Championship | null> {
  try {
    const res = await fetch(`${BASE}${championshipFile(seasonId)}`);
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    const data = (await res.json()) as Championship;
    return data && Array.isArray(data.rounds) && data.drivers && data.teams ? data : null;
  } catch {
    return null;
  }
}

const champCache = new Map<string, Promise<Championship>>();

/** The season's championship: precomputed file first, client-side computation as fallback. */
export function loadChampionship(seasonId: string): Promise<Championship> {
  let p = champCache.get(seasonId);
  if (!p) {
    p = fetchPrecomputed(seasonId).then((c) => c ?? computeChampionship(seasonId));
    champCache.set(seasonId, p);
  }
  return p;
}
