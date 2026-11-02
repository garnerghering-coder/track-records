/* FIA World Endurance Championship scraper → normalized feed for scripts/import-normalized.mjs.
 *
 * Source: Wikipedia (season articles + race reports), via the MediaWiki API (cross-origin with
 * origin=*), so it runs in any browser tab. The official fiawec.com results only go back to 2025
 * and leave out the crews and the reasons for retirements, and the Al Kamel timing site is behind
 * a sign-in, so the race reports (which transcribe the official classification) are the most
 * complete open source. Sets window.__feed / window.__feedLog / window.__diffs.
 *
 * Points: WEC only scores full-season entries in Hypercar and LMGT3, so a car's class position
 * is not its points position. Each driver's points per round are read from the season's drivers'
 * standings grid (the scoring position in each round, bold = pole) and the points table
 * (by race duration), and stored on that driver's race row. LMP2 (Le Mans only) scores nothing.
 */
(async () => {
  const YEARS = window.__wecYears || [2024, 2025, 2026];
  const P = new DOMParser();
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’'`.]/g, "").replace(/[-–—_]/g, " ").replace(/\s+/g, " ").trim();
  const txt = (el) => { if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll("sup, .sr-only, style, .reference").forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const wiki = async (page) => {
    const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text&redirects=1&page=${encodeURIComponent(page)}`)).json();
    return j.parse ? P.parseFromString(j.parse.text["*"], "text/html") : null;
  };
  const headerOf = (t) => [...(t.querySelector("tr")?.children || [])].map((c) => txt(c));
  const findTables = (doc, re) => [...doc.querySelectorAll("table.wikitable")].filter((t) => re.test(headerOf(t).join("|")));
  const linkTitle = (a) => decodeURIComponent((a.getAttribute("href") || "").replace(/^(\.\/|\/wiki\/)/, "").split("#")[0]).replace(/_/g, " ");
  const titleOf = (cell) => { const a = [...(cell?.querySelectorAll("a[href]") || [])].find((x) => /^(\.\/|\/wiki\/)/.test(x.getAttribute("href")) && !x.closest("sup")); return a ? linkTitle(a) : ""; };
  /** table → rows of cell elements with rowspan/colspan expanded */
  const grid = (table) => {
    const out = [];
    [...table.querySelectorAll("tr")].forEach((tr, ri) => {
      out[ri] = out[ri] || [];
      let ci = 0;
      for (const cell of tr.children) {
        while (out[ri][ci] !== undefined) ci++;
        const rs = +cell.getAttribute("rowspan") || 1, cs = +cell.getAttribute("colspan") || 1;
        for (let r = 0; r < rs; r++) { out[ri + r] = out[ri + r] || []; for (let c = 0; c < cs; c++) out[ri + r][ci + c] = cell; }
        ci += cs;
      }
    });
    return out;
  };
  /** one entry per car: drop the continuation rows of two-row entries (same Pos and No. cells) */
  const entries = (g, iPos, iNo) => g.filter((r, i) => i > 0 && r[iPos] && r[iNo] && r[iPos] !== g[0][iPos] && /\d/.test(txt(r[iNo])) && !(g[i - 1] && g[i - 1][iPos] === r[iPos] && g[i - 1][iNo] === r[iNo]));
  /** names in a cell, one per line (<br> or list items); linked or not; flag title per line */
  const people = (cell) => {
    if (!cell) return [];
    const c = cell.cloneNode(true);
    c.querySelectorAll("sup, style, .sr-only, .reference").forEach((x) => x.remove());
    c.querySelectorAll("br").forEach((b) => b.replaceWith("\u2063"));
    c.querySelectorAll("li").forEach((li) => li.append("\u2063"));
    const flags = [];
    c.querySelectorAll(".flagicon").forEach((f) => { flags.push(f.querySelector("a[title]")?.getAttribute("title") || f.querySelector("img[alt]")?.getAttribute("alt") || null); f.replaceWith("\u2064"); });
    let fi = 0;
    return c.textContent.split("\u2063").map((seg) => {
      const flag = seg.includes("\u2064") ? flags[fi++] ?? null : null;
      return { name: seg.replace(/\u2064/g, "").replace(/\s+/g, " ").trim(), flag };
    }).filter((x) => x.name && !/^\(?R\)?$/.test(x.name));
  };
  const CIRCUIT = {
    "Imola Circuit": { name: "Autodromo Enzo e Dino Ferrari" },
    "Circuit de Spa-Francorchamps": { name: "Circuit de Spa-Francorchamps" },
    "Circuit de la Sarthe": { name: "Circuit de la Sarthe", layout: "24 Hours of Le Mans circuit" },
    "Interlagos Circuit": { name: "Autódromo José Carlos Pace (Interlagos)" },
    "Circuit of the Americas": { name: "Circuit of the Americas (COTA)", layout: "Grand Prix" },
    "Fuji Speedway": { name: "Fuji Speedway", layout: "Grand Prix" },
    "Bahrain International Circuit": { name: "Bahrain International Circuit", layout: "Grand Prix" },
    "Lusail International Circuit": { name: "Lusail International Circuit" },
    "Circuit de Barcelona-Catalunya": { name: "Circuit de Barcelona-Catalunya", layout: "Grand Prix" },
    "Monza Circuit": { name: "Autodromo Nazionale Monza" },
    "Silverstone Circuit": { name: "Silverstone Circuit" },
  };
  const CLASSES = [{ name: "Hypercar", color: "#dc2626" }, { name: "LMP2", color: "#2563eb" }, { name: "LMGT3", color: "#16a34a" }];
  const isClass = (c) => CLASSES.some((k) => norm(k.name) === norm(c));
  const coords = new Map();
  async function coordsOf(titles) {
    const want = titles.filter((t) => t && !coords.has(t));
    if (!want.length) return;
    const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&titles=${encodeURIComponent(want.join("|"))}`)).json();
    const back = new Map([...(j.query.redirects || []), ...(j.query.normalized || [])].map((r) => [r.to, r.from]));
    for (const p of Object.values(j.query.pages)) coords.set(back.get(p.title) || p.title, p.coordinates?.[0] ? { latitude: p.coordinates[0].lat, longitude: p.coordinates[0].lon } : {});
  }
  const durationOf = (scale, raceName) =>
    /24 hours/i.test(raceName) ? scale.find((s) => /24/.test(s.label)) : /\b8 hours|1812|10 hours/i.test(raceName) ? scale.find((s) => /\b8|10/.test(s.label) && !/24/.test(s.label)) : scale.find((s) => /^6/.test(s.label)) || scale[0];

  const feed = { series: { name: "FIA World Endurance Championship", short_name: "WEC", aliases: ["WEC", "World Endurance Championship"] }, seasons: [] };
  const log = [];
  const diffs = [];
  for (const YEAR of YEARS) {
    const sd = await wiki(`${YEAR} FIA World Endurance Championship`);
    // nationalities from the entry lists (flag icon before each driver link)
    const nat = new Map();
    for (const t of findTables(sd, /^Entrant\|Car\|Engine/)) for (const td of t.querySelectorAll("td")) for (const p of people(td)) if (p.flag && !nat.has(norm(p.name))) nat.set(norm(p.name), p.flag);
    const cal = findTables(sd, /^Rnd\|Race\|Circuit\|Location\|Date/)[0];
    const calRows = grid(cal).slice(1).filter((r) => /^\d+$/.test(txt(r[0])));
    const res = findTables(sd, /^Rnd\.?\|Circuit\|/)[0];
    const reportBy = new Map(grid(res).slice(1).filter((r) => /^\d+$/.test(txt(r[0]))).map((r) => [txt(r[0]), titleOf(r[r.length - 1])]));
    const pts = findTables(sd, /^Duration\|1st/)[0];
    const scale = [];
    if (pts) for (const r of grid(pts).slice(1)) { const c = r.map(txt); if (!c[0] || /source/i.test(c[0]) || !/\d/.test(c[1])) continue; scale.push({ label: c[0], pts: c.slice(1, 11).map(Number), pole: Number(c[11]) || 0 }); }
    // drivers' standings grids: driver -> round index -> {pos, pole}; and the official totals
    const scored = new Map();
    const totals = new Map();
    const display = new Map();
    for (const t of findTables(sd, /^Pos\.?\|Driver\|Team\|/)) {
      const H = headerOf(t);
      const first = 3, last = H.length - 1;
      for (const r of grid(t).slice(1)) {
        const name = txt(r[1]);
        if (!name || r[1].tagName !== "TD" && r[1].tagName !== "TH") continue;
        const tot = Number(txt(r[last]));
        if (!Number.isFinite(tot)) continue;
        totals.set(norm(name), (totals.get(norm(name)) || 0) + tot);
        display.set(norm(name), name);
        const per = scored.get(norm(name)) || [];
        for (let k = first; k < last; k++) {
          const cell = r[k];
          const v = txt(cell);
          const pos = /^\d+$/.test(v) ? Number(v) : null;
          const pole = !!cell?.querySelector("b, strong");
          if (!per[k - first] || (per[k - first].pos == null && !per[k - first].pole && (pos != null || pole))) per[k - first] = { pos, pole };
        }
        scored.set(norm(name), per);
      }
    }
    await coordsOf(calRows.map((r) => titleOf(r[2])));
    const season = { year: YEAR, is_multiclass: true, classes: CLASSES, events: [] };
    let roundIdx = -1;
    for (const cr of calRows) {
      roundIdx++;
      const rn = txt(cr[0]);
      const raceName = txt(cr[1]), circuitTitle = titleOf(cr[2]), circuitText = txt(cr[2]), location = txt(cr[3]);
      const report = reportBy.get(rn) || `${YEAR} ${raceName}`;
      const d = await wiki(report);
      if (!d) { log.push(`${YEAR} R${rn} ${raceName}: no race report (${report})`); continue; }
      const race = findTables(d, /^Pos\.?\|Class\|No\.?\|(Team|Entrant)\|Drivers\|(Chassis|Car)/)[0];
      if (!race) { log.push(`${report}: no race classification table`); continue; }
      const H = headerOf(race).map((h) => h.toLowerCase());
      const col = (re) => H.findIndex((h) => re.test(h));
      const ci = { pos: 0, cls: col(/^class/), no: col(/^no/), team: col(/^(team|entrant)/), drv: col(/^drivers/), chassis: col(/^(chassis|car)/), laps: col(/^laps/), time: col(/^time/) };
      const ib = txt(d.querySelector(".infobox"));
      const len = ib.match(/(?:Course|Circuit) length\s*([\d.]+)\s*km/i);
      const dates = [];
      const dm = ib.match(/Date\s+(\d{1,2})(?:[–-](\d{1,2}))? ([A-Z][a-z]+) (\d{4})/);
      if (dm) for (const day of [dm[1], dm[2] || dm[1]]) dates.push(new Date(`${day} ${dm[3]} ${dm[4]} 12:00 UTC`).toISOString().slice(0, 10));
      const map = CIRCUIT[circuitTitle] || { name: circuitText };
      const dur = durationOf(scale, raceName);
      const ev = {
        name: report, short_name: raceName.replace(/^(TotalEnergies|Rolex|Bapco Energies|Qatar Airways|Lone Star) (?=\d|Le Mans)/, ""), round: rn, start_date: dates[0] || null, end_date: dates[1] || dates[0] || null,
        circuit: { name: map.name, aliases: [circuitTitle, circuitText], location, country: null, ...(coords.get(circuitTitle) || {}), layout: { name: map.layout || "Grand Prix", length_km: len ? Number(len[1]) : null } },
        sessions: [],
      };
      // a pole point needs a timed qualifying (none when it was cancelled, e.g. Fuji 2026)
      const qTable = findTables(d, /^Pos\.?\|Class\|No\.?\|(Entrant|Team)\|Qualifying/)[0];
      const timedQuali = !!qTable && /\d:\d{2}\.\d/.test(txt(qTable));
      // race
      const g = grid(race);
      const results = [];
      const clsPos = {};
      let overall = 0;
      for (const r of entries(g, ci.pos, ci.no)) {
        const t = r.map(txt);
        const cls = t[ci.cls];
        if (!isClass(cls)) continue;
        const posTxt = t[ci.pos];
        const numeric = /^\d+$/.test(posTxt);
        const timeTxt = (t[ci.time] || "").replace(/[‡†*]/g, "").trim();
        if (numeric) clsPos[cls] = (clsPos[cls] || 0) + 1;
        const cp = numeric ? clsPos[cls] : null;
        overall++;
        const drivers = people(r[ci.drv]).map(({ name: raw }) => {
          // same person, other spelling (e.g. "Răzvan" / "Petru Umbrărescu"): match the standings by surname
          let name = raw;
          if (!scored.has(norm(raw))) {
            const last = norm(raw).split(" ").pop();
            const cand = [...scored.keys()].filter((k) => k.split(" ").pop() === last);
            if (cand.length === 1) name = display.get(cand[0]);
          }
          const sc = scored.get(norm(name))?.[roundIdx];
          const p = /lmp2/i.test(cls) || !dur ? null : totals.get(norm(name)) === 0 ? 0 : sc ? (sc.pos ? dur.pts[sc.pos - 1] || 0 : 0) + (sc.pole && timedQuali ? dur.pole : 0) : 0;
          return { name, nationality: nat.get(norm(name)) || null, points: p };
        });
        const [manufacturer, ...model] = (t[ci.chassis] || "").split(" ");
        results.push({
          position: overall, position_text: posTxt, class: cls, class_position: cp,
          status: numeric ? "finished" : /^dsq/i.test(posTxt) ? "dsq" : /^dns/i.test(posTxt) ? "dns" : "dnf", dnf_reason: numeric ? null : timeTxt || posTxt,
          car_number: t[ci.no], team: t[ci.team], car: { manufacturer, model: model.join(" ") }, laps: Number(t[ci.laps]) || 0,
          total_time: numeric && overall === 1 ? timeTxt : null, gap: numeric && overall > 1 && /^\+/.test(timeTxt) ? timeTxt : null,
          points: /lmp2/i.test(cls) ? null : 0, driver: drivers[0] || { name: "Unknown" }, drivers: drivers.slice(1),
        });
      }
      // qualifying (class order; Hyperpole time when the car reached it)
      const q = findTables(d, /^Pos\.?\|Class\|No\.?\|(Entrant|Team)\|Qualifying/)[0];
      if (q) {
        const QH = headerOf(q).map((h) => h.toLowerCase());
        const qi = { pos: 0, cls: QH.findIndex((h) => /^class/.test(h)), no: QH.findIndex((h) => /^no/.test(h)), team: QH.findIndex((h) => /^(entrant|team)/.test(h)), qual: QH.findIndex((h) => /^qualifying/.test(h)), hp: QH.findIndex((h) => /^hyperpole/.test(h)), grid: QH.findIndex((h) => /^grid/.test(h)) };
        const qr = [];
        const cpos = {};
        let n = 0;
        for (const r of entries(grid(q), qi.pos, qi.no)) {
          const c = r.map(txt);
          const cls = c[qi.cls];
          if (!isClass(cls)) continue;
          const rr = results.find((x) => x.car_number === c[qi.no]);
          if (!rr) continue;
          const time = (qi.hp >= 0 && /\d:\d/.test(c[qi.hp]) ? c[qi.hp] : c[qi.qual]) || null;
          cpos[cls] = (cpos[cls] || 0) + 1;
          qr.push({
            position: ++n, class: cls, class_position: cpos[cls], car_number: c[qi.no], team: rr.team, car: rr.car,
            driver: { name: rr.driver.name }, drivers: rr.drivers.map((x) => ({ name: x.name })), best_lap: /\d/.test(time || "") ? time : null,
            extra: qi.grid >= 0 && /^\d+$/.test(c[qi.grid]) ? { grid: Number(c[qi.grid]) } : {},
          });
        }
        if (qr.length) ev.sessions.push({ name: "Qualifying", type: "qualifying", date: dates[0] || null, results: qr });
      }
      ev.sessions.push({ name: "Race", type: "endurance_race", date: dates[dates.length - 1] || null, source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(report.replace(/ /g, "_"))}`, results });
      if (!ev.circuit.latitude) log.push(`${report}: no coordinates for ${circuitTitle}`);
      if (!dur) log.push(`${report}: no points row`);
      season.events.push(ev);
    }
    // compare stored points with the standings totals
    const mine = new Map();
    for (const e of season.events) for (const s of e.sessions) for (const r of s.results) for (const dd of [r.driver, ...(r.drivers || [])]) if (dd.points) mine.set(norm(dd.name), (mine.get(norm(dd.name)) || 0) + dd.points);
    for (const [k, v] of totals) if (Math.abs((mine.get(k) || 0) - v) > 0.01) diffs.push(`${YEAR} ${k}: standings ${v}, stored ${mine.get(k) || 0}`);
    log.push(`${YEAR}: ${season.events.length} events, ${totals.size} drivers in the standings, points rows ${scale.map((s) => s.label).join(" / ")}`);
    feed.seasons.push(season);
  }
  window.__feed = feed;
  window.__feedLog = log;
  window.__diffs = diffs;
  return { log, diffs: diffs.length, sample: diffs.slice(0, 30) };
})();
