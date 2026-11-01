import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FileDown, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { useDigests, useEvents, useLayouts, useNames, useSeasons, layoutFor, lastName, cleanName, type EventLite } from "@/site/data";
import { CarNum, Eyebrow, Note, Page, PosNum, SectionHead, Skeleton, Tabs, TrackMap, Ticker, dateRange } from "@/site/ui";
import {
  classColor,
  crewLastNames,
  groupByPosition,
  headline,
  joinNames,
  plural,
  stripYear,
  todayISO,
  useChampionship,
  useSeasonClasses,
  useSeries,
  type ChampEntry,
  type SeasonClass,
} from "@/site/archive";

type Mode = "drivers" | "teams";
type Names = ReturnType<typeof useNames>;

const roundLabel = (e?: EventLite) =>
  (e?.short_name || e?.circuit?.location?.split(",")[0] || e?.circuit?.name || e?.name || "")
    .replace(/\s+(GP|\d+H|GT Challenge|Grand Prix)$/i, "")
    .replace(/^\d{4}\s+/, "");

/** Chart label: at most ~20 characters, keeping whole names ("Nasr / Heinrich +1"). */
const shortLabel = (label: string, max = 20) => {
  if (label.length <= max) return label;
  const parts = label.split(" / ");
  if (parts.length > 2) {
    const two = `${parts.slice(0, 2).join(" / ")} +${parts.length - 2}`;
    if (two.length <= max) return two;
  }
  if (parts.length > 1) {
    const one = `${parts[0]} +${parts.length - 1}`;
    if (one.length <= max) return one;
  }
  return `${label.slice(0, max - 1).trimEnd()}…`;
};

/* ═══════════════════════════════════════════════════════════════ */

const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const series = useSeries();
  const seasons = useSeasons();
  const events = useEvents();
  const digests = useDigests();
  const layouts = useLayouts();
  const names = useNames();
  const seasonClasses = useSeasonClasses();

  const info = series?.find((s) => s.id === id);
  const mySeasons = useMemo(() => (seasons || []).filter((s) => s.series.id === id).sort((a, b) => b.year - a.year), [seasons, id]);
  const yearParam = Number(params.get("season")) || null;
  const season = mySeasons.find((s) => s.year === yearParam) || mySeasons.find((s) => s.eventCount > 0) || mySeasons[0];
  const champ = useChampionship(season?.id);
  const ch = champ.data;

  const classesMeta: SeasonClass[] | undefined = season ? seasonClasses?.[season.id] : undefined;
  const mode: Mode = params.get("mode") === "teams" ? "teams" : "drivers";
  const classList = ch?.classes || [];
  const cls = classList.includes(params.get("class") || "") ? params.get("class")! : classList[0] ?? "";
  const color = classColor(classesMeta, cls);
  const entries = ch ? (mode === "drivers" ? ch.drivers[cls] : ch.teams[cls]) || [] : [];

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const seasonEvents = useMemo(
    () => (events || []).filter((e) => e.season_id === season?.id).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "")),
    [events, season?.id],
  );
  const roundEvents = useMemo(() => (ch?.rounds || []).map((rid) => seasonEvents.find((e) => e.id === rid)), [ch, seasonEvents]);

  const [active, setActive] = useState<number | null>(null);
  useEffect(() => setActive(null), [cls, mode, season?.id]);

  const finished = season ? season.year < new Date().getFullYear() : false;
  const winnersCount = useMemo(() => {
    const set = new Set<string>();
    for (const e of seasonEvents) for (const r of digests?.[e.id]?.races || []) for (const w of r.winners) set.add(`${w.className}|${[...w.driverIds].sort().join(",")}`);
    return set.size;
  }, [seasonEvents, digests]);
  const scoredDrivers = ch ? Object.values(ch.drivers).reduce((n, l) => n + l.length, 0) : 0;
  const realClasses = classList.filter(Boolean);
  const scoredRounds = ch
    ? ch.rounds.filter((_, i) => [...Object.values(ch.drivers), ...Object.values(ch.teams)].some((l) => l.some((e) => e.perRound[i] > 0))).length
    : undefined;

  if (series && !info) {
    return (
      <Shell title="Championship not found">
        <Page className="pt-16">
          <Note title="We couldn't find that championship.">
            It may have been renamed or removed.{" "}
            <Link to="/series" className="underline underline-offset-4">
              Browse all championships
            </Link>
            .
          </Note>
        </Page>
      </Shell>
    );
  }

  return (
    <Shell title={info ? `${info.name}${season ? ` ${season.year}` : ""} – Standings & points race` : "Championship"} canonical={`/series/${id}`}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Page className="pt-6 sm:pt-10">
        <Link to="/series" className="group inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Championships
        </Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div className="min-w-0">
            <Eyebrow>
              <span>Championship</span>
              {info?.short_name && (
                <>
                  <span>·</span>
                  <span>{info.short_name}</span>
                </>
              )}
            </Eyebrow>
            {info ? (
              <h1 className="display mt-4 text-[3rem] leading-[0.92] sm:text-[4.6rem] lg:text-[5.4rem]">
                {info.name}
                {season && <span className="ml-3 align-top font-mono text-base tracking-normal text-ink-3 sm:text-lg">{season.year}</span>}
              </h1>
            ) : (
              <Skeleton className="mt-4 h-28 w-full max-w-2xl" />
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {mySeasons.length > 0 && (
                <Tabs
                  value={String(season?.year ?? "")}
                  onChange={(v) => setParams(new URLSearchParams({ season: v, ...(mode === "teams" ? { mode } : {}) }), { replace: true })}
                  items={mySeasons.map((s) => ({ value: String(s.year), label: <span className="num">{s.year}</span>, disabled: s.eventCount === 0 }))}
                />
              )}
              {info && season && ch && realClasses.length + (classList.includes("") ? 1 : 0) > 0 && (
                <ExportPdf seriesName={info.name} year={season.year} seasonId={season.id} classes={realClasses} />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-rule">
            {[
              { label: "Rounds scored", value: scoredRounds },
              { label: realClasses.length > 1 ? "Classes" : "Class", value: ch ? realClasses.length || (classList.length ? 1 : 0) : undefined },
              { label: "Drivers scored", value: ch ? scoredDrivers : undefined },
              { label: "Different winners", value: digests && ch ? winnersCount : undefined },
            ].map((s) => (
              <div key={s.label} className="bg-sheet px-5 py-5">
                <div className="eyebrow">{s.label}</div>
                <div className="num mt-2 text-3xl">{s.value == null ? <Skeleton className="h-8 w-14" /> : <Ticker value={s.value} />}</div>
              </div>
            ))}
          </div>
        </div>
      </Page>

      {/* ── Points race ──────────────────────────────────────── */}
      <Page className="mt-14 sm:mt-20">
        {!ch ? (
          <Skeleton className="h-[540px] rounded-[28px]" />
        ) : classList.length === 0 ? (
          <Note title={`No points on the record for ${season?.year ?? "this season"} yet`}>
            {seasonEvents.length > 0
              ? "This season's results are in, but no championship points have been published with them. Its rounds are listed below."
              : "No rounds of this season have been published yet."}
          </Note>
        ) : (
          <section className="rounded-[28px] border bg-sheet p-5 sm:p-8" aria-labelledby="points-race">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <Eyebrow>
                  <span id="points-race">The points race</span>
                  <span>·</span>
                  <span>{plural(ch.rounds.length, "round")}</span>
                </Eyebrow>
                <LeadLine entries={entries} cls={cls} mode={mode} finished={finished} rounds={ch.rounds.length} />
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {classList.length > 1 && (
                  <Tabs
                    value={cls}
                    onChange={(v) => setParam("class", v)}
                    items={classList.map((c) => ({
                      value: c,
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: classColor(classesMeta, c) }} />
                          <span className="font-mono text-[12px] uppercase tracking-[0.06em]">{c || "Overall"}</span>
                        </span>
                      ),
                    }))}
                  />
                )}
                <Tabs
                  value={mode}
                  onChange={(v) => setParam("mode", v === "teams" ? "teams" : null)}
                  items={[
                    { value: "drivers", label: "Drivers" },
                    { value: "teams", label: "Teams" },
                  ]}
                />
              </div>
            </div>
            {ch.rounds.length < 2 && <p className="mt-3 text-sm text-ink-3">One round scored so far: the race takes shape as the season goes on.</p>}
            <PointsRace
              key={`${season?.id}|${cls}|${mode}`}
              groups={groupByPosition(entries).slice(0, 8)}
              rounds={roundEvents}
              color={color}
              mode={mode}
              names={names}
              active={active}
              setActive={setActive}
            />
          </section>
        )}
      </Page>

      {/* ── Standings ───────────────────────────────────────── */}
      {ch && classList.length > 0 && (
        <Page className="mt-20 sm:mt-28">
          <SectionHead
            eyebrow={
              <>
                {cls && <span>{cls}</span>}
                {cls && <span>·</span>}
                <span>After {plural(ch.rounds.length, "round")}</span>
              </>
            }
            title={mode === "drivers" ? <>Drivers&rsquo; standings</> : <>Teams&rsquo; standings</>}
          />
          <Standings key={`${season?.id}|${cls}|${mode}`} entries={entries} mode={mode} color={color} names={names} active={active} setActive={setActive} />
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-ink-3">
            Points as published with the official results; ties are split by countback (most wins, then seconds, and so on), and drivers on identical records share a position. Wins and podiums count main races only.
          </p>
        </Page>
      )}

      {/* ── Season strip ────────────────────────────────────── */}
      <Page className="mt-24 sm:mt-32">
        <SeasonStrip events={seasonEvents} loading={!events} season={season?.year} classes={classesMeta} layouts={layouts} digests={digests} names={names} />
      </Page>
    </Shell>
  );
};

function Shell({ title, canonical, children }: { title: string; canonical?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SEOHead title={title} description="Points race, standings and every round of the season, from official results." canonical={canonical} />
      <Header />
      {children}
      <Footer />
    </div>
  );
}

/* ── Lead sentence ─────────────────────────────────────────────── */

const groupLabel = (entries: ChampEntry[], mode: Mode, names: Names) =>
  mode === "drivers"
    ? entries.map((e) => lastName(e.name)).join(" / ")
    : entries.map((e) => `#${e.carNumbers[0]} ${names?.teams[e.teamId || ""]?.short_name || e.name}`).join(" / ");

function LeadLine({ entries, cls, mode, finished, rounds }: { entries: ChampEntry[]; cls: string; mode: Mode; finished: boolean; rounds: number }) {
  const groups = groupByPosition(entries);
  const lead = groups[0];
  if (!lead) return <p className="display mt-3 text-[1.9rem] leading-[1.08] text-ink-2">No points scored in this class yet.</p>;
  const next = groups[1];
  const gap = next ? lead.entries[0].totalPoints - next.entries[0].totalPoints : null;
  const who = mode === "drivers" ? joinNames(lead.entries.map((e) => cleanName(e.name))) : `The #${lead.entries[0].carNumbers[0]} ${lead.entries[0].name}`;
  const many = mode === "drivers" && lead.entries.length > 1;
  const verb = finished ? "won" : many ? "lead" : "leads";
  return (
    <p className="display mt-3 text-[1.9rem] leading-[1.08] sm:text-[2.4rem]">
      {who} {verb}
      {finished ? (cls ? ` the ${cls} title` : " the title") : cls ? ` ${cls}` : " the championship"}
      {gap != null && gap > 0 ? (
        <>
          {" "}
          by{" "}
          <span className="mark whitespace-nowrap">
            {gap.toLocaleString()} {gap === 1 ? "point" : "points"}
          </span>
        </>
      ) : gap === 0 ? (
        <> on countback</>
      ) : null}
      {finished ? "" : ` after ${rounds} ${rounds === 1 ? "round" : "rounds"}`}.
    </p>
  );
}

/* ── Points race chart ─────────────────────────────────────────── */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceStep(max: number, count = 4) {
  const raw = Math.max(1, max) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function PointsRace({
  groups,
  rounds,
  color,
  mode,
  names,
  active,
  setActive,
}: {
  groups: { position: number; entries: ChampEntry[] }[];
  rounds: (EventLite | undefined)[];
  color: string;
  mode: Mode;
  names: Names;
  active: number | null;
  setActive: (n: number | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null);
  const compact = width < 640;
  const H = compact ? 300 : 440;
  const pad = { l: compact ? 34 : 44, r: compact ? 12 : 230, t: 18, b: compact ? 30 : 48 };
  const n = rounds.length;
  const series = groups.map((g) => ({ ...g, label: groupLabel(g.entries, mode, names), values: [0, ...g.entries[0].cumulative] }));
  const max = Math.max(1, ...series.map((s) => s.values[s.values.length - 1]));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (n ? (i / n) * iw : 0);
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  // end labels, pushed apart so they never collide
  const GAP = 20;
  const ends = series.map((s, i) => ({ i, y: y(s.values[n]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + GAP);
  for (let k = ends.length - 1; k >= 0; k--) {
    const limit = k === ends.length - 1 ? pad.t + ih + 8 : ends[k + 1].y - GAP;
    if (ends[k].y > limit) ends[k].y = limit;
  }
  const endY = new Map(ends.map((e) => [e.i, e.y]));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor(Math.max(1, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n))));
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowRight") setCursor((c) => Math.min(n, (c ?? 0) + 1));
    else if (e.key === "ArrowLeft") setCursor((c) => Math.max(1, (c ?? n + 1) - 1));
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  };

  const hi = active != null ? series.findIndex((s) => s.position === active) : -1;
  const focusIdx = hi === -1 ? 0 : hi;
  const strokeFor = (i: number) => (i === focusIdx ? color : "hsl(var(--ink))");
  const opacityFor = (i: number) => (i === focusIdx ? 1 : hi === -1 ? 0.32 : 0.1);
  const widthFor = (i: number) => (i === focusIdx ? 3 : 1.5);

  const tip = cursor != null && n > 0 ? series.map((s) => ({ s, v: s.values[cursor], d: s.values[cursor] - s.values[cursor - 1] })).sort((a, b) => b.v - a.v) : null;
  const tipLeft = cursor != null ? x(cursor) : 0;
  const flip = tipLeft > width - 290;
  const labelEvery = Math.max(1, Math.ceil(70 / (iw / Math.max(1, n))));
  const order = series.map((_, i) => i).reverse().sort((a, b) => (a === focusIdx ? 1 : b === focusIdx ? -1 : 0));

  return (
    <div className="mt-8">
      <style>{`@keyframes tr-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@keyframes tr-fade{from{opacity:0}to{opacity:1}}`}</style>
      <div
        ref={ref}
        className="relative select-none rounded-2xl"
        tabIndex={0}
        role="group"
        aria-label={`Points race over ${n} rounds. Use the left and right arrow keys to step through the rounds.`}
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
      >
        {width > 0 ? (
          <svg width={width} height={H} className="block" aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={pad.l - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
                  {t >= 1000 ? `${(t / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : t}
                </text>
              </g>
            ))}
            {rounds.map((ev, i) => {
              const xi = x(i + 1);
              const show = (i + 1) % labelEvery === 0 || i === n - 1;
              const on = cursor === i + 1;
              return (
                <g key={i}>
                  <line x1={xi} x2={xi} y1={pad.t} y2={pad.t + ih} stroke={on ? "hsl(var(--ink))" : "hsl(var(--rule))"} strokeOpacity={on ? 0.9 : 0.55} />
                  {(show || on) && (
                    <text x={xi} y={pad.t + ih + 18} textAnchor="middle" className={cn("font-mono text-[10.5px]", on ? "fill-ink" : "fill-ink-3")}>
                      R{i + 1}
                    </text>
                  )}
                  {(show || on) && !compact && (
                    <text x={xi} y={pad.t + ih + 34} textAnchor="middle" className={cn("text-[11px]", on ? "fill-ink" : "fill-ink-3")}>
                      {roundLabel(ev).slice(0, 13)}
                    </text>
                  )}
                </g>
              );
            })}

            {order.map((i) => {
              const s = series[i];
              const d = s.values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
              return (
                <g key={s.position}>
                  <path
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={strokeFor(i)}
                    strokeOpacity={opacityFor(i)}
                    strokeWidth={widthFor(i)}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ strokeDasharray: 1, animation: `tr-draw 1.1s cubic-bezier(.3,.7,.2,1) ${i * 60}ms both`, transition: "stroke-opacity .25s, stroke-width .25s, stroke .25s" }}
                  />
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke" }} onPointerEnter={() => setActive(s.position)} onPointerLeave={() => setActive(null)} />
                  {i === focusIdx &&
                    s.values.map((v, k) =>
                      k === 0 ? null : <circle key={k} cx={x(k)} cy={y(v)} r={cursor === k ? 5 : 3} fill={color} stroke="hsl(var(--sheet))" strokeWidth={2} style={{ animation: "tr-fade .4s .9s both" }} />,
                    )}
                </g>
              );
            })}

            {!compact &&
              series.map((s, i) => {
                const ly = endY.get(i)!;
                const ry = y(s.values[n]);
                const isHi = i === focusIdx;
                const label = shortLabel(s.label);
                const x0 = x(n);
                return (
                  <g
                    key={s.position}
                    tabIndex={0}
                    role="button"
                    aria-label={`P${s.position} ${s.label}, ${s.values[n]} points`}
                    className="outline-none"
                    onPointerEnter={() => setActive(s.position)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(s.position)}
                    onBlur={() => setActive(null)}
                    style={{ opacity: hi === -1 || i === hi ? 1 : 0.45, transition: "opacity .25s", animation: `tr-fade .5s ${0.7 + i * 0.05}s both` }}
                  >
                    <path d={`M${x0 + 7},${ry} C${x0 + 16},${ry} ${x0 + 12},${ly} ${x0 + 22},${ly}`} fill="none" stroke={isHi ? color : "hsl(var(--rule))"} />
                    <rect x={x0 + 22} y={ly - 10} width={pad.r - 24} height={20} rx={7} fill={isHi && hi !== -1 ? "hsl(var(--ink) / 0.06)" : "transparent"} />
                    <text x={x0 + 30} y={ly} dy="0.34em" className={cn("font-mono text-[11px]", isHi ? "fill-ink" : "fill-ink-3")}>
                      {s.position}
                    </text>
                    <text x={x0 + 46} y={ly} dy="0.34em" className={cn("text-[12.5px]", isHi ? "fill-ink" : "fill-ink-2")}>
                      {label}
                    </text>
                    <text x={x0 + pad.r - 8} y={ly} dy="0.34em" textAnchor="end" className={cn("font-mono text-[12px]", isHi ? "fill-ink" : "fill-ink-3")}>
                      {s.values[n].toLocaleString()}
                    </text>
                  </g>
                );
              })}

            <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setCursor(null)} style={{ cursor: "crosshair" }} />
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}

        {tip && cursor != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-64 rounded-2xl border bg-sheet/95 p-3.5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur"
            style={{ left: flip ? undefined : tipLeft + 14, right: flip ? width - tipLeft + 14 : undefined }}
          >
            <div className="eyebrow truncate">
              R{cursor} · {roundLabel(rounds[cursor - 1])}
            </div>
            <ol className="mt-2 space-y-1">
              {tip.map(({ s, v, d }, k) => (
                <li key={s.position} className="grid grid-cols-[1rem_1fr_auto_2.8rem] items-baseline gap-2 text-[12.5px]">
                  <span className="num text-[11px] text-ink-3">{k + 1}</span>
                  <span className={cn("truncate", s.position === active && "font-medium")}>{s.label}</span>
                  <span className="num">{v.toLocaleString()}</span>
                  <span className="num text-right text-[11px] text-ink-3">{d > 0 ? `+${d}` : "—"}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {compact && (
        <ol className="mt-4 grid gap-1">
          {series.map((s, i) => (
            <li key={s.position}>
              <button
                onClick={() => setActive(active === s.position ? null : s.position)}
                aria-pressed={active === s.position}
                className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[13.5px] transition-colors", active === s.position && "bg-ink/[0.06]")}
              >
                <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ backgroundColor: i === focusIdx ? color : "hsl(var(--ink-3))" }} />
                <span className="num w-4 text-[11px] text-ink-3">{s.position}</span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="num text-[12.5px]">{s.values[n].toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ── Standings table ───────────────────────────────────────────── */

const COLS = "md:grid-cols-[4rem_minmax(0,1fr)_4rem_4.5rem_minmax(8rem,11rem)_5rem]";

function Standings({
  entries,
  mode,
  color,
  names,
  active,
  setActive,
}: {
  entries: ChampEntry[];
  mode: Mode;
  color: string;
  names: Names;
  active: number | null;
  setActive: (n: number | null) => void;
}) {
  const groups = groupByPosition(entries);
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, 12);
  const leader = groups[0]?.entries[0].totalPoints || 0;
  if (!groups.length) return <Note title="No points in this class yet" />;

  return (
    <div className="overflow-hidden rounded-3xl border bg-sheet">
      <div className={cn("hidden items-center gap-4 border-b px-6 py-3 md:grid", COLS)}>
        <span className="eyebrow">Pos</span>
        <span className="eyebrow">{mode === "drivers" ? "Driver" : "Entry"}</span>
        <span className="eyebrow text-right">Wins</span>
        <span className="eyebrow text-right">Podiums</span>
        <span className="eyebrow text-right">Points</span>
        <span className="eyebrow text-right">Gap</span>
      </div>
      <ol>
        {shown.map((g, gi) => {
          const e0 = g.entries[0];
          const tied = mode === "teams" ? g.entries.length > 1 : new Set(g.entries.map((e) => e.carNumbers[0])).size > 1;
          const gap = leader - e0.totalPoints;
          return (
            <li
              key={g.position}
              onPointerEnter={() => gi < 8 && setActive(g.position)}
              onPointerLeave={() => setActive(null)}
              className={cn(
                "relative grid grid-cols-[2.4rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b px-4 py-4 transition-colors last:border-b-0 md:px-6",
                COLS,
                active === g.position && "bg-ink/[0.035]",
              )}
            >
              {gi === 0 && <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />}
              <div className="flex flex-col items-start">
                <PosNum n={g.position} size={gi < 3 ? "md" : "sm"} className={gi < 3 ? "" : "text-ink-2"} />
                {tied && <span className="mt-1 rounded-full bg-ink/[0.07] px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-2">Tied</span>}
              </div>

              <div className="min-w-0">
                {mode === "drivers" ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {g.entries.map((e) => (
                      <Link key={e.key} to={`/driver/${e.driverIds[0]}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[15.5px] hover:underline hover:underline-offset-4">
                        <FlagImage nationality={e.nationality} size={14} className="shrink-0 rounded-[2px]" />
                        <span className="truncate">{cleanName(e.name)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <CarNum n={e0.carNumbers[0]} />
                    {e0.teamId ? (
                      <Link to={`/team/${e0.teamId}`} className="truncate text-[15.5px] hover:underline hover:underline-offset-4">
                        {e0.name}
                      </Link>
                    ) : (
                      <span className="truncate text-[15.5px]">{e0.name}</span>
                    )}
                  </div>
                )}
                <div className="mt-1 truncate text-xs text-ink-3">
                  {mode === "drivers" ? (
                    <>
                      {e0.carNumbers.map((c) => `#${c}`).join(", ")}
                      {e0.teamId && names?.teams[e0.teamId] ? ` · ${names.teams[e0.teamId].full_name}` : ""}
                    </>
                  ) : (
                    crewLastNames(e0.driverIds, names, 6)
                  )}
                </div>
                <div className="num mt-0.5 text-[11px] text-ink-3 md:hidden">
                  {e0.wins} {e0.wins === 1 ? "win" : "wins"} · {e0.podiums} {e0.podiums === 1 ? "podium" : "podiums"}
                </div>
              </div>

              <span className="num hidden text-right text-[15px] md:block">{e0.wins || <span className="text-ink-3">0</span>}</span>
              <span className="num hidden text-right text-[15px] md:block">{e0.podiums || <span className="text-ink-3">0</span>}</span>

              <div className="text-right">
                <div className="num text-[17px] md:text-[18px]">{e0.totalPoints.toLocaleString()}</div>
                <div className="ml-auto mt-1.5 hidden h-1 w-full max-w-[10rem] overflow-hidden rounded-full bg-ink/[0.06] md:block">
                  <div className="h-full rounded-full" style={{ width: `${(e0.totalPoints / (leader || 1)) * 100}%`, backgroundColor: gi === 0 ? color : "hsl(var(--ink-3))" }} />
                </div>
                <div className="num text-[11px] text-ink-3 md:hidden">{gi === 0 ? "Leader" : `−${gap.toLocaleString()}`}</div>
              </div>
              <span className="num hidden text-right text-[13px] text-ink-2 md:block">{gi === 0 ? <span className="eyebrow">Leader</span> : `−${gap.toLocaleString()}`}</span>
            </li>
          );
        })}
      </ol>
      {groups.length > 12 && (
        <button onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-2 border-t py-4 text-sm text-ink-2 transition-colors hover:bg-ink/[0.03] hover:text-ink">
          {all ? "Show the top 12" : `Show all ${groups.length} positions`}
        </button>
      )}
    </div>
  );
}

/* ── Season strip ─────────────────────────────────────────────── */

function SeasonStrip({
  events,
  loading,
  season,
  classes,
  layouts,
  digests,
  names,
}: {
  events: EventLite[];
  loading: boolean;
  season?: number;
  classes?: SeasonClass[];
  layouts: ReturnType<typeof useLayouts>;
  digests: ReturnType<typeof useDigests>;
  names: Names;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const by = (dir: number) => scroller.current?.scrollBy({ left: dir * Math.min(600, scroller.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section aria-labelledby="season-strip">
      <SectionHead
        eyebrow={season ? `${season} · ${plural(events.length, "round")}` : "Rounds"}
        title={<span id="season-strip">The season</span>}
        action={
          events.length > 3 ? (
            <div className="mb-1 hidden gap-2 sm:flex">
              <button onClick={() => by(-1)} aria-label="Scroll rounds back" className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-ink/[0.05]">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button onClick={() => by(1)} aria-label="Scroll rounds forward" className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-ink/[0.05]">
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : undefined
        }
      />
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[340px] w-[264px] shrink-0 rounded-3xl" />
          ))}
        </div>
      ) : !events.length ? (
        <Note title="No rounds published">This season's calendar has not been added to the record yet.</Note>
      ) : (
        <div ref={scroller} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 pt-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10">
          {events.map((ev, i) => {
            const race = headline(digests?.[ev.id]);
            const upcoming = (ev.start_date || "") > today;
            const layout = layoutFor(ev, layouts);
            return (
              <Link
                key={ev.id}
                to={`/events/${ev.id}`}
                className="group relative flex w-[264px] shrink-0 snap-start flex-col rounded-3xl border bg-sheet p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)]"
              >
                <div className="flex items-start justify-between">
                  <PosNum n={String(ev.round_number ?? i + 1).padStart(2, "0")} size="lg" />
                  <span className="eyebrow mt-1 text-right">{dateRange(ev.start_date, ev.end_date).replace(/, \d{4}$/, "")}</span>
                </div>
                <div className="relative my-4 h-24">
                  <TrackMap key={layout?.layout_image_url} src={layout?.layout_image_url} alt="" className="absolute inset-0 m-auto h-full w-full opacity-80 transition-transform duration-500 group-hover:scale-105" />
                </div>
                <h3 className="display text-[1.55rem] leading-[1.02]">{stripYear(ev.short_name || ev.name)}</h3>
                <div className="mt-1 truncate text-xs text-ink-3">{ev.circuit?.name}</div>
                <div className="mt-auto space-y-1.5 border-t pt-3 [margin-top:1rem]">
                  {upcoming ? (
                    <span className="inline-flex rounded-full bg-hl px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-hl-ink">Upcoming</span>
                  ) : race ? (
                    race.winners.map((w) => (
                      <div key={w.carNumber} className="flex items-center gap-2 text-[13px]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: classColor(classes, w.className) }} />
                        <span className="w-[3.4rem] shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">{w.className || "Winner"}</span>
                        <span className="truncate">{crewLastNames(w.driverIds, names, 3)}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[13px] text-ink-3">Classification not on the record</span>
                  )}
                </div>
                <ArrowUpRight className="absolute right-5 top-[4.6rem] h-4 w-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── PDF export ──────────────────────────────────────────────── */

function ExportPdf({ seriesName, year, seasonId, classes }: { seriesName: string; year: number; seasonId: string; classes: string[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set(classes));
  const box = useRef<HTMLDivElement>(null);
  const classKey = classes.join("|");
  useEffect(() => setSel(new Set(classKey ? classKey.split("|") : [])), [classKey]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (classNames: string[] | null) => {
    setOpen(false);
    setBusy(5);
    try {
      const { exportStandingsPdf } = await import("@/lib/standings-pdf-export");
      await exportStandingsPdf({ seriesName, year, seasonId, classNames, onProgress: setBusy });
    } catch (e) {
      console.error("Standings PDF export failed:", e);
      alert("PDF export failed: " + ((e as Error)?.message || "Unknown error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => (busy != null ? undefined : classes.length > 1 ? setOpen(!open) : run(null))}
        aria-expanded={classes.length > 1 ? open : undefined}
        aria-haspopup={classes.length > 1 ? "dialog" : undefined}
        className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
      >
        {busy != null ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        {busy != null ? <span className="num">{Math.round(busy)}%</span> : "Standings PDF"}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose classes to export" className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border bg-sheet p-2 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.35)]">
          <div className="eyebrow px-2.5 pb-1.5 pt-2">Classes to include</div>
          {classes.map((c) => {
            const on = sel.has(c);
            return (
              <button
                key={c}
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  setSel((p) => {
                    const nx = new Set(p);
                    if (nx.has(c)) nx.delete(c);
                    else nx.add(c);
                    return nx;
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-ink/[0.05]"
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-[5px] border", on && "border-ink bg-ink text-paper")}>{on && <Check className="h-3 w-3" />}</span>
                <span className="font-mono text-[12px] uppercase tracking-wide">{c}</span>
              </button>
            );
          })}
          <button disabled={!sel.size} onClick={() => run(sel.size === classes.length ? null : [...sel])} className="mt-2 h-10 w-full rounded-full bg-ink text-[13px] font-medium text-paper disabled:opacity-40">
            Download {sel.size === classes.length ? "all classes" : plural(sel.size, "class", "classes")}
          </button>
        </div>
      )}
    </div>
  );
}

export default SeriesProfile;
