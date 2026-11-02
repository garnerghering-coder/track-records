/* FIA World Endurance Championship scraper → normalized feed for scripts/import-normalized.mjs.
 *
 * Source: Wikipedia (season articles + race reports), via the MediaWiki API (cross-origin with
 * origin=*), so it runs in any browser tab. The official fiawec.com results only go back to 2025,
 * leave out the crews and the reasons for retirements, and the Al Kamel timing site is behind a
 * sign-in, so the race reports (which transcribe the official classification) are the most
 * complete open source. Sets window.__feed / window.__feedLog.
 *
 * Points: computed per class from the season's points table (duration rows, pole point) for
 * Hypercar and LMGT3 (LMP2 races only at Le Mans and scores no WEC points). The caller compares
 * the totals with the season's drivers' standings table before importing.
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
  // Wikipedia circuit article → the circuit's name on the site (shared with F1 / IMSA / INDYCAR rows)
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
  const coords = new Map();
  async function coordsOf(titles) {
    const want = titles.filter((t) => t && !coords.has(t));
    if (!want.length) return;
    const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&titles=${encodeURIComponent(want.join("|"))}`)).json();
    const back = new Map([...(j.query.redirects || []), ...(j.query.normalized || [])].map((r) => [r.to, r.from]));
    for (const p of Object.values(j.query.pages)) coords.set(back.get(p.title) || p.title, p.coordinates?.[0] ? { latitude: p.coordinates[0].lat, longitude: p.coordinates[0].lon } : {});
  }

  const feed = { series: { name: "FIA World Endurance Championship", short_name: "WEC", aliases: ["WEC", "World Endurance Championship"] }, seasons: [] };
  const log = [];
  const check = {};
  for (const YEAR of YEARS) {
    const sd = await wiki(`${YEAR} FIA World Endurance Championship`);
    // nationalities from the entry lists (flag icons)
    const nat = new Map();
    for (const t of findTables(sd, /^Entrant\|Car\|Engine/)) for (const a of t.querySelectorAll("td a[href]")) {
      const flag = a.closest("td")?.querySelectorAll(".flagicon");
      if (!flag?.length) continue;
      const span = a.previousElementSibling?.classList?.contains("flagicon") ? a.previousElementSibling : [...flag].find((f) => f.nextElementSibling === a || f.parentElement === a.parentElement);
      const country = span?.querySelector("a[title], img[alt]")?.getAttribute("title") || null;
      if (country && !nat.has(norm(txt(a)))) nat.set(norm(txt(a)), country);
    }
    // calendar
    const cal = findTables(sd, /^Rnd\|Race\|Circuit\|Location\|Date/)[0];
    const calRows = grid(cal).slice(1).filter((r) => /^\d+$/.test(txt(r[0])));
    const res = findTables(sd, /^Rnd\.?\|Circuit\|/)[0];
    const reportBy = new Map(grid(res).slice(1).filter((r) => /^\d+$/.test(txt(r[0]))).map((r) => [txt(r[0]), titleOf(r[r.length - 1])]));
    // points table: duration label -> [1st..10th], pole
    const pts = findTables(sd, /^Duration\|1st/)[0];
    const scale = [];
    if (pts) for (const r of grid(pts).slice(1)) { const c = r.map(txt); if (!c[0]) continue; scale.push({ label: c[0], pts: c.slice(1, 11).map(Number), pole: Number(c[11]) || 0 }); }
    await coordsOf(calRows.map((r) => titleOf(r[2])));
    const season = { year: YEAR, is_multiclass: true, classes: CLASSES, events: [] };
    check[YEAR] = { scale: scale.map((s) => s.label) };
    for (const cr of calRows) {
      const rn = txt(cr[0]);
      const raceName = txt(cr[1]), circuitTitle = titleOf(cr[2]), circuitText = txt(cr[2]), location = txt(cr[3]);
      const report = reportBy.get(rn) || `${YEAR} ${raceName}`;
      const d = await wiki(report);
      if (!d) { log.push(`${YEAR} R${rn} ${raceName}: no race report ${report}`); continue; }
      const race = findTables(d, /^Pos\|Class\|No\.?\|(Team|Entrant)\|Drivers\|Chassis/)[0];
      if (!race) { log.push(`${report}: no race classification table`); continue; }
      const H = headerOf(race).map((h) => h.toLowerCase());
      const col = (re) => H.findIndex((h) => re.test(h));
      const ci = { pos: 0, cls: col(/^class/), no: col(/^no/), team: col(/^(team|entrant)/), drv: col(/^drivers/), chassis: col(/^chassis/), laps: col(/^laps/), time: col(/^time/) };
      const rows = [...race.querySelectorAll("tr")].filter((tr) => tr.children.length >= H.length - 1 && tr.querySelector("td"));
      const ib = txt(d.querySelector(".infobox"));
      const len = ib.match(/(?:Course|Circuit) length\s*([\d.]+)\s*km/i);
      const dateM = ib.match(/Date\s+(\d{1,2}(?:[–-]\d{1,2})? [A-Z][a-z]+ \d{4})/);
      const dates = [];
      if (dateM) { const [, s] = dateM; const m = s.match(/^(\d{1,2})(?:[–-](\d{1,2}))? ([A-Z][a-z]+ \d{4})$/); if (m) { const d1 = new Date(`${m[1]} ${m[3]} 12:00 UTC`), d2 = new Date(`${m[2] || m[1]} ${m[3]} 12:00 UTC`); dates.push(d1.toISOString().slice(0, 10), d2.toISOString().slice(0, 10)); } }
      const map = CIRCUIT[circuitTitle] || { name: circuitText };
      const durRow = scale.find((s) => norm(raceName).includes(norm(s.label))) || scale.find((s) => /24/.test(s.label) && /24 hours/i.test(raceName)) || scale.find((s) => /8/.test(s.label) && /8 hours|1812/i.test(raceName)) || scale.find((s) => /6 hours/i.test(s.label)) || scale[0];
      const ev = {
        name: report, short_name: raceName.replace(/^(TotalEnergies|Rolex|Bapco Energies|Qatar Airways) /, ""), round: rn, start_date: dates[0] || null, end_date: dates[1] || dates[0] || null,
        circuit: { name: map.name, aliases: [circuitTitle, circuitText], location, country: null, ...(coords.get(circuitTitle) || {}), layout: { name: map.layout || "Grand Prix", length_km: len ? Number(len[1]) : null } },
        sessions: [],
      };
      // qualifying (class order; Hyperpole time when run)
      const q = findTables(d, /^Pos\|Class\|No\.?\|(Entrant|Team)\|Qualifying/)[0];
      const poleOf = new Map();
      if (q) {
        const QH = headerOf(q).map((h) => h.toLowerCase());
        const qi = { cls: QH.findIndex((h) => /^class/.test(h)), no: QH.findIndex((h) => /^no/.test(h)), team: QH.findIndex((h) => /^(entrant|team)/.test(h)), qual: QH.findIndex((h) => /^qualifying/.test(h)), hp: QH.findIndex((h) => /^hyperpole/.test(h)), grid: QH.findIndex((h) => /^grid/.test(h)) };
        const results = [];
        let n = 0;
        const clsPos = {};
        for (const tr of [...q.querySelectorAll("tr")].filter((x) => x.querySelector("td") && x.children.length >= QH.length - 1)) {
          const c = [...tr.children].map(txt);
          const cls = c[qi.cls]; if (!cls || !CLASSES.some((k) => norm(k.name) === norm(cls))) continue;
          const time = (qi.hp >= 0 && /\d:\d/.test(c[qi.hp]) ? c[qi.hp] : c[qi.qual]) || null;
          clsPos[cls] = (clsPos[cls] || 0) + 1;
          if (clsPos[cls] === 1) poleOf.set(c[qi.no], cls);
          results.push({ position: ++n, class: cls, class_position: clsPos[cls], car_number: c[qi.no], team: c[qi.team], best_lap: /\d/.test(time || "") ? time : null, extra: qi.grid >= 0 && /^\d+$/.test(c[qi.grid]) ? { grid: Number(c[qi.grid]) } : {} });
        }
        if (results.length) ev.sessions.push({ name: "Qualifying", type: "qualifying", date: dates[0] || null, results, _carOnly: true });
      }
      // race
      const results = [];
      const clsPos = {};
      const leaderLaps = {};
      let overall = 0;
      for (const tr of rows) {
        const c = [...tr.children];
        const t = c.map(txt);
        const cls = t[ci.cls];
        if (!CLASSES.some((k) => norm(k.name) === norm(cls))) continue;
        const posTxt = t[ci.pos];
        const numeric = /^\d+$/.test(posTxt);
        const laps = Number(t[ci.laps]) || 0;
        const timeTxt = t[ci.time].replace(/[‡†*]/g, "").trim();
        if (numeric) { clsPos[cls] = (clsPos[cls] || 0) + 1; if (clsPos[cls] === 1) leaderLaps[cls] = laps; }
        const drivers = [...c[ci.drv].querySelectorAll("a[href]")].filter((a) => !a.closest("sup") && !a.closest(".flagicon")).map((a) => ({ name: txt(a), nationality: nat.get(norm(txt(a))) || null }));
        const [manufacturer, ...model] = t[ci.chassis].split(" ");
        const status = numeric ? "finished" : /^dsq/i.test(posTxt) ? "dsq" : /^dns/i.test(posTxt) ? "dns" : "dnf";
        const cp = numeric ? clsPos[cls] : null;
        const scoring = numeric && /hypercar|lmgt3/i.test(cls) && durRow;
        let points = scoring ? (durRow.pts[cp - 1] || 0) : 0;
        if (/hypercar|lmgt3/i.test(cls) && poleOf.get(t[ci.no]) === cls && durRow) points += durRow.pole;
        results.push({
          position: ++overall, position_text: posTxt, class: cls, class_position: cp, status, dnf_reason: numeric ? null : timeTxt || posTxt,
          car_number: t[ci.no], team: t[ci.team], car: { manufacturer, model: model.join(" ") }, laps,
          total_time: numeric && cp === 1 && overall === 1 ? timeTxt : null,
          gap: numeric && overall > 1 ? (/^\+/.test(timeTxt) ? timeTxt : null) : null,
          points: /lmp2/i.test(cls) ? null : points,
          driver: drivers[0] || { name: "Unknown" }, drivers: drivers.slice(1),
        });
      }
      ev.sessions.push({ name: "Race", type: "endurance_race", date: dates[1] || dates[0] || null, source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(report.replace(/ /g, "_"))}`, results });
      // qualifying rows have no crews in the table: copy the race crew and car for each number
      const qs = ev.sessions.find((s) => s._carOnly);
      if (qs) {
        for (const r of qs.results) { const rr = results.find((x) => x.car_number === r.car_number); if (rr) Object.assign(r, { driver: rr.driver, drivers: rr.drivers, car: rr.car, team: r.team || rr.team }); else r.driver = { name: "Unknown" }; }
        qs.results = qs.results.filter((r) => r.driver.name !== "Unknown");
        // the pole point is stored with the race result (the official tables add it to the race total)
        for (const r of qs.results) delete r.points;
        delete qs._carOnly;
      }
      if (!ev.circuit.latitude) log.push(`${report}: no coordinates for ${circuitTitle}`);
      if (!durRow) log.push(`${report}: no points row`);
      season.events.push(ev);
    }
    // standings to check against: driver -> points
    const st = findTables(sd, /^Pos\.?\|Driver\|/);
    check[YEAR].standings = {};
    for (const t of st) for (const r of grid(t).slice(1)) {
      const name = txt(r[1]); const p = Number(txt(r[r.length - 1])); if (name && Number.isFinite(p)) check[YEAR].standings[norm(name)] = p;
    }
    feed.seasons.push(season);
  }
  // compare: sum of stored race points per driver vs the standings tables
  const diffs = [];
  for (const s of feed.seasons) {
    const mine = {};
    for (const e of s.events) for (const x of e.sessions) for (const r of x.results) if (r.points) for (const d of [r.driver, ...(r.drivers || [])]) mine[norm(d.name)] = (mine[norm(d.name)] || 0) + r.points;
    const want = check[s.year].standings;
    let n = 0;
    for (const [k, v] of Object.entries(want)) { n++; if (Math.abs((mine[k] || 0) - v) > 0.01) diffs.push(`${s.year} ${k}: standings ${v}, computed ${mine[k] || 0}`); }
    log.push(`${s.year}: ${s.events.length} events, ${n} drivers in standings, scale rows ${check[s.year].scale.join(" / ")}`);
  }
  window.__feed = feed;
  window.__feedLog = log;
  window.__diffs = diffs;
  return { log, diffs: diffs.length, sample: diffs.slice(0, 30) };
})();
