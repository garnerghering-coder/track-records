#!/usr/bin/env node
/**
 * Fill v2_session_weather for every session that has none, from Open-Meteo's
 * historical archive (circuit coordinates + session date/time), reusing the
 * importer's weather code. Responses are cached by URL, so sessions of one
 * event share a request.
 *   node --experimental-strip-types scripts/backfill-weather.mjs [--series "NASCAR"] [--limit N]
 */
import { openStore } from "./lib/local-store.mjs";
import { fetchSessionWeather } from "../supabase/functions/fetch-session-weather/core.ts";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const seriesFilter = arg("--series"); const limit = Number(arg("--limit") || Infinity);
const store = openStore({ writable: true });
const all = async (t, sel = "*") => (await store.from(t).select(sel)).data || [];
const [sessions, events, seasons, series, weather] = await Promise.all([
  all("v2_sessions"), all("v2_events"), all("v2_seasons"), all("v2_series"), all("v2_session_weather", "session_id"),
]);
const have = new Set(weather.map((w) => w.session_id));
const ev = new Map(events.map((e) => [e.id, e])), se = new Map(seasons.map((s) => [s.id, s])), sr = new Map(series.map((s) => [s.id, s]));
const todo = sessions.filter((s) => {
  if (have.has(s.id)) return false;
  const e = ev.get(s.event_id); const name = sr.get(se.get(e?.season_id)?.series_id)?.name || "";
  return !seriesFilter || name.toLowerCase().includes(seriesFilter.toLowerCase());
}).slice(0, limit);

const cache = new Map();
const politeFetch = async (url, init) => {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(url, init);
        if (r.status !== 429) return { status: r.status, ok: r.ok, body: await r.text() };
        await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
      }
      return { status: 429, ok: false, body: "" };
    })());
    await new Promise((res) => setTimeout(res, 250));
  }
  const c = await cache.get(url);
  return new Response(c.body, { status: c.status });
};

let ok = 0, failed = 0;
for (const s of todo) {
  try { await fetchSessionWeather(s.id, store, { fetch: politeFetch }); ok++; }
  catch (e) { failed++; if (failed <= 10) console.log(`  ${s.name} (${s.id.slice(0, 8)}): ${e.message}`); }
  if ((ok + failed) % 50 === 0) console.log(`  … ${ok + failed}/${todo.length}`);
}
await store.flush();
console.log(`weather: ${ok} sessions filled, ${failed} failed, ${cache.size} Open-Meteo requests`);
