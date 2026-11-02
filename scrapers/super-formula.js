/* Super Formula scraper → normalized feed for scripts/import-normalized.mjs.
 *
 * Run in a browser tab on https://superformula.net (same-origin requests). Each race weekend
 * page (/sf3/race/<id>/) carries the official classification tables in English: practice,
 * qualifying (group, Q1, Q2) and race (laps, time, gap, best lap) for every round of the weekend.
 * Points come from the official drivers' standings page, which lists each driver's points per
 * round as "qualifying+race" (half points for shortened races), so stored points equal the
 * official totals. Nationalities from the Wikipedia season article's entry list.
 * Sets window.__feed / window.__feedLog / window.__diffs.
 */
(async () => {
  const YEARS = window.__sfYears || [2024, 2025, 2026];
  const P = new DOMParser();
  const html = async (u) => P.parseFromString(await (await fetch(u)).text(), "text/html");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`.]/g, "").replace(/[-–—_]/g, " ").replace(/\s+/g, " ").trim();
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const t = (s) => (s || "").replace(/’/g, ":").replace(/'/g, ":").trim() || null; // 1’24.171 → 1:24.171
  const VENUE = {
    "SUZUKA CIRCUIT": { name: "Suzuka International Racing Course", wiki: "Suzuka International Racing Course", layout: "Grand Prix", length: 5.807, short: "Suzuka" },
    "FUJI SPEEDWAY": { name: "Fuji Speedway", wiki: "Fuji Speedway", layout: "Grand Prix", length: 4.563, short: "Fuji" },
    "MOBILITY RESORT MOTEGI": { name: "Mobility Resort Motegi", wiki: "Mobility Resort Motegi", layout: "Road Course", length: 4.801, short: "Motegi" },
    AUTOPOLIS: { name: "Autopolis", wiki: "Autopolis", layout: "Circuit", length: 4.674, short: "Autopolis" },
    "SPORTSLAND SUGO": { name: "Sportsland SUGO", wiki: "Sportsland Sugo", layout: "Circuit", length: 3.586, short: "SUGO" },
    "OKAYAMA INTERNATIONAL CIRCUIT": { name: "Okayama International Circuit", wiki: "Okayama International Circuit", layout: "Circuit", length: 3.703, short: "Okayama" },
  };
  const coords = new Map();
  {
    const titles = Object.values(VENUE).map((v) => v.wiki);
    const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&titles=${encodeURIComponent(titles.join("|"))}`)).json();
    const back = new Map([...(j.query.redirects || []), ...(j.query.normalized || [])].map((r) => [r.to, r.from]));
    for (const p of Object.values(j.query.pages)) coords.set(back.get(p.title) || p.title, p.coordinates?.[0] ? { latitude: p.coordinates[0].lat, longitude: p.coordinates[0].lon } : {});
  }
  const feed = { series: { name: "Super Formula", short_name: "Super Formula", aliases: ["Japanese Super Formula Championship", "SF"] }, seasons: [] };
  const log = [];
  const diffs = [];
  for (const YEAR of YEARS) {
    // nationalities: Wikipedia entry list (flag before each driver)
    const nat = new Map();
    try {
      const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text&redirects=1&page=${encodeURIComponent(`${YEAR} Super Formula Championship`)}`)).json();
      const d = j.parse ? P.parseFromString(j.parse.text["*"], "text/html") : null;
      for (const td of d ? d.querySelectorAll("table.wikitable td") : []) {
        let flag = null;
        for (const n of td.querySelectorAll(".flagicon, a[href]")) {
          if (n.classList.contains("flagicon")) { flag = n.querySelector("a[title]")?.getAttribute("title") || n.querySelector("img[alt]")?.getAttribute("alt"); continue; }
          if (n.closest(".flagicon") || n.closest("sup")) continue;
          if (flag && !nat.has(norm(txt(n)))) nat.set(norm(txt(n)), flag);
          flag = null;
        }
      }
    } catch (e) { log.push(`${YEAR}: no Wikipedia entry list (${e.message})`); }
    // official standings: driver (by car no. + name) -> round -> {q, r}
    const sd = await html(`/sf3/driver_taxonomy/${YEAR}?standings`);
    const st = [...sd.querySelectorAll("table")].find((x) => /TOTAL/.test(txt(x.querySelector("tr"))));
    const head = [...st.querySelector("tr").children].map(txt);
    const roundCol = head.map((h) => (h.match(/^Rd\.(\d+)/) || [])[1]);
    const standings = [];
    for (const tr of [...st.querySelectorAll("tr")].slice(1)) {
      const c = [...tr.children].map(txt);
      const name = (c[2].match(/([A-Z][A-Za-zÀ-ÿ’' .-]+?)\s*[│|]/) || [])[1]?.trim() || c[2];
      const per = {};
      roundCol.forEach((rn, i) => {
        if (!rn) return;
        const v = c[i] || "";
        const m = v.match(/^(?:([\d.]+)\+)?([\d.]+)$/);
        per[rn] = m ? { q: Number(m[1] || 0), r: Number(m[2]) } : { q: 0, r: 0 };
      });
      standings.push({ no: c[1], name, total: Number(c[3]), per });
    }
    const findSt = (no, name) => standings.find((s) => norm(s.name) === norm(name)) || standings.find((s) => s.no === String(no) && norm(s.name).split(" ").pop() === norm(name).split(" ").pop());

    const cal = await html(`/sf3/race_taxonomy/${YEAR}`);
    const weekendLinks = [...new Set([...cal.querySelectorAll('a[href*="/sf3/race/"]')].map((a) => a.getAttribute("href")).filter((h) => !/translate/.test(h)))];
    const season = { year: YEAR, is_spec_series: true, events: [] };
    for (const href of weekendLinks) {
      const d = await html(href);
      const page = txt(d.querySelector("main") || d.body);
      const head = page.match(/Rd\.([\d-]+)\s*([A-Za-z][A-Za-z ]+?)\s*Rd\./) || page.match(/Rd\.([\d-]+)\s*([A-Za-z][A-Za-z ]+?)\s+\d/);
      if (!head) { if (!/Test/i.test(page.slice(0, 200))) log.push(`${href}: no round header`); continue; }
      const rounds = head[1].split("-").filter(Boolean);
      const venueKey = Object.keys(VENUE).find((k) => head[2].toUpperCase().includes(k)) || head[2].toUpperCase().trim();
      const v = VENUE[venueKey] || { name: head[2].trim(), layout: "Circuit", short: head[2].trim() };
      if (!VENUE[venueKey]) log.push(`${href}: unknown venue ${head[2]}`);
      const dm = page.match(/(\d{1,2})月(\d{1,2})日\([^)]*\)\s*~\s*(?:(\d{1,2})月)?(\d{1,2})日/);
      const iso = (m, dd) => `${YEAR}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      const start = dm ? iso(dm[1], dm[2]) : null, end = dm ? iso(dm[3] || dm[1], dm[4]) : null;
      const tables = [...d.querySelectorAll("table")].map((x) => ({ el: x, h: [...x.querySelector("tr").children].map(txt) }));
      const practice = tables.filter((x) => x.h.includes("Best Time") && !x.h.includes("Group") && !x.h.includes("Laps"));
      const quali = tables.filter((x) => x.h.includes("Group") || x.h.includes("Q1"));
      const races = tables.filter((x) => x.h.includes("Laps") && x.h.includes("Time"));
      if (!races.length) { log.push(`${YEAR} Rd.${rounds.join("-")} ${v.short}: no race results yet`); continue; }
      const rowsOf = (x) => [...x.el.querySelectorAll("tr")].slice(1).map((tr) => { const c = [...tr.children].map(txt); return Object.fromEntries(x.h.map((h, i) => [h, c[i]])); }).filter((r) => r["No."]);
      const entry = (r) => {
        const carName = r.Car || "";
        const team = carName.replace(/\s*SF\d+\s*$/i, "").trim();
        const engine = (r.Engine || "").split("/")[0].trim();
        return { car_number: r["No."], driver: { name: r.Driver, nationality: nat.get(norm(r.Driver)) || null }, team, car: { manufacturer: engine ? engine[0] + engine.slice(1).toLowerCase() : null, model: (carName.match(/SF\d+/i) || ["SF23"])[0].toUpperCase() } };
      };
      const practiceSessions = practice.map((x, i) => {
        const rows = rowsOf(x);
        return { name: `Practice ${i + 1}`, type: "practice", date: start, results: rows.map((r, k) => ({ position: Number(r["Pos."]) || k + 1, ...entry(r), best_lap: t(r["Best Time"]), gap: r.Gap ? `+${r.Gap}` : null, laps: Number((r.Lap || "").split("/")[1]) || null })) };
      });
      rounds.forEach((rn, idx) => {
        const ev = {
          name: `${YEAR} Super Formula Round ${rn} – ${v.short}`, short_name: `${v.short} R${rn}`, round: rn, start_date: start, end_date: end,
          circuit: { name: v.name, aliases: [v.wiki].filter(Boolean), location: v.short, country: "Japan", ...(coords.get(v.wiki) || {}), layout: { name: v.layout, length_km: v.length } },
          sessions: idx === 0 ? [...practiceSessions] : [],
        };
        const q = quali[idx];
        if (q) {
          const rows = rowsOf(q);
          ev.sessions.push({
            name: "Qualifying", type: "qualifying", date: null,
            results: rows.map((r, k) => {
              const e = entry(r);
              const s = findSt(e.car_number, e.driver.name);
              return { position: Number(r["Pos."]) || k + 1, ...e, best_lap: t(r.Q2 && /\d/.test(r.Q2) ? r.Q2 : r.Q1), points: s?.per[rn]?.q || null, extra: { Group: r.Group || null, Q1: t(r.Q1), Q2: t(r.Q2) } };
            }),
          });
        }
        const race = races[idx];
        if (race) {
          const rows = rowsOf(race);
          const lead = Number(rows[0]?.Laps) || 0;
          ev.sessions.push({
            name: "Race", type: "race", date: null,
            results: rows.map((r, k) => {
              const e = entry(r);
              const s = findSt(e.car_number, e.driver.name);
              const numeric = /^\d+$/.test(r["Pos."]);
              const laps = Number(r.Laps) || 0;
              const down = lead - laps;
              return {
                position: numeric ? Number(r["Pos."]) : k + 1, position_text: r["Pos."], ...e, laps,
                status: numeric ? (down > 0 ? "classified" : "finished") : /dsq|失格/i.test(r["Pos."]) ? "dsq" : /dns/i.test(r["Pos."]) ? "dns" : "dnf",
                dnf_reason: numeric ? null : r["Pos."] || null,
                total_time: numeric && k === 0 ? t(r.Time) : null,
                gap: numeric && k > 0 ? (down > 0 ? `${down} Lap${down > 1 ? "s" : ""}` : r.Gap ? `+${r.Gap}` : null) : null,
                best_lap: t(r.Best), points: s?.per[rn]?.r ?? 0,
              };
            }),
          });
        }
        season.events.push(ev);
      });
    }
    // stored vs official totals
    const mine = new Map();
    for (const e of season.events) for (const s of e.sessions) for (const r of s.results) if (r.points) mine.set(norm(r.driver.name), (mine.get(norm(r.driver.name)) || 0) + r.points);
    for (const s of standings) { const m = mine.get(norm(s.name)) || [...mine].find(([k]) => k.split(" ").pop() === norm(s.name).split(" ").pop())?.[1] || 0; if (Math.abs(m - s.total) > 0.01) diffs.push(`${YEAR} ${s.name}: official ${s.total}, stored ${m}`); }
    log.push(`${YEAR}: ${season.events.length} rounds, ${standings.length} drivers in the standings`);
    feed.seasons.push(season);
  }
  window.__feed = feed;
  window.__feedLog = log;
  window.__diffs = diffs;
  return { log, diffs };
})();
