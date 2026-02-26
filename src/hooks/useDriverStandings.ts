import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

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
 * Hook that computes championship standings for a driver across all series/seasons
 * they've participated in, based on points from race, qualifying, and practice results.
 * 
 * For endurance racing, all drivers sharing a car_number in a season get the same points total.
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
          let classMap: Record<string, { id: string; name: string }[]> = {};
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

  // Step 2: Compute standings for the selected season
  useEffect(() => {
    if (!selectedSeasonId || !driverId) return;
    (async () => {
      // Get all events for this season
      const { data: seasonEvents } = await supabase
        .from("v2_events")
        .select("id")
        .eq("season_id", selectedSeasonId);

      if (!seasonEvents || seasonEvents.length === 0) {
        setStandings([]);
        return;
      }

      const evtIds = seasonEvents.map((e) => e.id);

      // Get all sessions (excluding hour sub-sessions for endurance)
      const { data: sessions } = await supabase
        .from("v2_sessions")
        .select("id, parent_session_id")
        .in("event_id", evtIds);

      if (!sessions || sessions.length === 0) {
        setStandings([]);
        return;
      }

      // Only use parent-level sessions (no sub-sessions)
      const sessIds = sessions.filter((s) => !s.parent_session_id).map((s) => s.id);

      // Fetch all results with points
      const [{ data: raceResults }, { data: qualResults }, { data: pracResults }] = await Promise.all([
        supabase
          .from("v2_race_results" as any)
          .select("car_number, driver_id, points, extra_data, session_id, v2_drivers(full_name), v2_teams(id, full_name)")
          .in("session_id", sessIds),
        supabase
          .from("v2_qualifying_results" as any)
          .select("car_number, driver_id, points, extra_data, session_id, v2_drivers(full_name), v2_teams(id, full_name)")
          .in("session_id", sessIds),
        supabase
          .from("v2_practice_results" as any)
          .select("car_number, driver_id, points, extra_data, session_id, v2_drivers(full_name), v2_teams(id, full_name)")
          .in("session_id", sessIds),
      ]);

      const allResults = [
        ...((raceResults || []) as any[]),
        ...((qualResults || []) as any[]),
        ...((pracResults || []) as any[]),
      ];

      // Group by car_number, summing points
      const carMap = new Map<
        string,
        {
          carNumber: string;
          driverIds: Set<string>;
          driverNames: Set<string>;
          teamName: string | null;
          teamId: string | null;
          totalPoints: number;
          className: string | null;
        }
      >();

      // Track which (car_number, session_id) combos we've already counted points for
      const countedPoints = new Set<string>();

      for (const r of allResults) {
        if (!r.car_number) continue;
        const pts = r.points != null ? Number(r.points) : 0;
        const className = r.extra_data?.Class || r.extra_data?.class || null;

        if (!carMap.has(r.car_number)) {
          carMap.set(r.car_number, {
            carNumber: r.car_number,
            driverIds: new Set(),
            driverNames: new Set(),
            teamName: r.v2_teams?.full_name || null,
            teamId: r.v2_teams?.id || null,
            totalPoints: 0,
            className,
          });
        }

        const entry = carMap.get(r.car_number)!;

        // Only count points once per car per session (endurance cars have multiple driver rows)
        const pointsKey = `${r.car_number}|${r.session_id}`;
        if (pts > 0 && !countedPoints.has(pointsKey)) {
          entry.totalPoints += pts;
          countedPoints.add(pointsKey);
        }

        if (r.driver_id) entry.driverIds.add(r.driver_id);
        if (r.v2_drivers?.full_name) entry.driverNames.add(r.v2_drivers.full_name);
        if (!entry.teamName && r.v2_teams?.full_name) {
          entry.teamName = r.v2_teams.full_name;
          entry.teamId = r.v2_teams.id;
        }
        if (!entry.className && className) entry.className = className;
      }

      // Filter by class if multiclass and class selected
      let entries = [...carMap.values()];
      
      // Auto-detect which class the driver belongs to (for multiclass)
      const season = seasons.find((s) => s.seasonId === selectedSeasonId);
      if (season?.isMulticlass) {
        // Find which class this driver's car is in
        const driverCar = entries.find((e) => e.driverIds.has(driverId));
        if (driverCar?.className && !selectedClass) {
          setSelectedClass(driverCar.className);
        }
        
        const filterClass = selectedClass || driverCar?.className;
        if (filterClass) {
          entries = entries.filter((e) => e.className === filterClass);
        }
      }

      // Count total unique cars (including those with 0 points) for the denominator
      const totalCarsInSeason = [...carMap.values()].length;

      // Filter to only entries with points > 0 for ranking
      entries = entries.filter((e) => e.totalPoints > 0);

      // Sort by total points desc
      entries.sort((a, b) => b.totalPoints - a.totalPoints);

      // Assign positions
      const standingsResult: StandingEntry[] = entries.map((e, i) => ({
        carNumber: e.carNumber,
        driverIds: [...e.driverIds],
        driverNames: [...e.driverNames],
        teamName: e.teamName,
        teamId: e.teamId,
        totalPoints: e.totalPoints,
        position: i + 1,
      }));

      setStandings(standingsResult);
      setTotalCarsCount(totalCarsInSeason);
    })();
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
