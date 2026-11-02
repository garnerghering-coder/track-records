/* Formula E scraper → normalized feed for scripts/import-normalized.mjs.
 *
 * Run in a browser tab on https://www.fiaformulae.com (same-origin requests to the official
 * results pages; Wikipedia's API answers cross-origin with origin=*). Sets window.__feed.
 *
 *   Official results pages: classification, grid, time/gap, points for practice, qualifying, race.
 *   Wikipedia (season article + race report): car numbers, powertrains, laps, retirement
 *   reasons, course length, circuit coordinates.
 *   Official driver pages: nationality, date of birth.
 *
 * Seasons are stored under the year they end in (Season 12, 2025–26 → 2026).
 */
(async () => {
  const SEASONS = [
    { S: 10, year: 2024, wiki: "2023–24 Formula E World Championship" },
    { S: 11, year: 2025, wiki: "2024–25 Formula E World Championship" },
    { S: 12, year: 2026, wiki: "2025–26 Formula E World Championship" },
  ].filter((s) => !window.__feSeasons || window.__feSeasons.includes(s.S));
  const SESSIONS = { "free-practice-1": ["Practice 1", "practice"], "free-practice-2": ["Practice 2", "practice"], "free-practice-3": ["Practice 3", "practice"], qualifying: ["Qualifying", "qualifying"], race: ["Race", "race"] };
  const COUNTRY = { "Great Britain": "United Kingdom", USA: "United States", "United States of America": "United States", Holland: "Netherlands" };
  // no timers: hidden tabs throttle setTimeout to once a minute. Requests stay sequential.
  const sleep = () => Promise.resolve();
  const P = new DOMParser();
  const html = async (u) => { await sleep(150); return P.parseFromString(await (await fetch(u)).text(), "text/html"); };
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`.]/g, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const txt = (el) => { if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll("sup, .sr-only, style, .reference").forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const wiki = async (page) => {
    await sleep(100);
    const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text&redirects=1&page=${encodeURIComponent(page)}`)).json();
    return j.parse ? P.parseFromString(j.parse.text["*"], "text/html") : null;
  };
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
  const headerOf = (t) => [...(t.querySelector("tr")?.children || [])].map((c) => txt(c));
  const findTable = (doc, re) => [...doc.querySelectorAll("table.wikitable")].filter((t) => re.test(headerOf(t).join("|")));
  const titleOf = (cell) => {
    const a = [...(cell?.querySelectorAll("a[href]") || [])].find((x) => /^(\.\/|\/wiki\/)/.test(x.getAttribute("href")) && !x.closest("sup"));
    return a ? decodeURIComponent(a.getAttribute("href").replace(/^(\.\/|\/wiki\/)/, "").split("#")[0]).replace(/_/g, " ") : "";
  };

  const drivers = new Map(); // slug -> {nationality, date_of_birth}
  async function driverInfo(slug, name) {
    if (drivers.has(slug)) return drivers.get(slug);
    const d = await html(`/en/drivers/${slug}`);
    const t = (d.querySelector("main") || d.body).textContent.replace(/\s+/g, " ");
    const dob = t.match(/DOB\s*(\d{1,2} [A-Z][a-z]{2} \d{4})/);
    const at = t.indexOf(name, Math.max(0, t.indexOf("All drivers")));
    const nat = at >= 0 ? (t.slice(at + name.length).match(/^\s*([A-Z][a-z]+(?: [A-Z][a-z]+)*?)(?=[A-Z]{2,}|\s*Car no)/) || [])[1] : null;
    const info = { nationality: nat ? COUNTRY[nat] || nat : null, date_of_birth: dob ? new Date(dob[1] + " 12:00 UTC").toISOString().slice(0, 10) : null };
    drivers.set(slug, info);
    return info;
  }

  const coords = new Map();
  async function coordsOf(titles) {
    const want = titles.filter((t) => t && !coords.has(t));
    for (let i = 0; i < want.length; i += 40) {
      const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&titles=${encodeURIComponent(want.slice(i, i + 40).join("|"))}`)).json();
      const back = new Map((j.query.redirects || []).map((r) => [r.to, r.from]));
      const normd = new Map((j.query.normalized || []).map((r) => [r.to, r.from]));
      for (const p of Object.values(j.query.pages)) {
        let t = p.title; t = back.get(t) || t; t = normd.get(t) || t;
        coords.set(t, p.coordinates?.[0] ? { latitude: p.coordinates[0].lat, longitude: p.coordinates[0].lon } : {});
      }
    }
  }

  const feed = { series: { name: "ABB FIA Formula E World Championship", short_name: "Formula E", aliases: ["Formula E", "FE", "FIA Formula E World Championship"] }, seasons: [] };
  const log = [];
  for (const SE of SEASONS) {
    const wdoc = await wiki(SE.wiki);
    // entries: driver -> {no, team, powertrain}
    const entry = new Map();
    const teamCase = new Map();
    for (const t of findTable(wdoc, /^Team\|Powertrain\|No/)) {
      const g = grid(t);
      for (const row of g.slice(1)) {
        if (!row[2]) continue;
        const team = txt(row[0]), pt = txt(row[1]), no = txt(row[2]).replace(/\D/g, "");
        teamCase.set(norm(team), team);
        for (const a of row[3].querySelectorAll("a")) if (a.closest("sup") == null) entry.set(norm(txt(a)), { no, team, powertrain: pt, wikiName: txt(a) });
      }
    }
    // calendar + report links
    const cal = findTable(wdoc, /^Round\|E-Prix\|Country\|Circuit\|Date/)[0];
    const calRows = grid(cal).slice(1).filter((r) => /^\d+$/.test(txt(r[0])));
    const res = findTable(wdoc, /^Round\|E-Prix\|Pole/)[0];
    const reportBy = new Map(grid(res).slice(1).filter((r) => /^\d+$/.test(txt(r[0]))).map((r) => [txt(r[0]), titleOf(r[r.length - 1])]));
    await coordsOf(calRows.map((r) => titleOf(r[3])));
    const reports = new Map();
    const season = { year: SE.year, events: [] };
    const roundsDoc = await html(`/en/results-and-standings?tab=races&season=${SE.S}`);
    const rounds = [...new Set([...roundsDoc.querySelectorAll('a[href*="round="]')].map((a) => a.getAttribute("href").match(/round=([^&]+)/)[1]))];
    for (const slug of rounds) {
      const rn = String(parseInt(slug, 10));
      const cr = calRows.find((r) => txt(r[0]) === rn);
      if (!cr) { log.push(`S${SE.S} ${slug}: not in Wikipedia calendar`); continue; }
      const eprix = txt(cr[1]).replace(/ePrix/i, "E-Prix"), country = txt(cr[2]), circuitTitle = titleOf(cr[3]), circuitName = txt(cr[3]);
      const dateTxt = txt(cr[4]);
      const date = new Date(dateTxt.replace(/^(\d+)[–-]\d+/, "$1") + " 12:00 UTC");
      const iso = isNaN(date) ? null : date.toISOString().slice(0, 10);
      const reportTitle = reportBy.get(rn);
      if (reportTitle && !reports.has(reportTitle)) reports.set(reportTitle, await wiki(reportTitle));
      const rep = reportTitle ? reports.get(reportTitle) : null;
      const sameReport = reportTitle ? calRows.filter((r) => reportBy.get(txt(r[0])) === reportTitle).map((r) => txt(r[0])) : [rn];
      const raceIdx = sameReport.indexOf(rn);
      const raceTables = rep ? findTable(rep, /Pos.*\|No.*\|Driver\|Team\|Laps\|Time/) : [];
      const wikiRace = new Map();
      if (raceTables[raceIdx]) for (const row of grid(raceTables[raceIdx]).slice(1)) {
        if (!row[2] || row[0] === row[1]) continue;
        wikiRace.set(norm(txt(row[2])), { pos: txt(row[0]), no: txt(row[1]).replace(/\D/g, ""), laps: txt(row[4]).replace(/\D/g, ""), time: txt(row[5]), name: txt(row[2]) });
      }
      const infoboxes = rep ? [...rep.querySelectorAll(".infobox")] : [];
      const ib = txt(infoboxes[Math.min(raceIdx, infoboxes.length - 1)] || infoboxes[0]);
      const len = ib.match(/Course length\s*([\d.]+)\s*km/);
      const doubleHeader = sameReport.length > 1;
      const year = iso ? iso.slice(0, 4) : SE.year;
      const ev = {
        name: `${year} ${eprix}${doubleHeader ? ` Race ${raceIdx + 1}` : ""}`, short_name: eprix.replace(/ E-Prix$/, "") + (doubleHeader ? ` R${raceIdx + 1}` : ""), round: rn,
        start_date: iso, end_date: iso,
        circuit: { name: circuitName, aliases: [circuitTitle], location: eprix.replace(/ E-Prix$/, ""), country, ...(coords.get(circuitTitle) || {}),
          layout: { name: "Formula E Circuit", length_km: len ? Number(len[1]) : null } },
        sessions: [],
      };
      const rd = await html(`/en/results-and-standings?season=${SE.S}&round=${slug}`);
      const sess = [...new Set([...rd.querySelectorAll('a[href*="session="]')].map((a) => a.getAttribute("href").match(/session=([^&]+)/)[1]))].filter((s) => SESSIONS[s]);
      sess.sort((x, y) => Object.keys(SESSIONS).indexOf(x) - Object.keys(SESSIONS).indexOf(y));
      for (const s of sess) {
        const [name, type] = SESSIONS[s];
        const d = await html(`/en/results-and-standings?season=${SE.S}&round=${slug}&session=${s}`);
        const rows = [...d.querySelectorAll("tbody tr")].filter((t) => t.querySelector('a[href*="/drivers/"]'));
        const results = [];
        let poleTime = null;
        for (const tr of rows) {
          const c = [...tr.children].map((x) => txt(x));
          const a = tr.querySelector('a[href*="/drivers/"]');
          const dslug = a.getAttribute("href").split("/").pop();
          const off = txt(a);
          const last = norm(off).split(" ").pop();
          const en = entry.get(norm(off)) || [...entry.values()].find((x) => norm(x.wikiName).split(" ").pop() === last && norm(x.team).split(" ")[0] === norm(c[2]).split(" ")[0]);
          const info = await driverInfo(dslug, off);
          const posTxt = c[0].replace(/Places? (gained|lost)|No change/gi, "").trim();
          const pos = /^\d+$/.test(posTxt) ? Number(posTxt) : null;
          const teamOff = c[2];
          const team = en && norm(en.team).startsWith(norm(teamOff).split(" ")[0]) ? en.team : teamCase.get(norm(teamOff)) || en?.team || teamOff.replace(/\w\S*/g, (w) => w[0] + w.slice(1).toLowerCase());
          const [manufacturer, ...model] = (en?.powertrain || "").split(" ");
          const r = { position: pos, car_number: en?.no || null, driver: { name: en?.wikiName || off, ...info }, team, car: en ? { manufacturer, model: model.join(" ") || null } : null };
          if (type === "race") {
            const w = wikiRace.get(norm(en?.wikiName || off));
            const time = c[4];
            const wt = (w?.time || "").toLowerCase();
            r.status = pos ? (/lap/.test(time) || /lap/.test(wt) ? "classified" : "finished") : /dsq|disqual/.test(wt) || /^dsq$/i.test(w?.pos || "") ? "dsq" : /dns|did not start/.test(wt) || /^dns$/i.test(w?.pos || "") ? "dns" : "dnf";
            if (!pos) r.dnf_reason = w?.time || null;
            r.grid = /^\d+$/.test(c[3]) ? Number(c[3]) : null;
            r.points = Number(c[5]) || 0;
            r.laps = w?.laps ? Number(w.laps) : null;
            if (pos === 1) r.total_time = time;
            else if (pos) r.gap = /^\+/.test(time) ? time : time ? `+${time}` : null;
            r.position_text = pos ? String(pos) : (w?.pos || "Ret");
            if (!r.car_number && w?.no) r.car_number = w.no;
          } else {
            const t = c[3] && c[3] !== "—" ? c[3] : null;
            r.best_lap = t;
            if (type === "practice") r.gap = c[4] && /^\+/.test(c[4]) ? c[4] : null;
            if (type === "qualifying") {
              if (pos === 1) { poleTime = t; r.points = 3; } // pole position: 3 points
              r.extra = {};
            }
          }
          results.push(r);
        }
        // unclassified race entries come last on the official page; number them after the classified ones
        if (type === "race") { let n = Math.max(0, ...results.map((r) => r.position || 0)); for (const r of results) if (r.position == null) r.position = ++n; }
        if (type === "qualifying") { let n = 0; for (const r of results) if (r.position == null) r.position = results.length - (n++); }
        ev.sessions.push({ name, type, date: type === "race" || type === "qualifying" ? iso : null, source_url: `https://www.fiaformulae.com/en/results-and-standings?season=${SE.S}&round=${slug}&session=${s}`, results });
        const missingNo = results.filter((r) => !r.car_number).map((r) => r.driver.name);
        if (missingNo.length) log.push(`${ev.name} ${name}: no car number for ${missingNo.join(", ")}`);
      }
      if (!raceTables[raceIdx]) log.push(`${ev.name}: no Wikipedia race table (${reportTitle})`);
      season.events.push(ev);
    }
    feed.seasons.push(season);
  }
  window.__feed = feed;
  window.__feedLog = log;
  return { seasons: feed.seasons.map((s) => `${s.year}: ${s.events.length} events, ${s.events.reduce((n, e) => n + e.sessions.length, 0)} sessions`), log: log.slice(0, 40), drivers: drivers.size };
})();
