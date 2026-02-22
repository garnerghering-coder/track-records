import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url);
      return resp;
    } catch (err) {
      if (attempt < retries) {
        console.log(`Fetch attempt ${attempt} failed for ${url}, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}

/** Map 3-letter IOC/ISO country codes to 2-letter ISO codes */
const country3to2: Record<string, string> = {
  AFG:"AF",ALB:"AL",ALG:"DZ",AND:"AD",ANG:"AO",ANT:"AG",ARG:"AR",ARM:"AM",ARU:"AW",
  ASA:"AS",AUS:"AU",AUT:"AT",AZE:"AZ",BAH:"BS",BAN:"BD",BAR:"BB",BDI:"BI",BEL:"BE",
  BEN:"BJ",BER:"BM",BHU:"BT",BIH:"BA",BIZ:"BZ",BLR:"BY",BOL:"BO",BOT:"BW",BRA:"BR",
  BRN:"BH",BRU:"BN",BUL:"BG",BUR:"BF",CAF:"CF",CAM:"KH",CAN:"CA",CAY:"KY",CGO:"CG",
  CHA:"TD",CHI:"CL",CHN:"CN",CIV:"CI",CMR:"CM",COD:"CD",COK:"CK",COL:"CO",COM:"KM",
  CPV:"CV",CRC:"CR",CRO:"HR",CUB:"CU",CYP:"CY",CZE:"CZ",DEN:"DK",DJI:"DJ",DMA:"DM",
  DOM:"DO",ECU:"EC",EGY:"EG",ERI:"ER",ESA:"SV",ESP:"ES",EST:"EE",ETH:"ET",FIJ:"FJ",
  FIN:"FI",FRA:"FR",FSM:"FM",GAB:"GA",GAM:"GM",GBR:"GB",GEO:"GE",GER:"DE",GHA:"GH",
  GRE:"GR",GRN:"GD",GUA:"GT",GUI:"GN",GUM:"GU",GUY:"GY",HAI:"HT",HKG:"HK",HON:"HN",
  HUN:"HU",INA:"ID",IND:"IN",IRI:"IR",IRL:"IE",IRQ:"IQ",ISL:"IS",ISR:"IL",ISV:"VI",
  ITA:"IT",IVB:"VG",JAM:"JA",JOR:"JO",JPN:"JP",KAZ:"KZ",KEN:"KE",KGZ:"KG",KIR:"KI",
  KOR:"KR",KOS:"XK",KSA:"SA",KUW:"KW",LAO:"LA",LAT:"LV",LBA:"LY",LBN:"LB",LBR:"LR",
  LCA:"LC",LES:"LS",LIE:"LI",LTU:"LT",LUX:"LU",MAD:"MG",MAR:"MA",MAS:"MY",MAW:"MW",
  MDA:"MD",MDV:"MV",MEX:"MX",MGL:"MN",MKD:"MK",MLI:"ML",MLT:"MT",MNE:"ME",MON:"MC",
  MOZ:"MZ",MRI:"MU",MTN:"MR",MYA:"MM",NAM:"NA",NCA:"NI",NED:"NL",NEP:"NP",NGR:"NG",
  NIG:"NE",NOR:"NO",NRU:"NR",NZL:"NZ",OMA:"OM",PAK:"PK",PAN:"PA",PAR:"PY",PER:"PE",
  PHI:"PH",PLE:"PS",PLW:"PW",PNG:"PG",POL:"PL",POR:"PT",PRK:"KP",PUR:"PR",QAT:"QA",
  ROU:"RO",RSA:"ZA",RUS:"RU",RWA:"RW",SAM:"WS",SEN:"SN",SEY:"SC",SGP:"SG",SKN:"KN",
  SLE:"SL",SLO:"SI",SMR:"SM",SOL:"SB",SOM:"SO",SRB:"RS",SRI:"LK",STP:"ST",SUD:"SD",
  SUI:"CH",SUR:"SR",SVK:"SK",SWE:"SE",SWZ:"SZ",SYR:"SY",TAN:"TZ",TGA:"TO",THA:"TH",
  TJK:"TJ",TKM:"TM",TLS:"TL",TOG:"TG",TPE:"TW",TTO:"TT",TUN:"TN",TUR:"TR",TUV:"TV",
  UAE:"AE",UGA:"UG",UKR:"UA",URU:"UY",USA:"US",UZB:"UZ",VAN:"VU",VEN:"VE",VIE:"VN",
  VIN:"VC",YEM:"YE",ZAM:"ZM",ZIM:"ZW",
};

function matchDriver(
  fullName: string,
  existingDrivers: Array<{ id: string; full_name: string }>,
  aliasMap: Map<string, string>
): string | null {
  const normalized = fullName.toLowerCase().trim();
  const aliasId = aliasMap.get(normalized);
  if (aliasId) return aliasId;
  for (const d of existingDrivers) {
    if (d.full_name.toLowerCase() === normalized) return d.id;
  }
  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    for (const d of existingDrivers) {
      const dp = d.full_name.toLowerCase().split(/\s+/);
      if (dp.length >= 2 && dp[0] === first && dp[dp.length - 1] === last) return d.id;
    }
  }
  return null;
}

function matchTeam(
  teamName: string,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>,
  aliasMap: Map<string, string>
): string | null {
  const normalized = teamName.toLowerCase().trim();
  const aliasId = aliasMap.get(normalized);
  if (aliasId) return aliasId;
  for (const t of existingTeams) {
    if (t.full_name.toLowerCase() === normalized) return t.id;
    if (t.short_name && t.short_name.toLowerCase() === normalized) return t.id;
  }
  for (const a of seasonAliases) {
    if (a.display_name.toLowerCase() === normalized) return a.team_id;
    if (a.display_name.toLowerCase().includes(normalized) || normalized.includes(a.display_name.toLowerCase())) return a.team_id;
  }
  for (const t of existingTeams) {
    if (t.full_name.toLowerCase().includes(normalized) || normalized.includes(t.full_name.toLowerCase())) return t.id;
  }
  return null;
}

function matchCar(
  vehicleName: string,
  existingCars: Array<{ id: string; model_name: string; manufacturer: string | null }>
): string | null {
  const normalized = vehicleName.toLowerCase().trim();
  for (const c of existingCars) {
    if (c.model_name.toLowerCase() === normalized) return c.id;
  }
  // Fuzzy: check if car model contains or is contained in the vehicle name
  for (const c of existingCars) {
    const cn = c.model_name.toLowerCase();
    if (cn.includes(normalized) || normalized.includes(cn)) return c.id;
  }
  return null;
}

function detectSessionType(sessionName: string, sessionType?: string): { type: string; name: string } {
  const lower = (sessionType || sessionName).toLowerCase();
  if (/qualifying/i.test(lower)) return { type: "qualifying", name: sessionName };
  if (/free\s*practice|practice/i.test(lower)) return { type: "practice", name: sessionName };
  if (/warm\s*up/i.test(lower)) return { type: "warmup", name: sessionName };
  if (/race|hour/i.test(lower)) return { type: "race", name: sessionName };
  if (/sprint/i.test(lower)) return { type: "sprint_race", name: sessionName };
  return { type: "other", name: sessionName };
}

function parseStatus(status: string, notFinished: boolean, cause: string): string {
  if (!notFinished && (status === "Classified" || status === "Not Classified" || !status)) return "finished";
  if (notFinished) {
    const c = (cause || "").toUpperCase();
    if (c.includes("DNS")) return "dns";
    if (c.includes("DSQ") || c.includes("DISQUALIF")) return "dsq";
    return "dnf";
  }
  const s = status.toUpperCase().trim();
  if (s === "DNF" || s === "MECHANICAL" || s === "ACCIDENT" || s === "RETIREMENT") return "dnf";
  if (s === "DNS") return "dns";
  if (s === "DSQ" || s === "DISQUALIFIED") return "dsq";
  return "finished";
}

/** Extract hour number from a URL path like ".../04_HOUR 3/..." */
function extractHourNumber(url: string): number | null {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/HOUR\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── Resolve or create a driver, update nationality ───────────────────

async function resolveDriver(
  adminClient: any,
  driverName: string,
  country3: string | null,
  existingDrivers: Array<{ id: string; full_name: string }>,
  driverAliasMap: Map<string, string>,
  summary: any
): Promise<string | null> {
  let driverId = matchDriver(driverName, existingDrivers, driverAliasMap);
  const iso2 = country3 ? (country3to2[country3.toUpperCase()] || null) : null;

  if (!driverId) {
    const { data: newDriver } = await adminClient
      .from("v2_drivers")
      .insert({
        full_name: driverName,
        ...(iso2 ? { nationality: iso2 } : {}),
      })
      .select("id")
      .single();
    if (newDriver) {
      driverId = newDriver.id;
      existingDrivers.push({ id: newDriver.id, full_name: driverName });
      summary.drivers_created++;
    }
  } else {
    summary.drivers_matched++;
    // Update nationality if missing
    if (iso2) {
      await adminClient
        .from("v2_drivers")
        .update({ nationality: iso2 })
        .eq("id", driverId)
        .is("nationality", null);
    }
  }
  return driverId;
}

// ── Resolve or create a car ──────────────────────────────────────────

async function resolveCar(
  adminClient: any,
  vehicleName: string | null,
  manufacturer: string | null,
  existingCars: Array<{ id: string; model_name: string; manufacturer: string | null }>,
  summary: any
): Promise<string | null> {
  if (!vehicleName) return null;
  let carId = matchCar(vehicleName, existingCars);
  if (!carId) {
    const { data: newCar } = await adminClient
      .from("v2_cars")
      .insert({
        model_name: vehicleName.trim(),
        ...(manufacturer ? { manufacturer: manufacturer.trim() } : {}),
      })
      .select("id")
      .single();
    if (newCar) {
      carId = newCar.id;
      existingCars.push({ id: newCar.id, model_name: vehicleName.trim(), manufacturer: manufacturer || null });
      summary.cars_created = (summary.cars_created || 0) + 1;
    }
  } else {
    summary.cars_matched = (summary.cars_matched || 0) + 1;
  }
  return carId;
}

// ── Process entries into results ─────────────────────────────────────

async function processEntries(
  adminClient: any,
  sessionId: string,
  entries: any[],
  sessionType: string,
  existingDrivers: Array<{ id: string; full_name: string }>,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  existingCars: Array<{ id: string; model_name: string; manufacturer: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>,
  driverAliasMap: Map<string, string>,
  teamAliasMap: Map<string, string>,
  seasonCarMap: Map<string, string>,
  summary: any,
  isOverallEndurance: boolean
) {
  const isRace = sessionType === "race" || sessionType === "sprint_race" || sessionType === "endurance_race";

  // Compute Position in Class (PIC) by grouping entries by class
  const classCounters: Record<string, number> = {};

  for (const entry of entries) {
    const drivers = entry.drivers || [];
    if (drivers.length === 0) continue;

    // ── Determine which driver to use ──
    // For overall endurance race: we'll create a result per car, driver = primary (first), but all drivers stored conceptually
    // For hour sub-sessions: use fastest_lap_driver_number to pick the active driver
    // For non-race sessions: use fastest_lap_driver_number if available, else primary
    let selectedDriver = drivers[0];
    
    if (!isOverallEndurance && drivers.length > 1) {
      const fastestLapNum = entry.fastest_lap_driver_number || entry.fastest_driver_number;
      if (fastestLapNum) {
        const fastestNumStr = String(fastestLapNum);
        const matched = drivers.find((d: any) => String(d.number) === fastestNumStr);
        if (matched) selectedDriver = matched;
      }
    }

    const primaryDriverName = `${selectedDriver.firstname || selectedDriver.first_name || ""} ${selectedDriver.surname || selectedDriver.last_name || ""}`.trim();
    if (!primaryDriverName) continue;

    const driverCountry = selectedDriver.country || selectedDriver.nationality || null;
    const driverId = await resolveDriver(adminClient, primaryDriverName, driverCountry, existingDrivers, driverAliasMap, summary);

    // For overall endurance, also resolve all other drivers (to ensure they exist and have nationality)
    if (isOverallEndurance && drivers.length > 1) {
      for (let i = 1; i < drivers.length; i++) {
        const d = drivers[i];
        const dName = `${d.firstname || d.first_name || ""} ${d.surname || d.last_name || ""}`.trim();
        if (dName) {
          await resolveDriver(adminClient, dName, d.country || d.nationality || null, existingDrivers, driverAliasMap, summary);
        }
      }
    }

    // ── Team ──
    const teamName = entry.team || null;
    let teamId: string | null = null;
    if (teamName) {
      teamId = matchTeam(teamName, existingTeams, seasonAliases, teamAliasMap);
      if (!teamId) {
        const { data: newTeam } = await adminClient
          .from("v2_teams")
          .insert({ full_name: teamName.trim() })
          .select("id")
          .single();
        if (newTeam) {
          teamId = newTeam.id;
          existingTeams.push({ id: newTeam.id, full_name: teamName.trim(), short_name: null });
          summary.teams_created++;
        }
      } else {
        summary.teams_matched++;
      }
    }

    // ── Car ──
    const vehicleName = entry.vehicle || entry.car || null;
    const manufacturer = entry.manufacturer || null;
    let carId = teamId ? (seasonCarMap.get(teamId) || null) : null;
    if (!carId && vehicleName) {
      carId = await resolveCar(adminClient, vehicleName, manufacturer, existingCars, summary);
      // Link to season if we have a teamId
      if (carId && teamId && !seasonCarMap.has(teamId)) {
        const seasonId = summary._seasonId;
        if (seasonId) {
          await adminClient.from("v2_team_season_cars").insert({
            team_id: teamId,
            car_id: carId,
            season_id: seasonId,
          } as any);
          seasonCarMap.set(teamId, carId);
        }
      }
    }

    // ── Class & PIC ──
    const raceClass = entry.class || entry.category || null;
    const classKey = raceClass || "__overall__";
    if (!classCounters[classKey]) classCounters[classKey] = 0;
    classCounters[classKey]++;
    const pic = classCounters[classKey];

    // ── Tires ──
    const tires = entry.tires || entry.tyres || null;

    const position = typeof entry.position === "number" ? entry.position : null;
    const carNumber = entry.number || null;
    const laps = entry.laps ? parseInt(entry.laps, 10) : null;
    const gapToLeader = entry.gap_first && entry.gap_first !== "-" ? entry.gap_first : null;
    const pitStops = entry.pit_stops ? parseInt(entry.pit_stops, 10) : null;
    const bestLap = entry.time || null;
    const totalTime = entry.total_time || null;
    const status = parseStatus(entry.status || "", entry.not_finished || false, entry.not_finished_cause || "");

    // Build extra_data with Class, PIC, Tires
    const extraData: Record<string, any> = {};
    if (raceClass) extraData["Class"] = raceClass;
    if (raceClass) extraData["PIC"] = pic;
    if (tires) extraData["Tires"] = tires;

    if (isRace) {
      await adminClient.from("v2_race_results").insert({
        session_id: sessionId,
        driver_id: driverId,
        team_id: teamId,
        car_id: carId,
        car_number: carNumber ? String(carNumber) : null,
        position,
        status: status as any,
        laps_completed: typeof laps === "number" && !isNaN(laps) ? laps : null,
        gap_to_leader: gapToLeader ? String(gapToLeader) : null,
        pit_stops: typeof pitStops === "number" && !isNaN(pitStops) ? pitStops : null,
        fastest_lap_time: bestLap ? String(bestLap) : null,
        total_time: totalTime ? String(totalTime) : null,
        extra_data: Object.keys(extraData).length > 0 ? extraData : {},
      } as any);
    } else if (sessionType === "qualifying") {
      await adminClient.from("v2_qualifying_results").insert({
        session_id: sessionId,
        driver_id: driverId,
        team_id: teamId,
        car_id: carId,
        car_number: carNumber ? String(carNumber) : null,
        position,
        best_time: bestLap ? String(bestLap) : null,
        gap_to_pole: gapToLeader ? String(gapToLeader) : null,
        laps_run: typeof laps === "number" && !isNaN(laps) ? laps : null,
        extra_data: Object.keys(extraData).length > 0 ? extraData : {},
      } as any);
    } else {
      await adminClient.from("v2_practice_results").insert({
        session_id: sessionId,
        driver_id: driverId,
        team_id: teamId,
        car_id: carId,
        car_number: carNumber ? String(carNumber) : null,
        position,
        best_lap_time: bestLap ? String(bestLap) : null,
        gap_to_p1: gapToLeader ? String(gapToLeader) : null,
        laps_run: typeof laps === "number" && !isNaN(laps) ? laps : null,
        extra_data: Object.keys(extraData).length > 0 ? extraData : {},
      } as any);
    }

    summary.total_entries++;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { url, event_id, mode } = await req.json();
    const isPreview = mode === "preview";

    if (!url || !event_id) {
      return new Response(
        JSON.stringify({ error: "Both url and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify event exists
    const { data: event, error: eventErr } = await adminClient
      .from("v2_events")
      .select("id, name, season_id, circuit_id, v2_seasons(year, series_id, v2_series(name, v2_series_aliases(alias)))")
      .eq("id", event_id)
      .single();
    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Fetch the IMSA results page HTML ──
    console.log("Fetching IMSA page:", url);
    const pageResponse = await fetchWithRetry(url);
    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch IMSA page: ${pageResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const html = await pageResponse.text();

    // Extract all href links from the HTML
    const hrefRegex = /href="([^"]+\.JSON)"/gi;
    const allJsonLinks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      allJsonLinks.push(match[1]);
    }

    console.log(`Found ${allJsonLinks.length} total .JSON links in HTML`);

    // Filter for results JSON files
    const baseUrl = "https://imsa.results.alkamelcloud.com/";

    // Build series name matchers
    const season = event.v2_seasons as any;
    const seriesObj = season?.v2_series;
    const seriesName: string = seriesObj?.name || "";
    const seriesAliasesList: string[] = (seriesObj?.v2_series_aliases || []).map((a: any) => a.alias);
    const allSeriesNames = [seriesName, ...seriesAliasesList].filter(Boolean).map(n => n.toLowerCase());

    console.log("Series filter names:", allSeriesNames);

    function extractSeriesFolder(urlPath: string): string {
      const decoded = decodeURIComponent(urlPath);
      const segments = decoded.split("/").filter(Boolean);
      for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i].toLowerCase() === "results" && i + 3 < segments.length) {
          const seriesSegment = segments[i + 3];
          return seriesSegment.replace(/^\d+_/, "").toLowerCase().trim();
        }
      }
      return "";
    }

    function matchesSeriesFolder(urlPath: string): boolean {
      const folder = extractSeriesFolder(urlPath);
      if (!folder) return false;
      return allSeriesNames.some(sn => {
        if (sn.length > 5) return folder.includes(sn) || sn.includes(folder);
        return folder === sn;
      });
    }

    const resultsFilePattern = /0[234]_Results[_%\s]/i;
    const seriesMatchedLinks = allJsonLinks
      .filter(l => resultsFilePattern.test(l))
      .filter(l => !/Results[_%\s]+by[_%\s]+Class/i.test(l) && !/Results[_%\s]+by[_%\s]+Hour[_%\s]+(&|%26)/i.test(l))
      .filter(l => matchesSeriesFolder(l));

    // Group by session path to deduplicate
    const sessionGrouped = new Map<string, string>();
    for (const l of seriesMatchedLinks) {
      const key = l.replace(/0[234]_Results[^/]*$/i, "");
      const existing = sessionGrouped.get(key);
      if (!existing || /03_Results/i.test(l)) {
        sessionGrouped.set(key, l);
      }
    }

    const resultsJsonLinks = Array.from(sessionGrouped.values())
      .map(l => {
        try {
          return new URL(l, baseUrl).href;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    console.log(`Found ${resultsJsonLinks.length} series-filtered results JSON links`);

    if (resultsJsonLinks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No results JSON files found for this series on this page.",
          debug_json_links_found: allJsonLinks.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1.5: Detect endurance race pattern ──
    const hourLinks = resultsJsonLinks.filter(l => extractHourNumber(l) !== null);
    const overallRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      const hasRaceFolder = /\d+_race\//i.test(decoded);
      const hasHour = /hour\s*\d+/i.test(decoded);
      return hasRaceFolder && !hasHour;
    });
    const nonRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      const hasRaceFolder = /\d+_race\//i.test(decoded);
      const hasHour = extractHourNumber(l) !== null;
      return !hasRaceFolder && !hasHour;
    });

    const isEndurance = hourLinks.length > 0;
    console.log(`Endurance detection: ${isEndurance} (${hourLinks.length} hour links, ${overallRaceLinks.length} overall race links, ${nonRaceLinks.length} non-race links)`);

    // ── Step 2: Load reference data ──
    const seasonId = event.season_id;
    const [driversRes, teamsRes, carsRes, existingSessionsRes, aliasesRes, seasonCarsRes, driverAliasesRes, teamAliasesRes] = await Promise.all([
      adminClient.from("v2_drivers").select("id, full_name"),
      adminClient.from("v2_teams").select("id, full_name, short_name"),
      adminClient.from("v2_cars").select("id, model_name, manufacturer"),
      adminClient.from("v2_sessions").select("id, name").eq("event_id", event_id),
      adminClient.from("v2_team_season_names").select("team_id, display_name").eq("season_id", seasonId),
      adminClient.from("v2_team_season_cars").select("team_id, car_id").eq("season_id", seasonId),
      adminClient.from("search_aliases").select("alias, canonical, entity_type").eq("entity_type", "driver"),
      adminClient.from("search_aliases").select("alias, canonical, entity_type").eq("entity_type", "team"),
    ]);

    const existingDrivers = driversRes.data || [];
    const existingTeams = teamsRes.data || [];
    const existingCars: Array<{ id: string; model_name: string; manufacturer: string | null }> = (carsRes.data || []) as any;
    const existingSessionNames = new Set((existingSessionsRes.data || []).map((s: any) => s.name));
    const seasonAliases: Array<{ team_id: string; display_name: string }> = (aliasesRes.data || []) as any;
    const seasonCarMap = new Map<string, string>();
    for (const sc of (seasonCarsRes.data || []) as any[]) seasonCarMap.set(sc.team_id, sc.car_id);

    const driverAliasMap = new Map<string, string>();
    for (const a of (driverAliasesRes.data || []) as any[]) driverAliasMap.set(a.alias.toLowerCase(), a.canonical);
    const teamAliasMap = new Map<string, string>();
    for (const a of (teamAliasesRes.data || []) as any[]) teamAliasMap.set(a.alias.toLowerCase(), a.canonical);

    // ── Step 3: Process results ──
    const summary: any = {
      sessions_created: 0,
      sessions_skipped: 0,
      total_entries: 0,
      drivers_matched: 0,
      drivers_created: 0,
      teams_matched: 0,
      teams_created: 0,
      cars_matched: 0,
      cars_created: 0,
      is_endurance: isEndurance,
      errors: [] as string[],
      _seasonId: seasonId,
    };

    // Get max sort order
    const { data: allSessions } = await adminClient
      .from("v2_sessions")
      .select("sort_order")
      .eq("event_id", event_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let sortOrder = (allSessions?.[0]?.sort_order ?? -1) + 1;

    // Auto-assign layout helper
    const autoAssignLayout = async (sessionId: string) => {
      if (event.circuit_id) {
        const { data: layouts } = await adminClient
          .from("v2_circuit_layouts")
          .select("id")
          .eq("circuit_id", event.circuit_id);
        if (layouts && layouts.length === 1) {
          await adminClient.from("v2_sessions").update({ layout_id: layouts[0].id } as any).eq("id", sessionId);
        }
      }
    };

    const parseSessionDate = (sessionData: any): string | null => {
      if (sessionData.session_date) {
        const dateParts = sessionData.session_date.split(" ")[0]?.split("/");
        if (dateParts && dateParts.length === 3) {
          return `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        }
      }
      return null;
    };

    const createSession = async (
      name: string,
      sessionType: string,
      jsonUrl: string,
      sessionDate: string | null,
      parentSessionId: string | null
    ): Promise<string | null> => {
      const { data: newSession, error: sessionErr } = await adminClient
        .from("v2_sessions")
        .insert({
          event_id,
          name,
          session_type: sessionType as any,
          status: "draft" as any,
          sort_order: sortOrder++,
          source_document_url: jsonUrl,
          ...(sessionDate ? { date: sessionDate } : {}),
          ...(parentSessionId ? { parent_session_id: parentSessionId } : {}),
        } as any)
        .select("id")
        .single();
      if (sessionErr || !newSession) {
        summary.errors.push(`Failed to create session ${name}: ${sessionErr?.message}`);
        return null;
      }
      existingSessionNames.add(name);
      await autoAssignLayout(newSession.id);
      summary.sessions_created++;
      return newSession.id;
    };

    const processJson = async (jsonUrl: string, sessionType: string, sessionId: string, isOverallEndurance: boolean) => {
      const jsonResponse = await fetchWithRetry(jsonUrl);
      if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`); return; }
      const data = await jsonResponse.json();
      const entries: any[] = data.classification || [];
      await processEntries(adminClient, sessionId, entries, sessionType, existingDrivers, existingTeams, existingCars, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary, isOverallEndurance);
    };

    if (isEndurance) {
      // ── Endurance Race Flow ──
      // 1. Process non-race sessions
      for (const jsonUrl of nonRaceLinks) {
        try {
          console.log("Fetching non-race JSON:", jsonUrl);
          const jsonResponse = await fetchWithRetry(jsonUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const sessionData = data.session || {};
          const sessionName = sessionData.session_name || "Unknown Session";
          const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");

          if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in ${sessionInfo.name}`); continue; }
          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(sessionData);
          const sessionId = await createSession(sessionInfo.name, sessionInfo.type, jsonUrl, sessionDate, null);
          if (!sessionId) continue;

          await processEntries(adminClient, sessionId, entries, sessionInfo.type, existingDrivers, existingTeams, existingCars, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary, false);
        } catch (err) {
          summary.errors.push(`Error processing ${jsonUrl}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      // 2. Create parent endurance_race session
      const raceSessionName = "Race";
      let parentSessionId: string | null = null;

      if (!existingSessionNames.has(raceSessionName) && !isPreview) {
        let raceDate: string | null = null;
        const firstRaceUrl = overallRaceLinks[0] || hourLinks[0];
        if (firstRaceUrl) {
          try {
            const resp = await fetchWithRetry(firstRaceUrl);
            if (resp.ok) {
              const d = await resp.json();
              raceDate = parseSessionDate(d.session || {});
            }
          } catch { /* ignore */ }
        }

        parentSessionId = await createSession(raceSessionName, "endurance_race", url, raceDate, null);
      } else if (existingSessionNames.has(raceSessionName)) {
        summary.sessions_skipped++;
      }

      // 3. Import overall race results into parent session
      const sortedHourLinks = hourLinks
        .map(l => ({ url: l, hour: extractHourNumber(l)! }))
        .sort((a, b) => a.hour - b.hour);

      const raceDataUrl = overallRaceLinks.length > 0
        ? overallRaceLinks[overallRaceLinks.length - 1]
        : (sortedHourLinks.length > 0 ? sortedHourLinks[sortedHourLinks.length - 1].url : null);

      if (parentSessionId && raceDataUrl) {
        try {
          console.log("Fetching final race results for parent session:", raceDataUrl);
          await processJson(raceDataUrl, "endurance_race", parentSessionId, true);
        } catch (err) {
          summary.errors.push(`Error processing final race results: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      // 4. Import hour-by-hour results as child sessions
      for (const { url: hourUrl, hour } of sortedHourLinks) {
        const hourSessionName = `Hour ${hour}`;
        if (existingSessionNames.has(hourSessionName)) { summary.sessions_skipped++; continue; }

        try {
          console.log(`Fetching Hour ${hour} results:`, hourUrl);
          const jsonResponse = await fetchWithRetry(hourUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${hourUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in Hour ${hour}`); continue; }

          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(data.session || {});
          const childSessionId = await createSession(hourSessionName, "race", hourUrl, sessionDate, parentSessionId);
          if (!childSessionId) continue;

          await processEntries(adminClient, childSessionId, entries, "race", existingDrivers, existingTeams, existingCars, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary, false);
        } catch (err) {
          summary.errors.push(`Error processing Hour ${hour}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      if (isPreview && !existingSessionNames.has(raceSessionName)) {
        summary.sessions_created++; // count parent
        summary.sessions_created += sortedHourLinks.length; // count hours
      }
    } else {
      // ── Standard (non-endurance) flow ──
      for (const jsonUrl of resultsJsonLinks) {
        try {
          console.log("Fetching JSON:", jsonUrl);
          const jsonResponse = await fetchWithRetry(jsonUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const sessionData = data.session || {};
          const sessionName = sessionData.session_name || "Unknown Session";
          const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");

          if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in ${sessionInfo.name}`); continue; }
          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(sessionData);
          const sessionId = await createSession(sessionInfo.name, sessionInfo.type, jsonUrl, sessionDate, null);
          if (!sessionId) continue;

          await processEntries(adminClient, sessionId, entries, sessionInfo.type, existingDrivers, existingTeams, existingCars, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary, false);
        } catch (err) {
          summary.errors.push(`Error processing ${jsonUrl}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }
    }

    // Clean internal fields from summary
    delete summary._seasonId;

    return new Response(
      JSON.stringify({ ...summary, success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("import-imsa-results error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
