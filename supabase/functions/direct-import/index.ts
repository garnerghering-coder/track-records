import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = await req.json();

    // Validate required fields
    if (!extracted.event_name || typeof extracted.event_name !== "string") {
      return new Response(JSON.stringify({ error: "event_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!extracted.series_name || typeof extracted.series_name !== "string") {
      return new Response(JSON.stringify({ error: "series_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(extracted.entries) || extracted.entries.length === 0) {
      return new Response(JSON.stringify({ error: "entries array is required and must not be empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all driver profiles for matching
    const { data: allDrivers } = await adminClient
      .from("driver_profiles")
      .select("id, first_name, last_name");

    const driverMap = new Map<string, string>();
    for (const d of allDrivers || []) {
      driverMap.set(`${d.first_name.toLowerCase()} ${d.last_name.toLowerCase()}`, d.id);
    }

    // Fetch all team profiles for matching
    const { data: allTeams } = await adminClient
      .from("team_profiles")
      .select("id, name");

    const teamMap = new Map<string, string>();
    for (const t of allTeams || []) {
      teamMap.set(t.name.toLowerCase(), t.id);
    }

    // Fetch all car models for matching
    const { data: allCars } = await adminClient
      .from("car_models")
      .select("id, name");

    const carMap = new Map<string, string>();
    for (const c of allCars || []) {
      carMap.set(c.name.toLowerCase(), c.id);
    }

    // Check for existing event
    const eventNameVal = extracted.event_name;
    const seriesNameVal = extracted.series_name;
    // Derive season_year from event_date if provided
    let seasonYearVal = extracted.season_year || new Date().getFullYear();
    const eventDateVal = extracted.event_date || null;
    if (eventDateVal && !extracted.season_year) {
      const parsed = parseInt(eventDateVal.split("-")[0]);
      if (parsed) seasonYearVal = parsed;
    }

    const { data: existingEvent } = await adminClient
      .from("race_events")
      .select("id")
      .eq("event_name", eventNameVal)
      .eq("series_name", seriesNameVal)
      .eq("season_year", seasonYearVal)
      .maybeSingle();

    let raceEvent: { id: string };
    if (existingEvent) {
      raceEvent = existingEvent;
      console.log("Using existing event:", raceEvent.id);
    } else {
      const { data: newEvent, error: eventError } = await adminClient
        .from("race_events")
        .insert({
          event_name: eventNameVal,
          series_name: seriesNameVal,
          season_year: seasonYearVal,
          category: extracted.category || "other",
          location: extracted.location || null,
          event_date: eventDateVal,
        })
        .select("id")
        .single();

      if (eventError || !newEvent) {
        console.error("Event insert error:", eventError);
        return new Response(JSON.stringify({ error: "Failed to create event", details: eventError?.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      raceEvent = newEvent;
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    const unmatchedNames: string[] = [];
    let createdCount = 0;
    const createdNames: string[] = [];
    const createdDriverIds: string[] = [];

    for (const entry of extracted.entries) {
      const driverNames: string[] = entry.driver_names || [];
      const matchedDriverIds: string[] = [];
      const unmatchedForEntry: string[] = [];

      for (const name of driverNames) {
        const normalized = name.trim().toLowerCase();
        const id = driverMap.get(normalized);
        if (id) {
          matchedDriverIds.push(id);
          matchedCount++;
        } else {
          // Partial match
          const parts = normalized.split(/\s+/);
          let found = false;
          if (parts.length >= 2) {
            const first = parts[0];
            const last = parts[parts.length - 1];
            for (const [key, driverId] of driverMap.entries()) {
              const [df, dl] = key.split(" ");
              if (df === first && dl === last) {
                matchedDriverIds.push(driverId);
                matchedCount++;
                found = true;
                break;
              }
            }
          }
          // Abbreviated match
          if (!found && parts.length >= 2) {
            const firstPart = parts[0].replace(".", "");
            if (firstPart.length <= 2) {
              const lastPart = parts[parts.length - 1];
              const candidates: { key: string; id: string }[] = [];
              for (const [key, driverId] of driverMap.entries()) {
                const keyParts = key.split(" ");
                const keyLast = keyParts[keyParts.length - 1];
                const keyFirst = keyParts[0];
                if (keyLast === lastPart && keyFirst.startsWith(firstPart.toLowerCase())) {
                  candidates.push({ key, id: driverId });
                }
              }
              if (candidates.length === 1) {
                matchedDriverIds.push(candidates[0].id);
                matchedCount++;
                found = true;
              }
            }
          }
          if (!found) {
            // Auto-create driver
            const nameParts = name.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(" ") || nameParts[0];

            const { data: newDriver } = await adminClient
              .from("driver_profiles")
              .insert({ first_name: firstName, last_name: lastName, is_claimed: false })
              .select("id")
              .single();

            if (newDriver) {
              matchedDriverIds.push(newDriver.id);
              driverMap.set(normalized, newDriver.id);
              createdCount++;
              createdNames.push(name);
              createdDriverIds.push(newDriver.id);
            } else {
              unmatchedForEntry.push(name);
              unmatchedCount++;
              unmatchedNames.push(name);
            }
          }
        }
      }

      const entryNotes = unmatchedForEntry.length > 0
        ? `Unmatched drivers: ${unmatchedForEntry.join(", ")}`
        : null;

      // Match team_profile_id
      // Match car_model_id
      let carModelId: string | null = null;
      if (entry.car_model_name) {
        const normalizedCar = entry.car_model_name.trim().toLowerCase();
        carModelId = carMap.get(normalizedCar) || null;
        if (!carModelId) {
          // Auto-create car model
          const { data: newCar } = await adminClient
            .from("car_models")
            .insert({ name: entry.car_model_name.trim() })
            .select("id")
            .single();
          if (newCar) {
            carModelId = newCar.id;
            carMap.set(normalizedCar, newCar.id);
          }
        }
      }

      let teamProfileId: string | null = null;
      if (entry.team_name) {
        const normalizedTeam = entry.team_name.trim().toLowerCase();
        teamProfileId = teamMap.get(normalizedTeam) || null;
      }

      const { data: insertedEntry, error: entryError } = await adminClient
        .from("race_entries")
        .insert({
          race_event_id: raceEvent.id,
          team_name: entry.team_name || null,
          car_model_id: carModelId,
          team_profile_id: teamProfileId,
          car_number: entry.car_number || null,
          race_class: entry.race_class || null,
          finishing_position: entry.finishing_position ?? null,
          class_position: entry.class_position ?? null,
          laps_completed: entry.laps_completed ?? null,
          gap_to_leader: entry.gap_to_leader || null,
          gap_to_class_leader: entry.gap_to_class_leader || null,
          pit_stops: entry.pit_stops ?? null,
          status: entry.status || null,
          notes: entryNotes,
          verification_status: "pending",
        })
        .select("id")
        .single();

      if (entryError || !insertedEntry) {
        console.error("Entry insert error:", entryError);
        continue;
      }

      if (matchedDriverIds.length > 0) {
        const { error: juncError } = await adminClient
          .from("race_entry_drivers")
          .insert(matchedDriverIds.map((did) => ({
            race_entry_id: insertedEntry.id,
            driver_profile_id: did,
          })));
        if (juncError) console.error("Junction insert error:", juncError);
      }
    }

    // Fire-and-forget enrichment for newly created drivers
    if (createdDriverIds.length > 0) {
      fetch(`${SUPABASE_URL}/functions/v1/enrich-driver-profile`, {
        method: "POST",
        headers: {
          Authorization: authHeader!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driverProfileIds: createdDriverIds }),
      }).catch(err => console.error("Auto-enrich failed:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        eventId: raceEvent.id,
        eventName: extracted.event_name,
        entriesCount: extracted.entries.length,
        matchedDrivers: matchedCount,
        unmatchedDrivers: unmatchedCount,
        unmatchedNames,
        createdDrivers: createdCount,
        createdNames,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("direct-import error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
