/**
 * INDYCAR official results sources, fetched politely and cached on disk.
 *
 *   indycar.com results API (the JSON behind https://www.indycar.com/Results):
 *     /api/results/SeasonDropDown?id=<series>          every season, event and session id
 *     /api/results/EventsSessionDetails?id=<session>   classification + links to the session's PDF reports
 *     /api/results/YearPointSummary?year=Y&id=<series> official championship points per race
 *   Session PDF reports (Indy Racing Information System), linked from the API as
 *     http://www.imscdn.com/<Url>; fetched over HTTPS from the same S3 bucket:
 *     https://s3.amazonaws.com/www.imscdn.com/<Url>
 *
 * PDFs are converted with `pdftotext -layout` (poppler-utils).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export const INDYCAR_SERIES_GUID = "b856a4f1-e85c-4fac-8c36-fd58d962227a"; // NTT INDYCAR SERIES on indycar.com
const API = "https://www.indycar.com/api/results";
const PDF_HOST = "https://s3.amazonaws.com/www.imscdn.com/";

export function createSource({ cacheDir = path.join(os.tmpdir(), "indycar-cache"), delayMs = 700, quiet = false, offline = false } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  let last = 0;
  let requests = 0;
  let hits = 0;
  const log = (...m) => quiet || console.error(...m);

  async function get(url, ext) {
    const file = path.join(cacheDir, crypto.createHash("sha1").update(url).digest("hex").slice(0, 20) + ext);
    if (fs.existsSync(file)) {
      hits++;
      return { file, buf: fs.readFileSync(file) };
    }
    if (offline) throw new Error(`not cached (offline): ${url}`);
    const wait = last + delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    requests++;
    log(`GET ${url}`);
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "TrackRecords-importer (results archive; contact garnerghering@gmail.com)" } });
        if (res.status === 404) return { file: null, buf: null };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(file, buf);
        return { file, buf };
      } catch (e) {
        if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }

  const json = async (url) => {
    const { buf } = await get(url, ".json");
    return buf ? JSON.parse(buf.toString("utf8")) : null;
  };

  return {
    stats: () => ({ requests, hits }),
    seasons: () => json(`${API}/SeasonDropDown?id=${INDYCAR_SERIES_GUID}`),
    session: (id) => json(`${API}/EventsSessionDetails?id=${id}`),
    points: (year) => json(`${API}/YearPointSummary?year=${year}&id=${INDYCAR_SERIES_GUID}`),
    /** Text of a session report PDF (pdftotext -layout), or null when the report is missing. */
    async pdfText(url) {
      const { file } = await get(PDF_HOST + url.replace(/^\/+/, ""), ".pdf");
      if (!file) return null;
      const txt = file.replace(/\.pdf$/, ".txt");
      if (!fs.existsSync(txt)) execFileSync("pdftotext", ["-layout", file, txt]);
      return fs.readFileSync(txt, "utf8");
    },
    /** Raw bytes of an indycar.com media file (liveries). */
    async media(url) {
      const { buf } = await get(url, path.extname(new URL(url).pathname) || ".bin");
      return buf;
    },
  };
}

/* ── PDF parsers ─────────────────────────────────────────────────────── */

/** Header of any IRIS report: event, round, track, length (miles), date. */
export function parseReportHeader(text) {
  const head = text.slice(0, 1500);
  const ev = head.match(/^Event:\s+(.+?)\s{2,}Round\s+(\d+)/m) || head.match(/^Event:\s+(.+?)\s*$/m);
  const tr = head.match(/^Track:\s+(.+?)\s{2,}([\d.]+)\s*mile/m);
  const date = head.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/);
  return {
    event: ev?.[1]?.trim() ?? null,
    round: ev?.[2] ? Number(ev[2]) : null,
    track: tr?.[1]?.trim() ?? null,
    miles: tr?.[2] ? Number(tr[2]) : null,
    date: date ? new Date(`${date[1]} ${date[2]}, ${date[3]} 12:00:00 UTC`).toISOString().slice(0, 10) : null,
  };
}

/** Chassis/engine/tyre ("D/H/F") per car from any results PDF (race, qualifying, practice). */
export function parseEngines(text) {
  const engines = {};
  for (const m of text.matchAll(/^\s*\d+\s+(?:\d+\s+)?(\d+)\s+[A-Z][^\n]*?\s([A-Z])\/([A-Z])\/([A-Z])\s/gm)) engines[m[1]] ||= { chassis: m[2], engine: m[3], tire: m[4] };
  return engines;
}

/**
 * Official race results PDF: chassis/engine/tyre per car, the caution summary
 * (laps under yellow, with reasons) and the penalty summary.
 */
export function parseRaceResultsPdf(text) {
  const engines = parseEngines(text);
  // Caution and penalty summaries sit in the right-hand columns of the lower half.
  const lower = text.slice(text.search(/Caution Summary|Lead Change Summary/) >= 0 ? text.search(/Caution Summary|Lead Change Summary/) : text.length);
  const cautions = [];
  const lines = lower.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:^|\s)(\d{1,2})\s+(\d+)\s+to\s+(\d+)\s+(\d+)(?:\s+(.*))?$/);
    if (!m) continue;
    let reason = (m[5] || "").trim();
    if (!reason) {
      // Reason printed on a neighbouring line (two-line cell): take the nearest right-column text.
      const cand = [lines[i - 1], lines[i + 1]].map((l) => (l || "").slice(Math.max(0, lines[i].indexOf(m[0]) - 2)).trim()).find((t) => /^[A-Z][a-z]/.test(t) && !/^\d/.test(t));
      reason = cand || "";
    }
    cautions.push({ no: Number(m[1]), from: Number(m[2]), to: Number(m[3]), laps: Number(m[4]), reason });
  }
  // Reasons that wrap onto an extra line without lap numbers are attached above already when possible.
  const penalties = [];
  const pIdx = lines.findIndex((l) => /Penalty Summary/.test(l));
  if (pIdx >= 0) {
    const hdr = lines[pIdx + 1] || "";
    const col = hdr.search(/Car\s+Reason/);
    for (const l of lines.slice(pIdx + 2)) {
      if (col < 0 || /Information provided|\(C\)hassis/.test(l)) break;
      const right = l.slice(Math.max(0, col - 3));
      const m = right.match(/^\s*(\d{1,3})\s{2,}(\S.*?)\s{2,}(\d+)\s{2,}(\S.*?)\s*$/);
      if (m) penalties.push({ car: m[1], reason: m[2].trim(), lap: Number(m[3]), penalty: m[4].trim() });
    }
  }
  const red = [];
  for (const m of lower.matchAll(/Red Flag[^\n]*?(\d+)\s+to\s+(\d+)/gi)) red.push({ from: Number(m[1]), to: Number(m[2]) });
  return { engines, cautions, penalties, red };
}

/**
 * Section Data Report for a race: every lap of every car, with pit lane
 * timing (SF to PI on the in-lap, PI to PO on the out-lap).
 * Returns { [car]: { laps: Map(lap -> seconds), sfToPi: Map(lap -> s), piToPo: Map(lap -> s) } }.
 */
export function parseSectionResults(text) {
  const cars = {};
  let car = null;
  let cols = null;
  let pending = null;
  let last = null; // { lap, filled } — the last lap number seen in this table
  const assign = (lap, vals) => {
    const c = cars[car];
    if (vals.lap != null) c.laps.set(lap, vals.lap);
    if (vals.sfToPi != null) c.sfToPi.set(lap, vals.sfToPi);
    if (vals.piToPo != null) c.piToPo.set(lap, vals.piToPo);
  };
  // Rows come as T (times), lap number, S (speeds); a T row with no lap number after it is dropped.
  const flush = () => {
    pending = null;
    last = null;
  };
  for (const line of text.split("\n")) {
    const h = line.match(/Section Data for Car\s+(\d+)\s+-/);
    if (h) {
      flush();
      car = h[1];
      cars[car] ||= { laps: new Map(), sfToPi: new Map(), piToPo: new Map() };
      continue;
    }
    if (/\bT\/S\b/.test(line)) {
      flush();
      const lapIdx = [...line.matchAll(/\bLap\b/g)].map((m) => m.index);
      cols = {
        // the first "Lap" heads the lap-number column; a second one heads the lap time
        // (wide tracks split the sections over two tables, only the last has the lap time)
        lap: lapIdx.length >= 2 ? lapIdx[lapIdx.length - 1] : -1,
        piToPo: line.search(/PI\s*(?:to|-)\s*PO/),
        poToSf: line.search(/PO\s*(?:to|-)\s*S\/?F/),
        sfToPi: line.search(/S\/?F\s*(?:to|-)\s*PI/),
      };
      continue;
    }
    if (!car || !cols) continue;
    if (/^\s+T(\s{2,}|\s*$)/.test(line)) {
      pending = {};
      for (const m of line.matchAll(/\d+\.\d+/g)) {
        const start = m.index;
        let best = null;
        let bestD = 4;
        for (const [k, pos] of Object.entries(cols)) {
          if (pos < 0) continue;
          const d = Math.abs(start - pos);
          if (d <= bestD) {
            best = k;
            bestD = d;
          }
        }
        if (best) pending[best] = Number(m[0]);
      }
      continue;
    }
    const lapLine = line.match(/^\s+(\d+)\s*$/);
    if (lapLine) {
      const lap = Number(lapLine[1]);
      const filled = !!pending && Object.keys(pending).length > 0;
      if (filled) assign(lap, pending);
      last = { lap, filled };
      pending = null;
    }
  }
  flush();
  return cars;
}
