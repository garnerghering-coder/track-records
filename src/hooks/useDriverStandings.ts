import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeDriverStandings } from "@/lib/standings";
import { fetchSeasonStandingsInput } from "@/lib/standings-data";

export interface StandingEntry {
  carNumber: string;
  driverIds: string[];
  driverNames: string[];
  teamName: string | null;
  teamId: string | null;
  totalPoints: number;
  position: number;
}

export interface StandingsSeason {
  seasonId: string;
  seriesId: string;
  seriesName: string;
  seriesAlias: string;
  year: number;
  isMulticlass: boolean;
  classes: { id: string; name: string }[];
}

export interface DriverStandingsResult {
  seasons: StandingsSeason[];
  selectedSeason: StandingsSeason | null;
  selectedClass: string | null;
  standings: StandingEntry[];
  driverPosition: number | null;
  driverPoints: number | null;
  totalEntries: number;
  loading: boolean;
  setSelectedSeasonId: (id: string) => void;
  setSelectedClass: (cls: string | null) => void;
}

/**
 * Hook that computes the drivers' championship standing for a driver across all
 * series/seasons they've scored in, from stored race and qualifying points.
 * Driver points follow IMSA's rules (see src/lib/standings.ts): each driver
 * earns their car's points, qualifying points go to every driver of the car,
 * a cross-entered driver scores only for their regular car, ties use countback.
 */
export function useDriverStandings(driverId: string | undefined): DriverStandingsResult {
  const [seasons, setSeasons] = useState<StandingsSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [totalCarsCount, setTotalCarsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.seasonId === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  );

  // Step 1: Discover which seasons this driver has scored points in
  useEffect(() => {
    if (!driverId) return;
    (async () => {
      setLoading(true);

      // Find all sessions where this driver has results
      const [{ data: raceRes }, { data: qualRes }, { data: pracRes }] = await Promise.all([
        supabase
          .from("v2_race_results" as any)
          .select("session_id, car_number")
          .eq("driver_id", driverId),
        supabase
          .from("v2_qualifying_results" as any)
          .select("session_id, car_number")
          .eq("driver_id", driverId),
        supabase
          .from("v2_practice_results" as any)
          .select("session_id, car_number")
          .eq("driver_id", driverId),
      ]);

      const allSessionIds = new Set<string>();
      const driverCarNumbers = new Map<string, Set<string>>(); // eventId -> car_numbers
      for (const r of [...(raceRes || []), ...(qualRes || []), ...(pracRes || [])] as any[]) {
        allSessionIds.add(r.session_id);
      }

      if (allSessionIds.size === 0) {
        setSeasons([]);
        setLoading(false);
        return;
      }

      // Get session -> event -> season mapping
      const sessionIdArr = [...allSessionIds];
      const sessionMap: Record<string, { eventId: string; seasonId: string }> = {};

      for (let i = 0; i < sessionIdArr.length; i += 200) {
        const chunk = sessionIdArr.slice(i, i + 200);
        const { data: sessions } = await supabase
          .from("v2_sessions")
          .select("id, event_id")
          .in("id", chunk);
        if (sessions) {
          for (const s of sessions) {
            sessionMap[s.id] = { eventId: s.event_id, seasonId: "" };
          }
        }
      }

      const eventIds = [...new Set(Object.values(sessionMap).map((s) => s.eventId))];
      const eventSeasonMap: Record<string, string> = {};

      for (let i = 0; i < eventIds.length; i += 200) {
        const chunk = eventIds.slice(i, i + 200);
        const { data: events } = await supabase
          .from("v2_events")
          .select("id, season_id")
          .in("id", chunk);
        if (events) {
          for (const e of events) {
            eventSeasonMap[e.id] = e.season_id;
          }
        }
      }

      // Update sessionMap with seasonId
      for (const [sid, val] of Object.entries(sessionMap)) {
        val.seasonId = eventSeasonMap[val.eventId] || "";
      }

      const seasonIds = [...new Set(Object.values(sessionMap).map((s) => s.seasonId).filter(Boolean))];

      // Fetch season details with series info + aliases
      const seasonDetails: StandingsSeason[] = [];
      for (let i = 0; i < seasonIds.length; i += 50) {
        const chunk = seasonIds.slice(i, i + 50);
        const { data: seasonsData } = await supabase
          .from("v2_seasons")
          .select("id, year, is_multiclass, series_id, v2_series(id, name, short_name)")
          .in("id", chunk);

        if (seasonsData) {
          // Fetch aliases for all series
          const seriesIds = [...new Set(seasonsData.map((s: any) => s.series_id))];
          const { data: aliases } = await supabase
            .from("v2_series_aliases" as any)
            .select("series_id, alias")
            .in("series_id", seriesIds)
            .order("created_at");

          const aliasMap: Record<string, string> = {};
          for (const a of (aliases || []) as any[]) {
            if (!aliasMap[a.series_id]) aliasMap[a.series_id] = a.alias;
          }

          // Fetch classes for multiclass seasons
          const multiclassIds = seasonsData.filter((s: any) => s.is_multiclass).map((s: any) => s.id);
          const classMap: Record<string, { id: string; name: string }[]> = {};
          if (multiclassIds.length > 0) {
            const { data: classes } = await supabase
              .from("v2_season_classes")
              .select("id, season_id, class_name, sort_order")
              .in("season_id", multiclassIds)
              .order("sort_order");
            for (const c of (classes || []) as any[]) {
              if (!classMap[c.season_id]) classMap[c.season_id] = [];
              classMap[c.season_id].push({ id: c.id, name: c.class_name });
            }
          }

          for (const s of seasonsData as any[]) {
            seasonDetails.push({
              seasonId: s.id,
              seriesId: s.series_id,
              seriesName: s.v2_series?.name || "",
              seriesAlias: aliasMap[s.series_id] || s.v2_series?.short_name || s.v2_series?.name || "",
              year: s.year,
              isMulticlass: s.is_multiclass,
              classes: classMap[s.id] || [],
            });
          }
        }
      }

      // Now check which seasons actually have points data for this driver's car numbers
      // We need to check all race/qual/practice results in those seasons for points
      const seasonsWithPoints: StandingsSeason[] = [];

      for (const season of seasonDetails) {
        // Get all event IDs for this season
        const { data: seasonEvents } = await supabase
          .from("v2_events")
          .select("id")
          .eq("season_id", season.seasonId);

        if (!seasonEvents || seasonEvents.length === 0) continue;

        const evtIds = seasonEvents.map((e) => e.id);

        // Get all sessions for these events
        const { data: seasonSessions } = await supabase
          .from("v2_sessions")
          .select("id")
          .in("event_id", evtIds);

        if (!seasonSessions || seasonSessions.length === 0) continue;

        const sessIds = seasonSessions.map((s) => s.id);

        // Check if any results in these sessions have points
        const { data: pointsCheck } = await supabase
          .from("v2_race_results" as any)
          .select("id")
          .in("session_id", sessIds)
          .not("points", "is", null)
          .gt("points", 0)
          .limit(1);

        if (pointsCheck && pointsCheck.length > 0) {
          seasonsWithPoints.push(season);
          continue;
        }

        // Also check qualifying
        const { data: qualPointsCheck } = await supabase
          .from("v2_qualifying_results" as any)
          .select("id")
          .in("session_id", sessIds)
          .not("points", "is", null)
          .gt("points", 0)
          .limit(1);

        if (qualPointsCheck && qualPointsCheck.length > 0) {
          seasonsWithPoints.push(season);
        }
      }

      // Sort by year desc, then series name
      seasonsWithPoints.sort((a, b) => b.year - a.year || a.seriesName.localeCompare(b.seriesName));
      setSeasons(seasonsWithPoints);

      // Default to most recent
      if (seasonsWithPoints.length > 0 && !selectedSeasonId) {
        setSelectedSeasonId(seasonsWithPoints[0].seasonId);
        if (seasonsWithPoints[0].isMulticlass && seasonsWithPoints[0].classes.length > 0) {
          // Try to find which class this driver belongs to
          // We'll set this after standings are computed
        }
      }

      setLoading(false);
    })();
  }, [driverId]);

  // Step 2: Drivers' standings for the selected season (rules in src/lib/standings.ts)
  useEffect(() => {
    if (!selectedSeasonId || !driverId) return;
    let cancelled = false;
    (async () => {
      try {
        const input = await fetchSeasonStandingsInput(selectedSeasonId);
        const all = computeDriverStandings(input.sessions, input.rows);
        if (cancelled) return;

        // The class this driver scored most in (a driver can score in two classes)
        const mine = all.filter((d) => d.driverId === driverId).sort((a, b) => b.totalPoints - a.totalPoints);
        const season = seasons.find((s) => s.seasonId === selectedSeasonId);
        let cls = selectedClass;
        if (season?.isMulticlass && (!cls || !all.some((d) => d.className === cls))) {
          cls = mine[0]?.className || null;
          if (cls && cls !== selectedClass) setSelectedClass(cls);
        }
        const inClass = season?.isMulticlass && cls ? all.filter((d) => d.className === cls) : all;

        const standingsResult: StandingEntry[] = inClass.map((d) => ({
          carNumber: d.carNumbers[0] || "",
          driverIds: [d.driverId],
          driverNames: [input.drivers.get(d.driverId)?.name || ""].filter(Boolean),
          teamName: d.teamId ? input.teams.get(d.teamId) || null : null,
          teamId: d.teamId,
          totalPoints: d.totalPoints,
          position: d.position,
        }));
        setStandings(standingsResult);
        setTotalCarsCount(standingsResult.length);
      } catch (err) {
        console.error("Driver standings failed", err);
        if (!cancelled) setStandings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId, selectedClass, driverId, seasons]);

  // Computed values for this driver
  const driverEntry = useMemo(() => {
    return standings.find((s) => s.driverIds.includes(driverId || ""));
  }, [standings, driverId]);

  return {
    seasons,
    selectedSeason,
    selectedClass,
    standings,
    driverPosition: driverEntry?.position ?? null,
    driverPoints: driverEntry?.totalPoints ?? null,
    totalEntries: totalCarsCount > 0 ? totalCarsCount : standings.length,
    loading,
    setSelectedSeasonId: (id: string) => {
      setSelectedSeasonId(id);
      setSelectedClass(null); // Reset class when switching seasons
    },
    setSelectedClass,
  };
}
