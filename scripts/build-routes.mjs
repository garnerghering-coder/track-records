#!/usr/bin/env node
/**
 * After `vite build`: give every content page a real HTML file so static
 * hosting answers 200 (not the SPA 404 fallback) and search engines see a
 * page-specific <title> and description. Also writes dist/sitemap.xml and
 * dist/404.html.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const DATA = path.join(ROOT, "data");
const SITE = "https://track-records.com";

const read = (t) =>
  fs.existsSync(path.join(DATA, `${t}.ndjson`))
    ? fs.readFileSync(path.join(DATA, `${t}.ndjson`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
function page(route, title, description) {
  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace("</head>", `  <link rel="canonical" href="${SITE}${route}" />\n  </head>`);
  const dir = path.join(DIST, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return route;
}

const seasons = Object.fromEntries(read("v2_seasons").map((s) => [s.id, s]));
const series = Object.fromEntries(read("v2_series").map((s) => [s.id, s]));
const circuits = Object.fromEntries(read("v2_circuits").map((c) => [c.id, c]));
const T = (s) => `${s} | Track Records`;

const routes = [];
for (const [r, t, d] of [
  ["/results", "Race results", "Every sportscar race on the record, with class winners, replays and analysis."],
  ["/series", "Championships", "IMSA championships season by season: points races and standings."],
  ["/drivers", "Drivers", "Career records for every driver on the record."],
  ["/teams", "Teams", "Team records, line-ups and results."],
  ["/cars", "Cars", "Every car on the record and how it fared."],
  ["/circuits", "Circuits", "Circuit records: character, lap records and winners by year."],
  ["/calendar", "Calendar", "The sportscar racing calendar."],
  ["/compare", "Compare drivers", "Put any two drivers head to head."],
  ["/articles", "Articles", "Analysis and features from Track Records."],
  ["/privacy", "Privacy policy", "How Track Records handles data."],
])
  routes.push(page(r, T(t), d));

for (const e of read("v2_events").filter((e) => e.status === "published")) {
  const s = seasons[e.season_id];
  const sr = s && series[s.series_id];
  const c = circuits[e.circuit_id];
  routes.push(page(`/events/${e.id}`, T(`${e.name} – results & replay`), `Results, race replay and analysis for the ${e.name}${c ? ` at ${c.name}` : ""}${sr ? ` (${sr.name})` : ""}.`));
}
for (const d of read("v2_drivers")) routes.push(page(`/driver/${d.id}`, T(d.full_name), `${d.full_name}'s racing record: starts, wins, podiums and every result.`));
for (const t of read("v2_teams")) routes.push(page(`/team/${t.id}`, T(t.full_name), `${t.full_name}: line-ups, entries and results.`));
for (const c of read("v2_cars")) routes.push(page(`/car/${c.id}`, T(c.model_name), `${c.manufacturer ? `${c.manufacturer} ` : ""}${c.model_name}: teams, liveries and results.`));
for (const c of Object.values(circuits)) routes.push(page(`/circuit/${c.id}`, T(c.name), `${c.name}: circuit character, lap records and winners by year.`));
for (const s of Object.values(series)) routes.push(page(`/series/${s.id}`, T(s.name), `${s.name}: standings, points race and every round.`));

fs.copyFileSync(path.join(DIST, "index.html"), path.join(DIST, "404.html"));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ["/", ...routes].map((r) => `  <url><loc>${SITE}${r}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`,
);
console.log(`routes: ${routes.length} pages + sitemap`);
