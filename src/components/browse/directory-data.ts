/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface TeamSeasonCarLink {
  teamId: string;
  carId: string;
  year: number | null;
  seriesId: string | null;
  seriesShort: string | null;
}

/**
 * Every team ↔ car ↔ season link (small table). Used to give the Teams and Cars
 * directories series / car / season context without scanning results.
 */
export async function fetchTeamSeasonCars(): Promise<TeamSeasonCarLink[]> {
  const { data } = await supabase
    .from("v2_team_season_cars")
    .select("team_id, car_id, v2_seasons(year, v2_series(id, name, short_name))")
    .limit(5000);
  return ((data || []) as any[]).map((r) => ({
    teamId: r.team_id,
    carId: r.car_id,
    year: r.v2_seasons?.year ?? null,
    seriesId: r.v2_seasons?.v2_series?.id ?? null,
    seriesShort: r.v2_seasons?.v2_series?.short_name || r.v2_seasons?.v2_series?.name || null,
  }));
}

export const uniqSorted = <T,>(xs: (T | null | undefined)[], cmp?: (a: T, b: T) => number) =>
  [...new Set(xs.filter((x): x is T => x != null))].sort(cmp);
