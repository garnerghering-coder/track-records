#!/usr/bin/env node
/**
 * Formula 1 images: car liveries (official F1 media CDN team car renders) and
 * track maps (Wikimedia Commons SVGs) for the F1 seasons in the data store.
 *
 *   node --experimental-strip-types scripts/f1-media.mjs [--liveries] [--maps] [--cache <dir>] [--force]
 *
 * Liveries: one side-profile render per team per season from
 *   https://media.formula1.com/image/upload/common/f1/<year>/<slug>/<year><slug>carleft.png
 * (transparent PNG, nose left — the "carright" variant faces right; flipping it
 * would mirror the sponsor lettering, so the left-facing render is used), trimmed to
 * the car, scaled to 1000 px wide, saved for every car number the team ran
 * that season (race, sprint, qualifying and practice entries) as
 * public/media/car-liveries/<seasonId>/<carNumber>.png + a v2_car_liveries row.
 * A number used by two teams in one season (2025: #22 and #30 swapped between
 * Red Bull and Racing Bulls after round 2) gets the livery of the team it raced
 * with most.
 *
 * Track maps: layouts in MAPS below without an image are rendered from their
 * Commons SVG with the track's strokes recoloured white (as the existing maps; the
 * site inverts them in light mode), labels and decorations
 * removed, on a transparent background, trimmed, 1200 px wide →
 * public/media/circuit-layouts/<layoutId>.png; credits go to docs/CREDITS.md.
 *
 * Needs Playwright's Chromium (require("playwright"), already used by the
 * repo's checks); no extra npm packages.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";

const require = createRequire(import.meta.url);
const { values: a } = parseArgs({
  options: {
    liveries: { type: "boolean", default: false },
    maps: { type: "boolean", default: false },
    cache: { type: "string" },
    force: { type: "boolean", default: false },
  },
});
const doAll = !a.liveries && !a.maps;
const CACHE = a.cache || process.env.F1_CACHE || path.join(ROOT, ".cache/f1");
fs.mkdirSync(path.join(CACHE, "media"), { recursive: true });
const SERIES_NAME = "Formula 1";
const UA = "TrackRecords/1.0 (static motorsport results archive; garnerghering@gmail.com)";

/* team row full_name → CDN slug per season */
const SLUGS = {
  "Red Bull Racing": { all: "redbullracing" },
  "Scuderia Ferrari": { all: "ferrari" },
  "McLaren F1 Team": { all: "mclaren" },
  "Mercedes-AMG Petronas F1 Team": { all: "mercedes" },
  "Aston Martin F1 Team": { all: "astonmartin" },
  "Alpine F1 Team": { all: "alpine" },
  "Williams Racing": { all: "williams" },
  "Racing Bulls": { 2024: "rb", all: "racingbulls" },
  "Sauber F1 Team": { all: "kicksauber" },
  "Haas F1 Team": { 2024: "haas", all: "haasf1team" },
  "Audi F1 Team": { all: "audi" },
  "Cadillac F1 Team": { all: "cadillac" },
};

/* Commons maps for layouts that have no image yet (circuit name → file). */
const MAPS = {
  Madring: {
    file: "Madring (2026).svg",
    url: "https://upload.wikimedia.org/wikipedia/commons/2/25/Madring_%282026%29.svg",
    author: "GabrielStella, Cherkash",
    license: "CC BY-SA 3.0",
    keep: ["path1"],
  },
  "Sepang International Circuit": {
    file: "Sepang.svg",
    url: "https://upload.wikimedia.org/wikipedia/commons/6/67/Sepang.svg",
    author: "Will Pittenger",
    license: "CC BY-SA 3.0",
    keep: ["path4136"],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url) {
  const file = path.join(CACHE, "media", crypto.createHash("sha1").update(url).digest("hex") + path.extname(new URL(url).pathname));
  if (fs.existsSync(file)) return file;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      await sleep(15000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (/^\s*<!DOCTYPE html/i.test(buf.subarray(0, 40).toString())) throw new Error(`error page instead of image: ${url}`);
    fs.writeFileSync(file, buf);
    await sleep(1500);
    return file;
  }
  throw new Error(`rate limited: ${url}`);
}

const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");

/** Flip (optional), trim transparent margins, scale to `width`; returns PNG bytes. */
async function processRaster(file, { flip, width }) {
  const src = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  const out = await page.evaluate(
    async ({ src, flip, width }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      if (flip) {
        g.translate(c.width, 0);
        g.scale(-1, 1);
      }
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (data[(y * c.width + x) * 4 + 3] > 12) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const scale = width / w;
      const o = document.createElement("canvas");
      o.width = width;
      o.height = Math.round(h * scale);
      const og = o.getContext("2d");
      og.imageSmoothingQuality = "high";
      og.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
      return o.toDataURL("image/png");
    },
    { src, flip, width },
  );
  return Buffer.from(out.split(",")[1], "base64");
}

/**
 * Render an SVG as a white outline on transparent, trimmed, `width` px wide
 * (like the existing maps: the site's `.logo-adapt` inverts them to black in light mode).
 * `keep` lists the ids of the elements that draw the track itself; everything
 * else (turn numbers, labels, arrows, pit lane, start line, backgrounds) is
 * dropped, and the kept strokes/fills are recoloured white.
 */
async function processSvg(file, { width, keep }) {
  const svg = fs.readFileSync(file, "utf8");
  const out = await page.evaluate(
    async ({ svg, width, keep }) => {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const root = doc.documentElement;
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:0;top:0";
      host.appendChild(document.importNode(root, true));
      document.body.appendChild(host);
      const live = host.querySelector("svg");
      const kept = keep.map((id) => live.querySelector(`[id="${id}"]`)).filter(Boolean);
      if (kept.length !== keep.length) throw new Error(`missing ids: ${keep.filter((id) => !live.querySelector(`[id="${id}"]`)).join(", ")}`);
      const shapes = "path, line, polyline, polygon, rect, circle, ellipse, text, image, use";
      for (const el of [...live.querySelectorAll(shapes)]) {
        if (el.closest("defs, clipPath, mask, pattern, marker")) continue;
        if (!kept.some((k) => k === el || k.contains(el))) el.remove();
      }
      // a bold, even line like the existing maps: stroke ≈ 1.8% of the track's width
      const box = live.getBBox();
      const rootScale = Math.hypot(live.getScreenCTM().a, live.getScreenCTM().b) || 1;
      const target = Math.max(box.width, box.height) * 0.018;
      for (const k of kept)
        for (const el of [k, ...k.querySelectorAll(shapes)]) {
          const ctm = el.getScreenCTM();
          const local = ctm ? Math.hypot(ctm.a, ctm.b) / rootScale : 1;
          el.style.strokeWidth = String(target / (local || 1));
          el.style.strokeLinejoin = "round";
          el.style.strokeLinecap = "round";
          const cs = getComputedStyle(el);
          const hasStroke = cs.stroke && cs.stroke !== "none";
          const hasFill = cs.fill && cs.fill !== "none";
          el.style.stroke = hasStroke ? "#fff" : "none";
          el.style.fill = hasFill ? "#fff" : "none";
          el.style.opacity = el.style.strokeOpacity = el.style.fillOpacity = "1";
          el.style.filter = "none";
        }
      const xml = new XMLSerializer().serializeToString(live);
      host.remove();
      const img = new Image();
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
      await img.decode();
      const nw = img.naturalWidth || width, nh = img.naturalHeight || width;
      const scaleUp = Math.max(1, (width * 2) / nw);
      const c = document.createElement("canvas");
      c.width = Math.round(nw * scaleUp);
      c.height = Math.round(nh * scaleUp);
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, c.width, c.height);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (data[(y * c.width + x) * 4 + 3] > 12) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const pad = 6;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const o = document.createElement("canvas");
      o.width = width;
      o.height = Math.round((h * width) / w);
      const og = o.getContext("2d");
      og.imageSmoothingQuality = "high";
      og.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
      return o.toDataURL("image/png");
    },
    { svg, width, keep },
  );
  return Buffer.from(out.split(",")[1], "base64");
}

const store = openStore({ writable: true });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const all = async (t) => must(await store.from(t).select("*"), t) || [];
const report = [];

const series = (await all("v2_series")).find((s) => s.name === SERIES_NAME);
if (!series) throw new Error("F1 series not imported yet (scripts/import-f1.mjs)");
const seasons = (await all("v2_seasons")).filter((s) => s.series_id === series.id).sort((x, y) => x.year - y.year);
const events = await all("v2_events");
const sessions = await all("v2_sessions");

if (doAll || a.liveries) {
  const teams = new Map((await all("v2_teams")).map((t) => [t.id, t.full_name]));
  const liveries = await all("v2_car_liveries");
  const [race, quali, prac] = await Promise.all(["v2_race_results", "v2_qualifying_results", "v2_practice_results"].map(all));
  for (const season of seasons) {
    const sids = new Set(sessions.filter((s) => events.some((e) => e.id === s.event_id && e.season_id === season.id)).map((s) => s.id));
    // car number → team, weighted towards race entries
    const votes = new Map();
    const vote = (r, w) => {
      if (!sids.has(r.session_id) || !r.car_number || !r.team_id) return;
      const k = String(r.car_number);
      if (!votes.has(k)) votes.set(k, new Map());
      votes.get(k).set(r.team_id, (votes.get(k).get(r.team_id) || 0) + w);
    };
    race.forEach((r) => vote(r, 10));
    quali.forEach((r) => vote(r, 3));
    prac.forEach((r) => vote(r, 1));
    const dir = path.join(ROOT, "public/media/car-liveries", season.id);
    fs.mkdirSync(dir, { recursive: true });
    const rendered = new Map(); // teamId → png bytes
    for (const [num, byTeam] of [...votes].sort((x, y) => Number(x[0]) - Number(y[0]))) {
      const ranked = [...byTeam].sort((x, y) => y[1] - x[1]);
      const teamId = ranked[0][0];
      const teamName = teams.get(teamId);
      if (ranked.length > 1) report.push(`${season.year} #${num}: used by ${ranked.map(([t]) => teams.get(t)).join(" and ")}; livery of ${teamName}`);
      const slugDef = SLUGS[teamName];
      if (!slugDef) {
        report.push(`${season.year} #${num}: no CDN slug for ${teamName}`);
        continue;
      }
      const slug = slugDef[season.year] || slugDef.all;
      const out = path.join(dir, `${num}.png`);
      if (!fs.existsSync(out) || a.force) {
        if (!rendered.has(teamId)) {
          const src = await download(`https://media.formula1.com/image/upload/common/f1/${season.year}/${slug}/${season.year}${slug}carleft.png`);
          rendered.set(teamId, await processRaster(src, { flip: false, width: 1000 }));
        }
        fs.writeFileSync(out, rendered.get(teamId));
      }
      const image_url = `/media/car-liveries/${season.id}/${num}.png`;
      const existing = liveries.find((l) => l.season_id === season.id && String(l.car_number) === num);
      if (!existing) must(await store.from("v2_car_liveries").insert({ season_id: season.id, car_number: num, image_url }), "liveries");
      else if (existing.image_url !== image_url) must(await store.from("v2_car_liveries").update({ image_url }).eq("id", existing.id), "liveries");
    }
    report.push(`${season.year}: ${votes.size} car numbers with liveries (${rendered.size || "cached"} team renders)`);
  }
}

if (doAll || a.maps) {
  const circuits = await all("v2_circuits");
  const layouts = await all("v2_circuit_layouts");
  const f1Layouts = new Set(events.filter((e) => seasons.some((s) => s.id === e.season_id)).map((e) => e.layout_id));
  const credits = [];
  for (const id of f1Layouts) {
    const layout = layouts.find((l) => l.id === id);
    const circuit = circuits.find((c) => c.id === layout?.circuit_id);
    if (!layout) continue;
    const file = layout.layout_image_url && path.join(ROOT, "public", layout.layout_image_url);
    if (file && fs.existsSync(file) && !a.force) continue;
    const def = MAPS[circuit.name];
    if (!def) {
      if (!(file && fs.existsSync(file))) report.push(`map missing: ${circuit.name} / ${layout.name} (no Commons file configured)`);
      continue;
    }
    let png;
    try {
      png = await processSvg(await download(def.url), { width: 1200, keep: def.keep });
    } catch (e) {
      report.push(`map failed: ${circuit.name} / ${layout.name}: ${e.message}`);
      continue;
    }
    const rel = `/media/circuit-layouts/${layout.id}.png`;
    fs.writeFileSync(path.join(ROOT, "public", rel), png);
    must(await store.from("v2_circuit_layouts").update({ layout_image_url: rel }).eq("id", layout.id), "layouts");
    credits.push(`| ${circuit.name} — ${layout.name} | [File:${def.file}](https://commons.wikimedia.org/wiki/File:${encodeURIComponent(def.file.replace(/ /g, "_"))}) | ${def.author} | ${def.license} |`);
    report.push(`map: ${circuit.name} / ${layout.name} ← ${def.file}`);
  }
  if (credits.length) {
    const credPath = path.join(ROOT, "docs/CREDITS.md");
    let text = fs.existsSync(credPath) ? fs.readFileSync(credPath, "utf8") : "# Credits\n\nImages that are not our own, with their authors and licences.\n";
    if (!text.includes("## Track maps (Wikimedia Commons)")) text += "\n## Track maps (Wikimedia Commons)\n\nRecoloured to a black outline on a transparent background.\n\n| Layout | Source file | Author | Licence |\n|---|---|---|---|\n";
    for (const line of credits) if (!text.includes(line.split(" | ")[1])) text = text.replace(/(\|---\|---\|---\|---\|\n(?:\|.*\|\n)*)/, `$1${line}\n`);
    fs.writeFileSync(credPath, text);
  }
}

await browser.close();
await store.flush();
console.log(report.join("\n"));
