import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PodiumEntry } from "@/components/EventCard";

/**
 * Fetches top-3 podium results for a list of event IDs.
 * Handles endurance races by using the last sub-session.
 */
export function useEventPodiums(eventIds: string[]) {
  const [podiums, setPodiums] = useState<Record<string, PodiumEntry[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (eventIds.length === 0) {
      setPodiums({});
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);

      const { data: raceSessions } = await supabase
        .from("v2_sessions")
        .select("id, event_id, session_type, parent_session_id")
        .in("event_id", eventIds)
        .in("session_type", ["race", "endurance_race", "sprint_race"] as any)
        .eq("status", "published" as any)
        .is("parent_session_id", null);

      if (cancelled) return;

      if (!raceSessions || raceSessions.length === 0) {
        setPodiums({});
        setLoading(false);
        return;
      }

      // For endurance races, find last sub-session
      const enduranceParentIds = raceSessions
        .filter((rs) => rs.session_type === "endurance_race")
        .map((rs) => rs.id);

      const lastHourSessionMap: Record<string, string> = {};

      if (enduranceParentIds.length > 0) {
        const { data: childSessions } = await supabase
          .from("v2_sessions")
          .select("id, event_id, parent_session_id, sort_order")
          .in("parent_session_id", enduranceParentIds)
          .eq("status", "published" as any)
          .order("sort_order", { ascending: false });

        if (childSessions) {
          for (const cs of childSessions as any[]) {
            if (!lastHourSessionMap[cs.event_id]) {
              lastHourSessionMap[cs.event_id] = cs.id;
            }
          }
        }
      }

      if (cancelled) return;

      // Build final session IDs
      const sIds: string[] = [];
      const finalSessionEventMap: Record<string, string> = {};
      for (const rs of raceSessions) {
        if (rs.session_type === "endurance_race" && lastHourSessionMap[rs.event_id]) {
          const lastHourId = lastHourSessionMap[rs.event_id];
          sIds.push(lastHourId);
          finalSessionEventMap[lastHourId] = rs.event_id;
        } else {
          sIds.push(rs.id);
          finalSessionEventMap[rs.id] = rs.event_id;
        }
      }

      const { data: topResults } = await supabase
        .from("v2_race_results" as any)
        .select("session_id, position, driver_id, car_number, v2_drivers(full_name)")
        .in("session_id", sIds)
        .lte("position", 3)
        .order("position");

      if (cancelled) return;

      const podiumMap: Record<string, PodiumEntry[]> = {};
      for (const r of (topResults || []) as any[]) {
        const eventId = finalSessionEventMap[r.session_id];
        if (!eventId) continue;
        if (!podiumMap[eventId]) podiumMap[eventId] = [];
        if (podiumMap[eventId].length < 3 && !podiumMap[eventId].some((p) => p.position === r.position)) {
          podiumMap[eventId].push({
            driverId: r.driver_id,
            name: r.v2_drivers?.full_name || "Unknown",
            position: r.position,
          });
        }
      }

      setPodiums(podiumMap);
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, [eventIds.join(",")]);

  return { podiums, loading };
}
