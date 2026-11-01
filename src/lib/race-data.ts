/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { sortClasses } from "@/lib/classes";

/**
 * For each event, pick the session whose classification is "the result":
 * the last race session (by sort order), and for endurance races the last
 * published sub-session (final hour), which carries the final classification.
 */
export async function resolveFinalRaceSessions(eventIds: string[]): Promise<Record<string, string>> {
  if (eventIds.length === 0) return {};
  const { data: races } = await supabase
    .from("v2_sessions")
    .select("id, event_id, session_type, sort_order, date")
    .in("event_id", eventIds)
    .in("session_type", ["race", "endurance_race", "sprint_race"] as any)
    .eq("status", "published" as any)
    .is("parent_session_id", null);

  const byEvent: Record<string, any> = {};
  for (const r of (races || []) as any[]) {
    const cur = byEvent[r.event_id];
    if (!cur || (r.sort_order ?? 0) > (cur.sort_order ?? 0)) byEvent[r.event_id] = r;
  }

  const endurance = Object.values(byEvent).filter((r: any) => r.session_type === "endurance_race").map((r: any) => r.id);
  const lastChild: Record<string, string> = {};
  if (endurance.length) {
    const { data: kids } = await supabase
      .from("v2_sessions")
      .select("id, parent_session_id, sort_order")
      .in("parent_session_id", endurance)
      .eq("status", "published" as any)
      .order("sort_order", { ascending: false });
    for (const k of (kids || []) as any[]) if (!lastChild[k.parent_session_id]) lastChild[k.parent_session_id] = k.id;
  }

  const out: Record<string, string> = {};
  for (const [eventId, r] of Object.entries(byEvent)) out[eventId] = lastChild[(r as any).id] || (r as any).id;
  return out;
}

export interface ClassWinner {
  className: string | null;
  /** Position within class (or overall position for single-class events) */
  classPosition: number;
  carNumber: string | null;
  position: number;
  drivers: { id: string; name: string; nationality?: string | null }[];
  team?: { id: string; name: string } | null;
  car?: { id: string; name: string } | null;
}

/**
 * Top `depth` finishers of every class (or overall, for single-class events), per event.
 * Sorted by class order, then class position.
 */
export async function fetchClassWinners(eventIds: string[], depth = 1): Promise<Record<string, ClassWinner[]>> {
  const sessions = await resolveFinalRaceSessions(eventIds);
  const sessionIds = Object.values(sessions);
  if (!sessionIds.length) return {};
  const sessionToEvent = Object.fromEntries(Object.entries(sessions).map(([e, s]) => [s, e]));

  const { data } = await supabase
    .from("v2_race_results" as any)
    .select("session_id, position, car_number, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name), v2_cars(id, model_name)")
    .in("session_id", sessionIds)
    .or(`position.lte.${depth},extra_data->>PIC.in.(${Array.from({ length: depth }, (_, i) => i + 1).join(",")})`)
    .order("position");

  const out: Record<string, Record<string, ClassWinner>> = {};
  for (const r of (data || []) as any[]) {
    const ev = sessionToEvent[r.session_id];
    const cls: string | null = r.extra_data?.Class ?? null;
    const pic = Number(r.extra_data?.PIC);
    // Multi-class rows: rank by class position. Single-class rows: overall position.
    const rank = cls ? pic : r.position;
    if (!(rank >= 1 && rank <= depth)) continue;
    const key = `${cls ?? "_"}|${r.car_number ?? ""}`;
    out[ev] ??= {};
    out[ev][key] ??= {
      className: cls,
      classPosition: rank,
      carNumber: r.car_number,
      position: r.position,
      drivers: [],
      team: r.v2_teams ? { id: r.v2_teams.id, name: r.v2_teams.full_name } : null,
      car: r.v2_cars ? { id: r.v2_cars.id, name: r.v2_cars.model_name } : null,
    };
    if (r.v2_drivers && !out[ev][key].drivers.some((d) => d.id === r.v2_drivers.id))
      out[ev][key].drivers.push({ id: r.v2_drivers.id, name: r.v2_drivers.full_name, nationality: r.v2_drivers.nationality });
  }

  const result: Record<string, ClassWinner[]> = {};
  for (const [ev, map] of Object.entries(out)) {
    result[ev] = Object.values(map).sort((a, b) =>
      (a.className && b.className ? sortClasses(a.className, b.className) : 0) || a.classPosition - b.classPosition,
    );
  }
  return result;
}

/** Map of class name → color for a set of seasons (from v2_season_classes). */
export async function fetchSeasonClassColors(seasonIds: string[]): Promise<Record<string, Record<string, string>>> {
  if (!seasonIds.length) return {};
  const { data } = await supabase.from("v2_season_classes").select("season_id, class_name, color").in("season_id", seasonIds);
  const out: Record<string, Record<string, string>> = {};
  for (const r of (data || []) as any[]) {
    if (!r.color) continue;
    out[r.season_id] ??= {};
    out[r.season_id][r.class_name] = r.color;
  }
  return out;
}

/** "Bobby Gossett" → "B. Gossett" */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}
