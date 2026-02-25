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

function extractHourNumber(url: string): number | null {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/HOUR\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── Time Card parsing ────────────────────────────────────────────────

function parseElapsedToSeconds(elapsed: string): number {
  // Formats: "2:55.481" (m:ss.ms), "1:02:30.000" (h:mm:ss.ms)
  const parts = elapsed.split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
  }
  return parseFloat(elapsed) || 0;
}

/**
 * Parse Time Card CSV to build a map of car_number -> hour_number -> driver_name.
 * For each car and hour, we pick the driver who drove the last lap in that hour.
 */
function parseTimeCardCSV(csvText: string): Map<string, Map<number, string>> {
  const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return new Map();

  // Header: NUMBER; DRIVER_NUMBER; LAP_NUMBER; ... ELAPSED; ... DRIVER_NAME; ...
  const header = lines[0].split(";").map(h => h.trim().replace(/\\/g, ""));
  const numIdx = header.indexOf("NUMBER");
  const driverNameIdx = header.indexOf("DRIVER_NAME");
  const elapsedIdx = header.indexOf("ELAPSED");

  if (numIdx === -1 || driverNameIdx === -1 || elapsedIdx === -1) {
    console.log("Time Card CSV: could not find required columns", header);
    return new Map();
  }

  // Collect: for each car + hour, track the latest (highest elapsed) lap's driver
  const carHourDriver = new Map<string, Map<number, { elapsed: number; driver: string }>>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map(c => c.trim());
    const carNumber = cols[numIdx];
    const driverName = cols[driverNameIdx];
    const elapsedStr = cols[elapsedIdx];
    if (!carNumber || !driverName || !elapsedStr) continue;

    const elapsedSec = parseElapsedToSeconds(elapsedStr);
    // Use ceil so a lap completed at exactly the hour boundary (e.g. 3600s) stays in that hour
    const hourNum = elapsedSec <= 0 ? 1 : Math.ceil(elapsedSec / 3600);

    if (!carHourDriver.has(carNumber)) carHourDriver.set(carNumber, new Map());
    const hourMap = carHourDriver.get(carNumber)!;
    const existing = hourMap.get(hourNum);
    if (!existing || elapsedSec > existing.elapsed) {
      hourMap.set(hourNum, { elapsed: elapsedSec, driver: driverName });
    }
  }

  // Simplify to car_number -> hour_number -> driver_name
  const result = new Map<string, Map<number, string>>();
  for (const [car, hourMap] of carHourDriver) {
    const simplified = new Map<number, string>();
    for (const [hour, info] of hourMap) {
      simplified.set(hour, info.driver);
    }
    result.set(car, simplified);
  }

  // Cap overflow hours: laps beyond the race duration (e.g. after 24:00:00 in a 24h race)
  // get assigned to hour 25+. Merge those into the actual max hour so the finishing driver is correct.
  for (const [car, hourMap] of result) {
    const maxHour = Math.max(...Array.from(hourMap.keys()));
    // Check if there are standard hour boundaries (1-24 typical) with overflow
    // If we have e.g. hours 1..24 and also 25, merge 25 into 24
    const hours = Array.from(hourMap.keys()).sort((a, b) => a - b);
    if (hours.length > 1) {
      // Find contiguous block from 1..N, anything beyond N gets merged into N
      let expectedMax = 1;
      for (const h of hours) {
        if (h === expectedMax) expectedMax++;
      }
      expectedMax--; // the last contiguous hour
      // Merge any hours > expectedMax into expectedMax (use the one with highest elapsed = latest entry)
      for (const h of hours) {
        if (h > expectedMax && expectedMax >= 1) {
          // The overflow hour's driver replaces the max hour's driver (they drove LATER)
          hourMap.set(expectedMax, hourMap.get(h)!);
          hourMap.delete(h);
        }
      }
    }
  }

  console.log(`Time Card parsed: ${result.size} cars, sample:`,
    Array.from(result.entries()).slice(0, 2).map(([car, hours]) =>
      `Car ${car}: ${Array.from(hours.entries()).slice(0, 3).map(([h, d]) => `H${h}=${d}`).join(", ")}`
    )
  );
  return result;
}

// ── Bulk entity resolution ───────────────────────────────────────────
// Pre-scan all JSON data to collect unique drivers/teams/cars, then resolve/create them all at once

interface DriverInfo { name: string; country3: string | null; }
interface TeamInfo { name: string; }
interface CarInfo { vehicle: string; manufacturer: string | null; }

function collectUniqueEntities(allSessionData: Array<{ entries: any[] }>) {
  const drivers = new Map<string, DriverInfo>(); // keyed by lowercase name
  const teams = new Map<string, TeamInfo>();
  const cars = new Map<string, CarInfo>();

  for (const { entries } of allSessionData) {
    for (const entry of entries) {
      const entryDrivers = entry.drivers || [];
      for (const d of entryDrivers) {
        const name = `${d.firstname || d.first_name || ""} ${d.surname || d.last_name || ""}`.trim();
        if (name) {
          const key = name.toLowerCase();
          if (!drivers.has(key)) {
            drivers.set(key, { name, country3: d.country || d.nationality || null });
          }
        }
      }
      const teamName = entry.team;
      if (teamName) {
        const key = teamName.toLowerCase().trim();
        if (!teams.has(key)) teams.set(key, { name: teamName.trim() });
      }
      const vehicle = entry.vehicle || entry.car;
      if (vehicle) {
        const key = vehicle.toLowerCase().trim();
        if (!cars.has(key)) cars.set(key, { vehicle: vehicle.trim(), manufacturer: (entry.manufacturer || "").trim() || null });
      }
    }
  }
  return { drivers, teams, cars };
}

async function bulkResolveDrivers(
  adminClient: any,
  uniqueDrivers: Map<string, DriverInfo>,
  existingDrivers: Array<{ id: string; full_name: string }>,
  aliasMap: Map<string, string>,
  summary: any
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>(); // lowercase name -> id
  const toCreate: Array<{ full_name: string; nationality?: string }> = [];
  const toCreateKeys: string[] = [];

  for (const [key, info] of uniqueDrivers) {
    const id = matchDriver(info.name, existingDrivers, aliasMap);
    if (id) {
      resolved.set(key, id);
      summary.drivers_matched++;
      // Update nationality if missing
      const iso2 = info.country3 ? (country3to2[info.country3.toUpperCase()] || null) : null;
      if (iso2) {
        // Fire-and-forget nationality update
        adminClient.from("v2_drivers").update({ nationality: iso2 }).eq("id", id).is("nationality", null).then(() => {});
      }
    } else {
      const iso2 = info.country3 ? (country3to2[info.country3.toUpperCase()] || null) : null;
      toCreate.push({ full_name: info.name, ...(iso2 ? { nationality: iso2 } : {}) });
      toCreateKeys.push(key);
    }
  }

  // Batch create missing drivers (in chunks of 50)
  for (let i = 0; i < toCreate.length; i += 50) {
    const chunk = toCreate.slice(i, i + 50);
    const keys = toCreateKeys.slice(i, i + 50);
    const { data: newDrivers } = await adminClient.from("v2_drivers").insert(chunk).select("id, full_name");
    if (newDrivers) {
      for (let j = 0; j < newDrivers.length; j++) {
        resolved.set(keys[j], newDrivers[j].id);
        existingDrivers.push({ id: newDrivers[j].id, full_name: newDrivers[j].full_name });
        summary.drivers_created++;
      }
    }
  }
  return resolved;
}

async function bulkResolveTeams(
  adminClient: any,
  uniqueTeams: Map<string, TeamInfo>,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>,
  aliasMap: Map<string, string>,
  summary: any
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const toCreate: Array<{ full_name: string }> = [];
  const toCreateKeys: string[] = [];

  for (const [key, info] of uniqueTeams) {
    const id = matchTeam(info.name, existingTeams, seasonAliases, aliasMap);
    if (id) {
      resolved.set(key, id);
      summary.teams_matched++;
    } else {
      toCreate.push({ full_name: info.name });
      toCreateKeys.push(key);
    }
  }

  for (let i = 0; i < toCreate.length; i += 50) {
    const chunk = toCreate.slice(i, i + 50);
    const keys = toCreateKeys.slice(i, i + 50);
    const { data: newTeams } = await adminClient.from("v2_teams").insert(chunk).select("id, full_name");
    if (newTeams) {
      for (let j = 0; j < newTeams.length; j++) {
        resolved.set(keys[j], newTeams[j].id);
        existingTeams.push({ id: newTeams[j].id, full_name: newTeams[j].full_name, short_name: null });
        summary.teams_created++;
      }
    }
  }
  return resolved;
}

async function bulkResolveCars(
  adminClient: any,
  uniqueCars: Map<string, CarInfo>,
  existingCars: Array<{ id: string; model_name: string; manufacturer: string | null }>,
  summary: any
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const toCreate: Array<{ model_name: string; manufacturer?: string }> = [];
  const toCreateKeys: string[] = [];

  for (const [key, info] of uniqueCars) {
    const id = matchCar(info.vehicle, existingCars);
    if (id) {
      resolved.set(key, id);
      summary.cars_matched = (summary.cars_matched || 0) + 1;
    } else {
      toCreate.push({ model_name: info.vehicle, ...(info.manufacturer ? { manufacturer: info.manufacturer } : {}) });
      toCreateKeys.push(key);
    }
  }

  for (let i = 0; i < toCreate.length; i += 50) {
    const chunk = toCreate.slice(i, i + 50);
    const keys = toCreateKeys.slice(i, i + 50);
    const { data: newCars } = await adminClient.from("v2_cars").insert(chunk).select("id, model_name, manufacturer");
    if (newCars) {
      for (let j = 0; j < newCars.length; j++) {
        resolved.set(keys[j], newCars[j].id);
        existingCars.push({ id: newCars[j].id, model_name: newCars[j].model_name, manufacturer: newCars[j].manufacturer });
        summary.cars_created = (summary.cars_created || 0) + 1;
      }
    }
  }
  return resolved;
}

// ── Build result rows for batch insert ───────────────────────────────

function buildResultRows(
  sessionId: string,
  entries: any[],
  sessionType: string,
  driverMap: Map<string, string>,
  teamMap: Map<string, string>,
  carMap: Map<string, string>,
  isOverallEndurance: boolean,
  summary: any,
  hourNumber?: number,
  timeCardMap?: Map<string, Map<number, string>>
): { raceRows: any[]; qualifyingRows: any[]; practiceRows: any[] } {
  const raceRows: any[] = [];
  const qualifyingRows: any[] = [];
  const practiceRows: any[] = [];
  const isRace = sessionType === "race" || sessionType === "sprint_race" || sessionType === "endurance_race";
  const classCounters: Record<string, number> = {};

  for (const entry of entries) {
    const drivers = entry.drivers || [];
    if (drivers.length === 0) continue;



    let selectedDriver = drivers[0];

    // For hour sub-sessions with Time Card data, use the Time Card to determine the active driver
    if (hourNumber && timeCardMap && drivers.length > 1) {
      const carNum = String(entry.number || "");
      const carTimeCard = timeCardMap.get(carNum);
      if (carTimeCard) {
        const activeDriverName = carTimeCard.get(hourNumber);
        if (activeDriverName) {
          const activeLower = activeDriverName.toLowerCase().trim();
          const matched = drivers.find((d: any) => {
            const dn = `${d.firstname || d.first_name || ""} ${d.surname || d.last_name || ""}`.trim().toLowerCase();
            if (dn === activeLower) return true;
            // CSV may have "LASTNAME Firstname" or partial matches
            const surname = (d.surname || d.last_name || "").toLowerCase();
            const firstname = (d.firstname || d.first_name || "").toLowerCase();
            if (activeLower.startsWith(surname) && activeLower.includes(firstname)) return true;
            if (activeLower.includes(surname) && activeLower.includes(firstname)) return true;
            return false;
          });
          if (matched) selectedDriver = matched;
        }
      }
    } else if (hourNumber && !timeCardMap && drivers.length > 1) {
      // For endurance hour sub-sessions WITHOUT Time Card data, use drivers[0]
      // which is the current/active driver listed first in the hour results JSON
      // Do nothing - selectedDriver is already drivers[0]
    } else if (!isOverallEndurance && !hourNumber && drivers.length > 1) {
      // For non-endurance sessions (practice/qualifying), use fastest lap driver
      const fastestLapNum = entry.fastest_lap_driver_number || entry.fastest_driver_number;
      if (fastestLapNum) {
        const matched = drivers.find((d: any) => String(d.number) === String(fastestLapNum));
        if (matched) selectedDriver = matched;
      }
    }

    const driverName = `${selectedDriver.firstname || selectedDriver.first_name || ""} ${selectedDriver.surname || selectedDriver.last_name || ""}`.trim();
    if (!driverName) continue;

    const driverId = driverMap.get(driverName.toLowerCase()) || null;
    const teamName = entry.team;
    const teamId = teamName ? (teamMap.get(teamName.toLowerCase().trim()) || null) : null;
    const vehicleName = entry.vehicle || entry.car;
    const carId = vehicleName ? (carMap.get(vehicleName.toLowerCase().trim()) || null) : null;

    const raceClass = entry.class || entry.category || null;
    const classKey = raceClass || "__overall__";
    if (!classCounters[classKey]) classCounters[classKey] = 0;
    classCounters[classKey]++;
    const pic = classCounters[classKey];

    const position = typeof entry.position === "number" ? entry.position : null;
    const carNumber = entry.number || null;
    const laps = entry.laps ? parseInt(entry.laps, 10) : null;
    const gapToLeader = entry.gap_first && entry.gap_first !== "-" ? entry.gap_first : null;
    const pitStops = entry.pit_stops ? parseInt(entry.pit_stops, 10) : null;
    const bestLap = entry.time || null;
    const totalTime = entry.total_time || null;
    const status = parseStatus(entry.status || "", entry.not_finished || false, entry.not_finished_cause || "");

    const extraData: Record<string, any> = {};
    if (raceClass) extraData["Class"] = raceClass;
    if (raceClass) extraData["PIC"] = pic;

    // For endurance races (overall/parent view) with multiple drivers per car,
    // insert one row per driver sharing the same car_number, position, etc.
    if (isRace && isOverallEndurance && drivers.length > 1) {
      for (const d of drivers) {
        const dn = `${d.firstname || d.first_name || ""} ${d.surname || d.last_name || ""}`.trim();
        if (!dn) continue;
        const did = driverMap.get(dn.toLowerCase()) || null;
        raceRows.push({
          session_id: sessionId,
          driver_id: did,
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
        });
        summary.total_entries++;
      }
    } else if (isRace) {
      raceRows.push({
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
      });
      summary.total_entries++;
    } else if (sessionType === "qualifying") {
      qualifyingRows.push({
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
      });
    } else {
      practiceRows.push({
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
      });
      summary.total_entries++;
    }
  }
  return { raceRows, qualifyingRows, practiceRows };
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

    const hrefRegex = /href="([^"]+\.JSON)"/gi;
    const allJsonLinks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      allJsonLinks.push(match[1]);
    }

    // Also collect Time Card CSV links for endurance driver detection
    const timeCardRegex = /href="([^"]+23_Time(?:%20|[_%\s])*Cards?[^"]*\.CSV)"/gi;
    const allTimeCardLinks: string[] = [];
    while ((match = timeCardRegex.exec(html)) !== null) {
      allTimeCardLinks.push(match[1]);
    }

    // Collect Weather JSON links (pattern: 26_Weather_*.JSON)
    const weatherJsonRegex = /href="([^"]+26_Weather[^"]*\.JSON)"/gi;
    const allWeatherJsonLinks: string[] = [];
    while ((match = weatherJsonRegex.exec(html)) !== null) {
      allWeatherJsonLinks.push(match[1]);
    }
    // Also collect Weather CSV links as fallback
    const weatherCsvRegex = /href="([^"]+26_Weather[^"]*\.CSV)"/gi;
    const allWeatherCsvLinks: string[] = [];
    while ((match = weatherCsvRegex.exec(html)) !== null) {
      allWeatherCsvLinks.push(match[1]);
    }

    console.log(`Found ${allJsonLinks.length} total .JSON links, ${allTimeCardLinks.length} Time Card CSV links, ${allWeatherJsonLinks.length} Weather JSON links in HTML`);

    const baseUrl = "https://imsa.results.alkamelcloud.com/";
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
          return segments[i + 3].replace(/^\d+_/, "").toLowerCase().trim();
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

    const sessionGrouped = new Map<string, string>();
    for (const l of seriesMatchedLinks) {
      const key = l.replace(/0[234]_Results[^/]*$/i, "");
      const existing = sessionGrouped.get(key);
      if (!existing || /03_Results/i.test(l)) {
        sessionGrouped.set(key, l);
      }
    }

    const resultsJsonLinks = Array.from(sessionGrouped.values())
      .map(l => { try { return new URL(l, baseUrl).href; } catch { return null; } })
      .filter(Boolean) as string[];

    console.log(`Found ${resultsJsonLinks.length} series-filtered results JSON links`);

    if (resultsJsonLinks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No results JSON files found for this series on this page.", debug_json_links_found: allJsonLinks.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1.5: Detect endurance race pattern ──
    const hourLinks = resultsJsonLinks.filter(l => extractHourNumber(l) !== null);
    const overallRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      return /\d+_race\//i.test(decoded) && !/hour\s*\d+/i.test(decoded);
    });
    const nonRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      return !/\d+_race\//i.test(decoded) && extractHourNumber(l) === null;
    });

    const isEndurance = hourLinks.length > 0;
    console.log(`Endurance detection: ${isEndurance} (${hourLinks.length} hour links, ${overallRaceLinks.length} overall race links, ${nonRaceLinks.length} non-race links)`);

    // ── Step 2: FETCH ALL JSON DATA IN PARALLEL ──
    console.log("Fetching all JSON files in parallel...");

    type FetchedSession = {
      url: string;
      kind: "nonrace" | "overall" | "hour";
      hour?: number;
      data: any;
    };

    const fetchPromises: Promise<FetchedSession | null>[] = [];

    for (const jsonUrl of nonRaceLinks) {
      fetchPromises.push(
        fetchWithRetry(jsonUrl).then(async r => r.ok ? { url: jsonUrl, kind: "nonrace" as const, data: await r.json() } : null).catch(() => null)
      );
    }
    for (const jsonUrl of overallRaceLinks) {
      fetchPromises.push(
        fetchWithRetry(jsonUrl).then(async r => r.ok ? { url: jsonUrl, kind: "overall" as const, data: await r.json() } : null).catch(() => null)
      );
    }
    for (const jsonUrl of hourLinks) {
      const hour = extractHourNumber(jsonUrl)!;
      fetchPromises.push(
        fetchWithRetry(jsonUrl).then(async r => r.ok ? { url: jsonUrl, kind: "hour" as const, hour, data: await r.json() } : null).catch(() => null)
      );
    }
    // For non-endurance, all links go to fetchPromises
    if (!isEndurance) {
      // Already handled above via nonRaceLinks covering everything
      // But for non-endurance, all resultsJsonLinks are non-race
      // We need to clear and re-add since the categorization might miss some
    }

    const fetchedResults = (await Promise.all(fetchPromises)).filter(Boolean) as FetchedSession[];
    console.log(`Successfully fetched ${fetchedResults.length} JSON files`);

    // ── Step 2.5: Load reference data (parallel with JSON fetch wasn't possible, but do it now) ──
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

    // ── Step 3: BULK resolve all entities ──
    const allSessionEntries = fetchedResults.map(f => ({ entries: f.data.classification || [] }));
    const { drivers: uniqueDrivers, teams: uniqueTeams, cars: uniqueCars } = collectUniqueEntities(allSessionEntries);

    console.log(`Resolving ${uniqueDrivers.size} drivers, ${uniqueTeams.size} teams, ${uniqueCars.size} cars...`);

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
    };

    if (isPreview) {
      // Preview mode: just count
      for (const f of fetchedResults) {
        const entries = f.data.classification || [];
        if (entries.length > 0) summary.sessions_created++;
        summary.total_entries += entries.length;
      }
      summary.drivers_matched = uniqueDrivers.size;
      summary.teams_matched = uniqueTeams.size;
      summary.cars_matched = uniqueCars.size;
      return new Response(
        JSON.stringify({ ...summary, success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [driverMap, teamMap, carMap] = await Promise.all([
      bulkResolveDrivers(adminClient, uniqueDrivers, existingDrivers, driverAliasMap, summary),
      bulkResolveTeams(adminClient, uniqueTeams, existingTeams, seasonAliases, teamAliasMap, summary),
      bulkResolveCars(adminClient, uniqueCars, existingCars, summary),
    ]);

    console.log(`Entity resolution complete. Creating sessions and inserting results...`);

    // Link cars to season for teams
    const carSeasonInserts: any[] = [];
    for (const [teamKey, teamId] of teamMap) {
      if (!seasonCarMap.has(teamId)) {
        // Find a car used by this team from any entry
        for (const f of fetchedResults) {
          for (const entry of (f.data.classification || [])) {
            if (entry.team && entry.team.toLowerCase().trim() === teamKey) {
              const v = entry.vehicle || entry.car;
              if (v) {
                const cId = carMap.get(v.toLowerCase().trim());
                if (cId) {
                  carSeasonInserts.push({ team_id: teamId, car_id: cId, season_id: seasonId });
                  seasonCarMap.set(teamId, cId);
                  break;
                }
              }
            }
          }
          if (seasonCarMap.has(teamId)) break;
        }
      }
    }
    if (carSeasonInserts.length > 0) {
      await adminClient.from("v2_team_season_cars").insert(carSeasonInserts);
    }

    // ── Step 4: Create sessions and batch insert results ──
    const { data: allSessions } = await adminClient
      .from("v2_sessions")
      .select("sort_order")
      .eq("event_id", event_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let sortOrder = (allSessions?.[0]?.sort_order ?? -1) + 1;

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

    /** Parse session_date "22/01/2026 10:05" → { date: "2026-01-22", startTime: null }
     * Note: We only extract the date; start times from IMSA data are unreliable and are omitted.
     */
    const parseSessionDateTime = (sessionData: any): { date: string | null; startTime: string | null } => {
      if (!sessionData.session_date) return { date: null, startTime: null };
      const parts = sessionData.session_date.split(" ");
      const dateParts = parts[0]?.split("/");
      const date = dateParts && dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : null;
      return { date, startTime: null };
    };

    const createSession = async (
      name: string, sessionType: string, jsonUrl: string,
      sessionDate: string | null, startTime: string | null, parentSessionId: string | null
    ): Promise<string | null> => {
      const { data: newSession, error: sessionErr } = await adminClient
        .from("v2_sessions")
        .insert({
          event_id, name, session_type: sessionType as any, status: "draft" as any,
          sort_order: sortOrder++, source_document_url: jsonUrl,
          ...(sessionDate ? { date: sessionDate } : {}),
          ...(startTime ? { start_time: startTime } : {}),
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

    const insertResults = async (
      sessionId: string, entries: any[], sessionType: string, isOverallEndurance: boolean,
      hourNumber?: number, timeCardMap?: Map<string, Map<number, string>>
    ) => {
      const { raceRows, qualifyingRows, practiceRows } = buildResultRows(
        sessionId, entries, sessionType, driverMap, teamMap, carMap, isOverallEndurance, summary,
        hourNumber, timeCardMap
      );
      // Batch insert all at once
      const inserts: Promise<any>[] = [];
      if (raceRows.length > 0) inserts.push(adminClient.from("v2_race_results").insert(raceRows));
      if (qualifyingRows.length > 0) inserts.push(adminClient.from("v2_qualifying_results").insert(qualifyingRows));
      if (practiceRows.length > 0) inserts.push(adminClient.from("v2_practice_results").insert(practiceRows));
      await Promise.all(inserts);
    };

    // ── Weather processing from IMSA Weather JSON ─────────────────────
    
    // Build a map using a composite key: timestamp + optional HOUR N
    // E.g. "202601241340" for session-level, "202601241340_HOUR 1" for hour sub-sessions
    const weatherByKey = new Map<string, string>();
    for (const wl of allWeatherJsonLinks) {
      if (matchesSeriesFolder(wl)) {
        const decoded = decodeURIComponent(wl);
        const tsMatch = decoded.match(/\/(\d{12})_[^/]+\//);
        if (tsMatch) {
          const hourMatch = decoded.match(/HOUR\s*(\d+)/i);
          const key = hourMatch ? `${tsMatch[1]}_HOUR ${hourMatch[1]}` : tsMatch[1];
          weatherByKey.set(key, wl);
        }
      }
    }
    console.log(`Weather JSON mapped: ${weatherByKey.size} sessions`, Array.from(weatherByKey.keys()));

    // Estimate local hour from UTC timestamp string
    // Daytona is UTC-5, but we'll derive offset from the session_date vs UTC time
    function estimateLocalHour(utcTimeStr: string, utcOffset: number): number {
      // utcTimeStr like "1/22/2026 3:05:20 PM"
      const timePart = utcTimeStr.split(" ").slice(1).join(" "); // "3:05:20 PM"
      const isPM = timePart.toUpperCase().includes("PM");
      const hourStr = timePart.split(":")[0];
      let hour = parseInt(hourStr, 10);
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      // Apply UTC offset to get local hour
      let localHour = (hour + utcOffset + 24) % 24;
      return localHour;
    }

    function imWeatherEmoji(trackStatus: string, localHour?: number): string {
      const isNight = localHour !== undefined && (localHour >= 20 || localHour < 6);
      const isDusk = localHour !== undefined && (localHour >= 18 && localHour < 20);
      const isDawn = localHour !== undefined && (localHour >= 6 && localHour < 8);

      const s = (trackStatus || "").toLowerCase();
      if (s.includes("rain") || s.includes("wet")) {
        if (isNight) return "🌧️";
        return "🌧️";
      }
      if (s.includes("damp")) return "🌦️";
      if (s.includes("fog")) return "🌫️";
      if (isNight) return "🌙";
      if (isDusk) return "🌇";
      if (isDawn) return "🌅";
      if (s === "dry" || !s) return "☀️";
      return "🌤️";
    }

    const processImWeather = async (sessionId: string, weatherJsonUrl: string) => {
      try {
        const fullUrl = (() => { try { return new URL(weatherJsonUrl, baseUrl).href; } catch { return null; } })();
        if (!fullUrl) return;

        const resp = await fetchWithRetry(fullUrl);
        if (!resp.ok) return;
        const weatherData = await resp.json();

        const sessionWeather = weatherData.session?.weather;
        const samples = weatherData.meteoSamples || [];
        const units = weatherData.units || {};

        if (samples.length === 0 && !sessionWeather) return;

        const isF = (units.AirTemperature || "").includes("F");
        const toC = (f: number) => isF ? Math.round(((f - 32) * 5 / 9) * 10) / 10 : f;

        const isMph = (units.WindSpeed || "").includes("MPH");
        const toKmh = (mph: number) => isMph ? Math.round(mph * 1.60934) : mph;

        let airTemps: number[] = [];
        let trackTemps: number[] = [];
        let windSpeeds: number[] = [];
        let windDirs: number[] = [];
        let totalRainSamples = 0;

        for (const s of samples) {
          if (s.air_temp != null) airTemps.push(toC(s.air_temp));
          if (s.track_temp != null) trackTemps.push(toC(s.track_temp));
          if (s.wind_speed != null) windSpeeds.push(toKmh(s.wind_speed));
          if (s.wind_direction != null) windDirs.push(s.wind_direction);
          if (s.rain != null && s.rain > 0) totalRainSamples++;
        }

        // Determine UTC offset: session_date is local (24h), time_utc_str is UTC (12h AM/PM)
        // session_date "22/01/2026 10:05" = local 10:05
        // time_utc_str "1/22/2026 3:05:20 PM" = UTC 15:05
        // offset = local - UTC = 10 - 15 = -5
        let utcOffset = -5; // Default EST
        const sessionDateStr = weatherData.session?.session_date;
        if (sessionDateStr && samples.length > 0) {
          const localTimeMatch = sessionDateStr.match(/\d+\/\d+\/\d+\s+(\d+):(\d+)/);
          if (localTimeMatch) {
            const localH = parseInt(localTimeMatch[1], 10);
            const localM = parseInt(localTimeMatch[2], 10);
            const firstSample = samples[0];
            if (firstSample.time_utc_secconds) {
              // Use UTC epoch to get UTC hour directly
              const utcDate = new Date(firstSample.time_utc_secconds * 1000);
              const utcH = utcDate.getUTCHours();
              const utcM = utcDate.getUTCMinutes();
              // Compute offset in hours (local - UTC)
              const localMinutes = localH * 60 + localM;
              const utcMinutes = utcH * 60 + utcM;
              let diffMinutes = localMinutes - utcMinutes;
              if (diffMinutes > 720) diffMinutes -= 1440;
              if (diffMinutes < -720) diffMinutes += 1440;
              utcOffset = Math.round(diffMinutes / 60);
            }
          }
        }
        console.log(`UTC offset computed: ${utcOffset}`);

        // Track status from session summary  
        const trackStatus = sessionWeather?.track_status || "Dry";

        // Build emojis based on local time of day and conditions
        const emojiSet: string[] = [];
        const seenEmojis = new Set<string>();
        if (samples.length > 0) {
          // Sample a few points across the session for diverse emojis
          const indices = [0, Math.floor(samples.length / 2), samples.length - 1];
          for (const idx of indices) {
            const s = samples[idx];
            const localHour = estimateLocalHour(s.time_utc_str || "", utcOffset);
            const emoji = imWeatherEmoji(trackStatus, localHour);
            if (!seenEmojis.has(emoji)) {
              seenEmojis.add(emoji);
              emojiSet.push(emoji);
            }
          }
        } else {
          emojiSet.push(imWeatherEmoji(trackStatus));
        }

        const conditionEmoji = emojiSet.join("");

        // Build summary
        let conditionSummary = trackStatus;
        if (totalRainSamples > 0 && samples.length > 0) {
          const rainPct = Math.round((totalRainSamples / samples.length) * 100);
          conditionSummary = `${trackStatus} (rain ${rainPct}% of session)`;
        }

        const avgWindDir = windDirs.length > 0 ? Math.round(windDirs.reduce((a, b) => a + b, 0) / windDirs.length) : 0;
        const windDirStr = (() => {
          const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
          return dirs[Math.round(avgWindDir / 22.5) % 16];
        })();

        const windMin = windSpeeds.length > 0 ? Math.round(Math.min(...windSpeeds)) : null;
        const windMax = windSpeeds.length > 0 ? Math.round(Math.max(...windSpeeds)) : null;
        let windSummary: string | null = null;
        if (windMin !== null && windMax !== null) {
          if (windMax < 15) windSummary = "Light winds";
          else windSummary = `${windMin}–${windMax} km/h ${windDirStr}`;
        }

        // Use summary weather values as fallback if no samples
        let airMin = airTemps.length > 0 ? Math.round(Math.min(...airTemps) * 10) / 10 : null;
        let airMax = airTemps.length > 0 ? Math.round(Math.max(...airTemps) * 10) / 10 : null;
        let trkMin = trackTemps.length > 0 ? Math.round(Math.min(...trackTemps) * 10) / 10 : null;
        let trkMax = trackTemps.length > 0 ? Math.round(Math.max(...trackTemps) * 10) / 10 : null;

        // If no samples but session summary has temps, parse those
        if (airMin === null && sessionWeather?.air_temperature) {
          const parsed = parseFloat(sessionWeather.air_temperature);
          if (!isNaN(parsed)) { airMin = parsed; airMax = parsed; }
        }
        if (trkMin === null && sessionWeather?.track_temperature) {
          const parsed = parseFloat(sessionWeather.track_temperature);
          if (!isNaN(parsed)) { trkMin = parsed; trkMax = parsed; }
        }

        const weatherRecord = {
          session_id: sessionId,
          condition_summary: conditionSummary,
          condition_emoji: conditionEmoji,
          air_temp_min: airMin,
          air_temp_max: airMax,
          track_temp_min: trkMin,
          track_temp_max: trkMax,
          rain_mm: totalRainSamples > 0 ? totalRainSamples : 0,
          rain_detail: null,
          wind_summary: windSummary,
          wind_speed_min: windMin,
          wind_speed_max: windMax,
          wind_direction: windDirStr,
          hourly_data: samples.slice(0, 50),
          fetched_at: new Date().toISOString(),
        };

        await adminClient
          .from("v2_session_weather")
          .upsert(weatherRecord, { onConflict: "session_id" });
        console.log(`Weather upserted for session ${sessionId}: ${conditionEmoji} ${conditionSummary}`);
      } catch (err) {
        console.error(`Failed to process weather for session ${sessionId}:`, err);
      }
    };

    // Match a results JSON URL to its corresponding weather JSON URL
    // Use composite key: timestamp + optional HOUR N
    const weatherUrlForSession = (jsonUrl: string, hourNumber?: number): string | null => {
      const decoded = decodeURIComponent(jsonUrl);
      const tsMatch = decoded.match(/\/(\d{12})_[^/]+\//);
      if (tsMatch) {
        // Try hour-specific key first, then fall back to session-level
        if (hourNumber) {
          const hourKey = `${tsMatch[1]}_HOUR ${hourNumber}`;
          const hourUrl = weatherByKey.get(hourKey);
          if (hourUrl) return hourUrl;
        }
        return weatherByKey.get(tsMatch[1]) || null;
      }
      return null;
    };

    if (isEndurance) {
      // 1. Non-race sessions
      for (const f of fetchedResults.filter(f => f.kind === "nonrace")) {
        const sessionData = f.data.session || {};
        const sessionName = sessionData.session_name || "Unknown Session";
        const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");
        if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
        const entries = f.data.classification || [];
        if (entries.length === 0) continue;
        const { date: sessionDate, startTime } = parseSessionDateTime(sessionData);
        const sessionId = await createSession(sessionInfo.name, sessionInfo.type, f.url, sessionDate, startTime, null);
        if (!sessionId) continue;
        await insertResults(sessionId, entries, sessionInfo.type, false);
        // Process weather for this session
        const weatherUrl = weatherUrlForSession(f.url);
        if (weatherUrl) await processImWeather(sessionId, weatherUrl);
      }

      // 2. Fetch Time Card CSV for driver detection in hour sub-sessions
      let timeCardMap: Map<string, Map<number, string>> = new Map();
      const raceTimeCardLinks = allTimeCardLinks
        .filter(l => matchesSeriesFolder(l))
        .filter(l => {
          const decoded = decodeURIComponent(l).toLowerCase();
          return /\d+_race\//i.test(decoded);
        });

      if (raceTimeCardLinks.length > 0) {
        // Prefer the one in the highest hour folder (it covers the full race)
        const sortedByHour = raceTimeCardLinks.sort((a, b) => {
          const hourA = extractHourNumber(a) || 0;
          const hourB = extractHourNumber(b) || 0;
          return hourB - hourA;
        });
        const timeCardUrl = (() => { try { return new URL(sortedByHour[0], baseUrl).href; } catch { return null; } })();
        if (timeCardUrl) {
          console.log("Fetching Time Card CSV:", timeCardUrl);
          try {
            const tcResp = await fetchWithRetry(timeCardUrl);
            if (tcResp.ok) {
              const csvText = await tcResp.text();
              timeCardMap = parseTimeCardCSV(csvText);
              console.log(`Time Card data loaded for ${timeCardMap.size} cars`);
            } else {
              console.log(`Time Card CSV returned ${tcResp.status}`);
            }
          } catch (err) {
            console.error("Failed to fetch Time Card CSV:", err);
          }
        }
      } else {
        console.log("No Time Card CSV links found for this race");
      }

      // 3. Parent endurance_race session
      const raceSessionName = "Race";
      let parentSessionId: string | null = null;
      if (!existingSessionNames.has(raceSessionName)) {
        const sortedHourLinks = fetchedResults
          .filter(f => f.kind === "hour")
          .sort((a, b) => (a.hour || 0) - (b.hour || 0));
        const overallData = fetchedResults.find(f => f.kind === "overall");
        const raceDataSource = overallData || (sortedHourLinks.length > 0 ? sortedHourLinks[sortedHourLinks.length - 1] : null);
        let raceDate: string | null = null;
        let raceStartTime: string | null = null;
        if (raceDataSource) {
          const parsed = parseSessionDateTime(raceDataSource.data.session || {});
          raceDate = parsed.date;
          raceStartTime = parsed.startTime;
        }

        parentSessionId = await createSession(raceSessionName, "endurance_race", url, raceDate, raceStartTime, null);
        if (parentSessionId && raceDataSource) {
          const entries = raceDataSource.data.classification || [];
          await insertResults(parentSessionId, entries, "endurance_race", true);
        }
      } else {
        summary.sessions_skipped++;
        // Look up existing parent session so we can still update driver_ids from final hour
        const { data: existingParent } = await adminClient
          .from("v2_sessions")
          .select("id")
          .eq("event_id", event_id)
          .eq("name", raceSessionName)
          .single();
        if (existingParent) parentSessionId = existingParent.id;
      }

      // 4. Hour sub-sessions (using Time Card data for driver detection)
      // IMPORTANT: Derive hour dates/times from the parent Race date, NOT from individual JSON files.
      // The JSON files can have inconsistent dates. The Race date is the single source of truth.
      const sortedHours = fetchedResults
        .filter(f => f.kind === "hour")
        .sort((a, b) => (a.hour || 0) - (b.hour || 0));

      // Look up the parent Race session's date to use as base for all hours
      let raceDateForHours: string | null = raceDate;
      let raceStartForHours: string | null = raceStartTime;
      if (!raceDateForHours && parentSessionId) {
        const { data: parentRow } = await adminClient
          .from("v2_sessions")
          .select("date, start_time")
          .eq("id", parentSessionId)
          .single();
        if (parentRow) {
          raceDateForHours = parentRow.date ? (parentRow.date as string).split("T")[0] : null;
          raceStartForHours = parentRow.start_time || null;
        }
      }

      for (const f of sortedHours) {
        const hourSessionName = `Hour ${f.hour}`;
        if (existingSessionNames.has(hourSessionName)) { summary.sessions_skipped++; continue; }
        const entries = f.data.classification || [];
        if (entries.length === 0) continue;

        // Calculate this hour's date and time from the Race base date + start time
        let hourDate = raceDateForHours;
        let hourStart: string | null = null;
        let hourEnd: string | null = null;

        if (raceDateForHours && raceStartForHours) {
          const [sH, sM] = raceStartForHours.split(":").map(Number);
          if (!isNaN(sH) && !isNaN(sM)) {
            const hourOffset = (f.hour! - 1); // Hour 1 = offset 0
            const startMinutes = sH * 60 + sM + hourOffset * 60;
            const endMinutes = startMinutes + 60;

            const startInDay = startMinutes % 1440;
            const endInDay = endMinutes % 1440;
            const dayOffset = Math.floor(startMinutes / 1440);
            const crossesMidnight = startInDay > endInDay;

            // Calculate date with day offset
            const dp = raceDateForHours.split("-").map(Number);
            const dt = new Date(Date.UTC(dp[0], dp[1] - 1, dp[2] + dayOffset));
            hourDate = dt.toISOString().slice(0, 10);

            const fmt = (m: number) => {
              const h = Math.floor(m / 60) % 24;
              const min = m % 60;
              return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
            };
            hourStart = fmt(startInDay);
            hourEnd = crossesMidnight ? "23:59" : fmt(endInDay);
          }
        } else if (!hourDate) {
          // Fallback: use the hour JSON's own date if we have no race date at all
          const { date: fallbackDate } = parseSessionDateTime(f.data.session || {});
          hourDate = fallbackDate;
        }

        const childSessionId = await createSession(hourSessionName, "race", f.url, hourDate, hourStart, parentSessionId);
        if (!childSessionId) continue;
        if (hourEnd) {
          await adminClient.from("v2_sessions").update({ end_time: hourEnd } as any).eq("id", childSessionId);
        }
        await insertResults(childSessionId, entries, "race", false, f.hour, timeCardMap.size > 0 ? timeCardMap : undefined);
        // Process weather for this hour session (use hour-specific weather)
        const hourWeatherUrl = weatherUrlForSession(f.url, f.hour);
        if (hourWeatherUrl) await processImWeather(childSessionId, hourWeatherUrl);
      }

      // Note: Step 5 (updating parent race driver_ids) removed.
      // The parent endurance_race session now stores one row per driver in the car,
      // so there's no need to overwrite them with the final hour's driver.
    } else {
      // Standard flow - use all fetched results
      // For non-endurance, we may have fetched under nonRaceLinks but they include all
      for (const f of fetchedResults) {
        const sessionData = f.data.session || {};
        const sessionName = sessionData.session_name || "Unknown Session";
        const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");
        if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
        const entries = f.data.classification || [];
        if (entries.length === 0) continue;
        const { date: sessionDate, startTime } = parseSessionDateTime(sessionData);
        const sessionId = await createSession(sessionInfo.name, sessionInfo.type, f.url, sessionDate, startTime, null);
        if (!sessionId) continue;
        await insertResults(sessionId, entries, sessionInfo.type, false);
        // Process weather for this session
        const weatherUrl = weatherUrlForSession(f.url);
        if (weatherUrl) await processImWeather(sessionId, weatherUrl);
      }
    }

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
