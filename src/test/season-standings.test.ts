/**
 * The championship written at build time (scripts/build-derived.mjs, through
 * the Node store) must match what the browser computes from the full results
 * tables, which is what pages fall back to when the file is missing.
 * Runs on the real data in data/ (skipped when it is absent).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { parseNdjson } from "@/integrations/supabase/local-db";
import { buildChampionship, championshipFile, loadSeasonStandingsInput, type Championship } from "@/lib/season-standings";
import { computeDriverStandings } from "@/lib/standings";
import { computeChampionship, loadChampionship } from "@/lib/standings-data";
import { openStore } from "../../scripts/lib/local-store.mjs";
import { readSchema } from "../../scripts/build-data.mjs";

const DATA = path.resolve(__dirname, "../../data");
const hasData = fs.existsSync(path.join(DATA, "v2_race_results.ndjson"));

/** 2025 IMSA WeatherTech SportsCar Championship */
const SEASON = "c9991d6f-9437-4b23-b5d7-001a36316865";

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => body,
});

/** Serves /data/* the way the static site does, from data/*.ndjson. */
function serveData(precomputed: Record<string, Championship> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const p = decodeURIComponent(String(url)).replace(/^.*?\/data\//, "");
    if (p === "_schema.json") return json(readSchema());
    if (p.startsWith("derived/standings/")) {
      const id = p.slice("derived/standings/".length, -".json".length);
      return precomputed[id] ? json(precomputed[id]) : json(null, 404);
    }
    const file = path.join(DATA, p.replace(/\.json$/, ".ndjson"));
    return fs.existsSync(file) ? json(parseNdjson(fs.readFileSync(file, "utf8"))) : json(null, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Exactly what build-derived.mjs writes for a season. */
async function buildTimeChampionship(seasonId: string): Promise<Championship> {
  return JSON.parse(JSON.stringify(buildChampionship(await loadSeasonStandingsInput(openStore(), seasonId))));
}

describe.skipIf(!hasData)("precomputed season standings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("match the client-side computation for a real season", async () => {
    const built = await buildTimeChampionship(SEASON);
    serveData();
    const client = await computeChampionship(SEASON);
    expect(built.rounds.length).toBeGreaterThan(0);
    expect(built).toEqual(JSON.parse(JSON.stringify(client)));

    // The page-level loader falls back to the same computation when the file is missing.
    const fetchMock = serveData();
    const fallback = await loadChampionship(SEASON);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(championshipFile(SEASON)))).toBe(true);
    expect(JSON.parse(JSON.stringify(fallback))).toEqual(built);
  });

  it("drive the homepage and driver-page standings unchanged", async () => {
    const built = await buildTimeChampionship(SEASON);
    const fetchMock = serveData({ [SEASON]: built });
    vi.resetModules(); // fresh loader caches
    const { fetchSeasonStandings } = await import("@/site/data");
    const st = await fetchSeasonStandings(SEASON);
    // Only the precomputed file is downloaded, never the results tables.
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([`/data/${championshipFile(SEASON)}`]);

    // Reference: the previous client-side implementation of fetchSeasonStandings.
    const input = await loadSeasonStandingsInput(openStore(), SEASON);
    const order = [...new Set(input.sessions.map((s) => s.eventId))];
    const sessionEvent = new Map(input.sessions.map((s) => [s.id, s.eventId]));
    const expected = new Map<string, { driverId: string; position: number; totalPoints: number; name: string; cumulative: number[] }[]>();
    for (const s of computeDriverStandings(input.sessions, input.rows)) {
      let acc = 0;
      const cumulative = order.map((ev) => (acc += s.results.filter((r) => sessionEvent.get(r.sessionId) === ev).reduce((n, r) => n + r.points, 0)));
      if (!expected.has(s.className)) expected.set(s.className, []);
      expected.get(s.className)!.push({ driverId: s.driverId, position: s.position, totalPoints: s.totalPoints, name: input.drivers.get(s.driverId)?.name || "Unknown", cumulative });
    }
    expect(st.rounds).toBe(order.length);
    expect(st.byClass.map((c) => c.className)).toEqual([...expected.keys()]);
    for (const c of st.byClass) {
      const want = [...expected.get(c.className)!].sort((a, b) => a.position - b.position);
      expect(c.rows.map(({ driverId, position, totalPoints, name, cumulative }) => ({ driverId, position, totalPoints, name, cumulative }))).toEqual(want);
    }

    const gtp = st.byClass.find((c) => c.className === "GTP")!;
    const champs = gtp.rows.filter((r) => r.position === 1);
    expect(champs.map((r) => r.name).sort()).toEqual(["Mathieu Jaminet", "Matt Campbell"]);
    expect(champs.every((r) => r.totalPoints === 2907)).toBe(true);
  });
});
