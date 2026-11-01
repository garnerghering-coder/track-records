#!/usr/bin/env node
/**
 * Render a circuit map (an SVG or PNG from Wikimedia Commons) as a track-layout image:
 * a single-colour WHITE line on a transparent background, cropped tight, ~1200 px wide
 * (the site's .logo-adapt class inverts it to black in day mode), saved as
 * public/media/circuit-layouts/<layoutId>.png and set as the layout's layout_image_url.
 *
 *   node --experimental-strip-types scripts/render-track-map.mjs --in map.svg --layout <v2_circuit_layouts.id> \
 *     [--keep-text] [--drop "#ff0000,#00ff00"] [--min-dark 0.25] [--dry-run]
 *
 *   --keep-text  keep SVG <text> (labels are removed by default)
 *   --drop       remove pixels close to these colours (legends, pit lane, alternative layouts);
 *                --drop-tol sets how close (sum of RGB differences, default 90)
 *   --min-dark   ignore pixels lighter than this (0 = white … 1 = black; default 0.18)
 *   --keep       keep only connected shapes at least this fraction of the largest one's size
 *                (default 0.15: drops corner numbers, arrows, labels drawn as paths, scale bars)
 * Record the source file's author and licence in docs/CREDITS.md.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";

const { values: a } = parseArgs({
  options: {
    in: { type: "string" },
    layout: { type: "string" },
    "keep-text": { type: "boolean", default: false },
    drop: { type: "string" },
    "min-dark": { type: "string" },
    keep: { type: "string" },
    "drop-tol": { type: "string" },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!a.in || !a.layout) {
  console.error("usage: scripts/render-track-map.mjs --in <file.svg|png> --layout <layoutId> [--keep-text] [--drop #rrggbb,...] [--min-dark 0.18] [--dry-run]");
  process.exit(2);
}
let src;
if (a.in.endsWith(".svg")) {
  let svg = fs.readFileSync(a.in, "utf8");
  if (!a["keep-text"]) svg = svg.replace(/<text[\s\S]*?<\/text>/g, "").replace(/<flowRoot[\s\S]*?<\/flowRoot>/g, "");
  src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
} else src = `data:image/png;base64,${fs.readFileSync(a.in).toString("base64")}`;
const drop = (a.drop || "").split(",").filter(Boolean).map((h) => [1, 3, 5].map((i) => parseInt(h.replace("#", "").padEnd(6, "0").slice(i - 1, i + 1), 16)));
const minDark = a["min-dark"] != null ? Number(a["min-dark"]) : 0.18;
const keepFrac = a.keep != null ? Number(a.keep) : 0.15;

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(path.dirname(process.execPath), "../lib/node_modules/playwright")));
}
const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(
  async ({ src, drop, minDark, keepFrac, dropTol }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = 2400;
    const H = Math.round((img.naturalHeight || img.height) * (W / (img.naturalWidth || img.width)));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, W, H);
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < d.length; i += 4) {
      const [r, gg, b, al] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      let keep = al / 255;
      if (drop.some(([R, G, B]) => Math.abs(R - r) + Math.abs(G - gg) + Math.abs(B - b) < dropTol)) keep = 0;
      const dark = 1 - (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
      keep *= Math.max(0, Math.min(1, (dark - (minDark - 0.1)) / 0.1));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(255 * keep);
      if (d[i + 3] > 24) {
        const p = i / 4, x = p % W, y = (p / W) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    // connected shapes (8-neighbour) of visible pixels; keep the big ones
    const lab = new Int32Array(W * H).fill(-1);
    const sizes = [];
    const stack = [];
    for (let p = 0; p < W * H; p++) {
      if (lab[p] !== -1 || d[p * 4 + 3] <= 24) continue;
      const id2 = sizes.length;
      let n = 0;
      lab[p] = id2;
      stack.push(p);
      while (stack.length) {
        const q = stack.pop();
        n++;
        const qx = q % W, qy = (q / W) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const r2 = ny * W + nx;
            if (lab[r2] === -1 && d[r2 * 4 + 3] > 24) {
              lab[r2] = id2;
              stack.push(r2);
            }
          }
      }
      sizes.push(n);
    }
    const big = Math.max(0, ...sizes);
    x0 = W; y0 = H; x1 = -1; y1 = -1;
    for (let p = 0; p < W * H; p++) {
      const l = lab[p];
      if (l === -1 || sizes[l] < big * keepFrac) {
        d[p * 4 + 3] = 0;
        continue;
      }
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    g.putImageData(id, 0, 0);
    if (x1 < 0) return null;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    const w = x1 - x0 + 1 + 2 * pad, h = y1 - y0 + 1 + 2 * pad;
    const scale = 1200 / w;
    const out = document.createElement("canvas");
    out.width = 1200;
    out.height = Math.round(h * scale);
    const og = out.getContext("2d");
    og.imageSmoothingQuality = "high";
    og.drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  },
  { src, drop, minDark, keepFrac, dropTol: Number(a["drop-tol"] ?? 90) },
);
await browser.close();
if (!png) throw new Error("nothing left to draw");
const rel = `/media/circuit-layouts/${a.layout}.png`;
const file = a.out || path.join(ROOT, "public", rel);
fs.writeFileSync(file, Buffer.from(png.split(",")[1], "base64"));
console.error(`wrote ${file}`);
if (!a["dry-run"] && !a.out) {
  const store = openStore({ writable: true });
  const { data } = await store.from("v2_circuit_layouts").update({ layout_image_url: rel }).eq("id", a.layout).select("id");
  if (!data?.length) throw new Error(`layout ${a.layout} not found`);
  await store.flush();
}
