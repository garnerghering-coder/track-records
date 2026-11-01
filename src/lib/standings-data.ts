/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loads one season's points-bearing results for the standings in
 * src/lib/standings.ts. Thin data layer: all rules live in the pure module.
 *
 * - Only published events, only parent sessions (hourly endurance snapshots
 *   are excluded), only race and qualifying sessions.
 * - Paginates: a season easily exceeds PostgREST's 1000-row response cap
 *   (2025 WeatherTech has 1040 race rows), which used to drop results silently.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  classFromExtra,
  classPositionFromRow,
  standingsKindForSessionType,
  type StandingsRow,
  type StandingsSession,
} from "@/lib/standings";

export interface StandingsDriverMeta {
  id: string;
  name: string;
  nationality: string | null;
}

export interface SeasonStandingsInput {
  sessions: StandingsSession[];
  rows: StandingsRow[];
  drivers: Map<string, StandingsDriverMeta>;
  teams: Map<string, string>;
}

const PAGE = 1000;

async function fetchAllPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchSeasonStandingsInput(seasonId: string): Promise<SeasonStandingsInput> {
  const empty: SeasonStandingsInput = { sessions: [], rows: [], drivers: new Map(), teams: new Map() };

  const { data: events } = await supabase
    .from("v2_events")
    .select("id, start_date, round_number")
    .eq("season_id", seasonId)
    .eq("status", "published" as any);
  if (!events?.length) return empty;
  const eventOrder = new Map(
    [...(events as any[])]
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "") || Number(a.round_number || 0) - Number(b.round_number || 0))
      .map((e, i) => [e.id, i] as const),
  );

  const sessionRows = (
    await Promise.all(
      chunk([...eventOrder.keys()], 100).map((ids) =>
        fetchAllPages<any>((from, to) =>
          supabase
            .from("v2_sessions")
            .select("id, event_id, name, session_type, parent_session_id, date, start_time, sort_order")
            .in("event_id", ids)
            .is("parent_session_id", null)
            .order("id")
            .range(from, to),
        ),
      ),
    )
  ).flat();

  const scoring = sessionRows
    .map((s) => ({ s, kind: standingsKindForSessionType(s.session_type) }))
    .filter((x) => x.kind && !x.s.parent_session_id)
    .sort(
      (a, b) =>
        (eventOrder.get(a.s.event_id) ?? 0) - (eventOrder.get(b.s.event_id) ?? 0) ||
        (a.s.date || "").localeCompare(b.s.date || "") ||
        (a.s.start_time || "").localeCompare(b.s.start_time || "") ||
        // qualifying before the race when no times are stored
        (a.kind === b.kind ? 0 : a.kind === "qualifying" ? -1 : 1) ||
        Number(a.s.sort_order || 0) - Number(b.s.sort_order || 0),
    );
  const sessions: StandingsSession[] = scoring.map(({ s, kind }, i) => ({
    id: s.id,
    kind: kind!,
    eventId: s.event_id,
    order: i,
    countsForWins: kind === "race" && !/sprint/i.test(s.name || "") && s.session_type !== "sprint_race",
  }));
  if (sessions.length === 0) return empty;

  const ids = sessions.map((s) => s.id);
  const fetchResults = (table: "v2_race_results" | "v2_qualifying_results") =>
    Promise.all(
      chunk(ids, 50).map((part) =>
        fetchAllPages<any>((from, to) =>
          supabase
            .from(table as any)
            .select(
              table === "v2_race_results"
                ? "id, session_id, car_number, driver_id, team_id, points, position, status, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name)"
                : "id, session_id, car_number, driver_id, team_id, points, position, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name)",
            )
            .in("session_id", part)
            .order("id")
            .range(from, to),
        ),
      ),
    ).then((r) => r.flat());
  const [race, qual] = await Promise.all([fetchResults("v2_race_results"), fetchResults("v2_qualifying_results")]);

  const drivers = new Map<string, StandingsDriverMeta>();
  const teams = new Map<string, string>();
  const rows: StandingsRow[] = [...race, ...qual].map((r: any) => {
    if (r.v2_drivers?.id) drivers.set(r.v2_drivers.id, { id: r.v2_drivers.id, name: r.v2_drivers.full_name, nationality: r.v2_drivers.nationality ?? null });
    if (r.v2_teams?.id) teams.set(r.v2_teams.id, r.v2_teams.full_name);
    return {
      sessionId: r.session_id,
      carNumber: r.car_number ?? null,
      driverId: r.driver_id ?? null,
      teamId: r.team_id ?? r.v2_teams?.id ?? null,
      points: r.points != null ? Number(r.points) : null,
      className: classFromExtra(r.extra_data),
      classPosition: classPositionFromRow(r.extra_data, r.position),
      status: r.status ?? null,
    };
  });
  return { sessions, rows, drivers, teams };
}
