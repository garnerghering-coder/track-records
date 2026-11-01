#!/usr/bin/env node
/**
 * Car side-profile liveries for an NTT INDYCAR SERIES season, from INDYCAR's
 * official car illustrations (the ones on indycar.com team and driver pages:
 * /-/media/IndyCar/Cars/<year>/IndyCar-Series/Liveries/<RoadStreet|Oval|Indy500>/<car>-<name>.png).
 *
 *   node --experimental-strip-types scripts/indycar-liveries.mjs --year 2026 [--teams] [--urls list.txt]
 *        [--cache <dir>] [--force] [--dry-run]
 *
 *   --teams   collect the illustration URLs from the indycar.com team pages (current season only)
 *   --urls    a file with one indycar.com media URL or path per line
 *   --force   replace liveries that already exist
 *
 * For each car number the road/street illustration is preferred, then oval, then Indianapolis 500.
 * Images face right on indycar.com; they are flipped so the nose points left like the
 * other liveries, trimmed to the car and saved as
 * public/media/car-liveries/<seasonId>/<car>.png with a v2_car_liveries row.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";
import { createSource } from "./lib/indycar-source.mjs";

const { values: a } = parseArgs({
  options: {
    year: { type: "string" },
    teams: { type: "boolean", default: false },
    urls: { type: "string" },
    cache: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!a.year || (!a.teams && !a.urls)) {
  console.error("usage: scripts/indycar-liveries.mjs --year <yyyy> (--teams | --urls <file>) [--cache dir] [--force] [--dry-run]");
  process.exit(2);
}
const src = createSource({ cacheDir: a.cache || path.join(os.tmpdir(), "indycar-cache") });
const TEAM_PAGES = [
  "AJ-Foyt-Enterprises", "Abel-Motorsports", "Andretti-Global", "Arrow-McLaren", "Chip-Ganassi-Racing", "Dale-Coyne-Racing",
  "Dreyer-and-Reinbold-Racing", "Ed-Carpenter-Racing", "HMD-AJ-Foyt", "Juncos-Hollinger-Racing", "Meyer-Shank-Racing",
  "Rahal-Letterman-Lanigan-Racing", "Team-Penske",
];

/* collect candidate URLs */
const found = new Set();
if (a.teams) {
  for (const t of TEAM_PAGES) {
    const html = (await src.media(`https://www.indycar.com/teams/${t}`))?.toString("utf8") || "";
    for (const m of html.matchAll(/\/-\/media\/IndyCar\/Cars\/(\d{4})\/IndyCar-Series\/Liveries\/[^"?]+\.png/g)) if (m[1] === a.year) found.add(m[0]);
  }
}
if (a.urls) for (const l of fs.readFileSync(a.urls, "utf8").split("\n")) {
  const m = l.trim().match(/\/-\/media\/IndyCar\/Cars\/(\d{4})\/IndyCar-Series\/Liveries\/[^"?\s]+\.png/i);
  if (m && m[1] === a.year) found.add(m[0]);
}
const rank = (u) => (/\/RoadStreet\//i.test(u) ? 0 : /\/Oval\//i.test(u) ? 1 : 2);
const byCar = new Map();
for (const u of [...found].sort()) {
  const car = path.basename(u).match(/^(\d+)-/)?.[1];
  if (!car) continue;
  const cur = byCar.get(car);
  if (!cur || rank(u) < rank(cur)) byCar.set(car, u);
}
console.error(`${found.size} illustrations, ${byCar.size} cars`);

/* season */
const store = openStore({ writable: !a["dry-run"] });
const series = (await store.from("v2_series").select("*")).data.find((s) => /INDYCAR/.test(s.name));
const season = (await store.from("v2_seasons").select("*")).data.find((s) => s.series_id === series.id && s.year === Number(a.year));
if (!season) throw new Error(`no ${a.year} INDYCAR season`);
const existing = (await store.from("v2_car_liveries").select("*")).data.filter((l) => l.season_id === season.id);
// only cars that raced (or entered) this season
const events = (await store.from("v2_events").select("id")).data;
const sessions = new Set((await store.from("v2_sessions").select("id, event_id").in("event_id", (await store.from("v2_events").select("id").eq("season_id", season.id)).data.map((e) => e.id))).data.map((s) => s.id));
const seasonCars = new Set();
for (const t of ["v2_race_results", "v2_qualifying_results", "v2_practice_results"]) for (const r of (await store.from(t).select("session_id, car_number")).data) if (sessions.has(r.session_id)) seasonCars.add(String(r.car_number));
void events;

/* render: flip, trim, export with Playwright */
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(path.dirname(process.execPath), "../lib/node_modules/playwright")));
}
const browser = await chromium.launch();
const page = await browser.newPage();
const outDir = path.join(ROOT, "public", "media", "car-liveries", season.id);
fs.mkdirSync(outDir, { recursive: true });
let added = 0;
for (const [car, u] of byCar) {
  if (!seasonCars.has(car)) {
    console.error(`  skip #${car}: not in the ${a.year} results`);
    continue;
  }
  if (existing.some((l) => String(l.car_number) === car) && !a.force) continue;
  const buf = await src.media(`https://www.indycar.com${u}?w=1280`);
  if (!buf) {
    console.error(`  #${car}: ${u} not found`);
    continue;
  }
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  const png = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.translate(img.width, 0);
    g.scale(-1, 1); // nose left
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    const out = document.createElement("canvas");
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const scale = Math.min(1, 1000 / w); // ~1000 px wide, like the other liveries
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    const og = out.getContext("2d");
    og.imageSmoothingQuality = "high";
    og.drawImage(c, x0, y0, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }, dataUrl);
  if (!png) continue;
  const file = path.join(outDir, `${car}.png`);
  if (!a["dry-run"]) {
    fs.writeFileSync(file, Buffer.from(png.split(",")[1], "base64"));
    // shrink to a 256-colour palette PNG (~40 KB instead of ~400 KB) when Pillow is available
    try {
      execFileSync("python3", ["-I", "-c", "import sys;from PIL import Image;f=sys.argv[1];Image.open(f).convert('RGBA').quantize(colors=256,method=Image.Quantize.FASTOCTREE).save(f,optimize=True)", file]);
    } catch {}
  }
  const image_url = `/media/car-liveries/${season.id}/${car}.png`;
  const row = existing.find((l) => String(l.car_number) === car);
  if (!a["dry-run"]) {
    if (row) await store.from("v2_car_liveries").update({ image_url }).eq("id", row.id);
    else await store.from("v2_car_liveries").insert({ season_id: season.id, car_number: car, image_url });
  }
  added++;
  console.error(`  #${car} <- ${path.basename(u)}`);
}
await browser.close();
const missing = [...seasonCars].filter((c) => !byCar.has(c) && !existing.some((l) => String(l.car_number) === c)).sort((x, y) => Number(x) - Number(y));
console.error(`${added} liveries written; no illustration for: ${missing.join(", ") || "none"}`);
if (!a["dry-run"]) await store.flush();
