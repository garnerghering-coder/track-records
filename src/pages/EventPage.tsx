/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CloudSun, MapPin, Play, Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";
import { classify, type ClassifiedCar, type RaceDigest } from "@/lib/insights";
import { InsightGrid, StatsRibbon } from "@/pages/Index";
import { lastName, layoutFor, useDigest, useLayouts, useLoad, useNames } from "@/site/data";
import { ClassTag, Eyebrow, Livery, Note, Page, PosNum, Skeleton, Tabs, TrackMap, dateRange } from "@/site/ui";
import Classification from "@/site/race/Classification";
import Markdown from "@/site/race/Markdown";
import { buildModel, clock } from "@/site/race/replay";

const Replay = lazy(() => import("@/site/race/Replay"));
const ClassTimeDelta = lazy(() => import("@/components/ClassTimeDelta"));
const StrategyTimeline = lazy(() => import("@/components/StrategyTimeline"));
const PositionProgressionChart = lazy(() => import("@/components/PositionProgressionChart"));

type Tab = "story" | "replay" | "results" | "analysis" | "control";
const isRace = (t: string) => t === "race" || t === "endurance_race" || t === "sprint_race";
const stripYear = (n: string) => n.replace(/^\d{4}\s+/, "");

async function loadEvent(id: string) {
  const [ev, ss] = await Promise.all([
    supabase
      .from("v2_events")
      .select("*, v2_seasons(id, year, is_multiclass, v2_series(id, name, short_name)), v2_circuits(id, name, country, location)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("v2_sessions").select("*").eq("event_id", id).order("sort_order"),
  ]);
  const event = ev.data as any;
  if (!event) return null;
  const sessions = ((ss.data || []) as any[]).filter((s) => s.status === "published" || !s.status);
  const sessionIds = sessions.map((s) => s.id);
  const [classes, liveries, weather, summary, sections] = await Promise.all([
    supabase.from("v2_season_classes").select("class_name, color, sort_order").eq("season_id", event.season_id),
    supabase.from("v2_car_liveries").select("car_number, image_url").eq("season_id", event.season_id),
    supabase.from("v2_session_weather").select("*").in("session_id", sessionIds),
    supabase.from("v2_session_summaries").select("tab_key, summary_markdown, session_id").eq("event_id", id),
    supabase.from("v2_annotation_sections" as never).select("session_id, title, v2_annotation_items(description, color, sort_order)").in("session_id", sessionIds),
  ]);
  return {
    event,
    sessions,
    classColors: Object.fromEntries(((classes.data || []) as any[]).filter((c) => c.color).map((c) => [c.class_name, c.color])) as Record<string, string>,
    seasonClasses: (classes.data || []) as any[],
    liveries: Object.fromEntries(((liveries.data || []) as any[]).map((l) => [String(l.car_number), l.image_url])) as Record<string, string>,
    weather: (weather.data || []) as any[],
    summaries: (summary.data || []) as any[],
    sections: (sections.data || []) as any[],
  };
}
type EventBundle = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

async function loadReplay(b: EventBundle, raceId: string) {
  const childIds = b.sessions.filter((s) => s.parent_session_id === raceId).map((s) => s.id);
  const ids = [raceId, ...childIds];
  const [laps, results, stints, pits, flags] = await Promise.all([
    supabase.from("v2_lap_times").select("car_number, lap_number, elapsed").eq("session_id", raceId),
    supabase.from("v2_race_results").select("*").eq("session_id", raceId),
    supabase.from("v2_stints").select("car_number, driver_id, start_elapsed, end_elapsed").in("session_id", ids),
    supabase.from("v2_pit_stops").select("car_number, pit_in_elapsed, pit_out_elapsed").in("session_id", ids),
    supabase.from("v2_flag_segments").select("flag_state, start_elapsed, end_elapsed").in("session_id", ids),
  ]);
  const cars = classify((results.data || []) as any[], [], b.liveries).map((c: ClassifiedCar) => ({
    carNumber: c.carNumber,
    className: c.className,
    teamId: c.teamId,
    driverIds: c.driverIds,
    livery: c.livery,
    finalStatus: c.status,
  }));
  const messages = b.sections.filter((s) => ids.includes(s.session_id)).flatMap((s) => s.v2_annotation_items || []);
  return buildModel({ laps: (laps.data || []) as any[], cars, stints: (stints.data || []) as any[], pits: (pits.data || []) as any[], flags: (flags.data || []) as any[], messages });
}

export default function EventPage() {
  const { slug: id } = useParams();
  const [params, setParams] = useSearchParams();
  const bundle = useLoad(id ? `event:${id}` : null, () => loadEvent(id!));
  const b = bundle.data;
  const digestQ = useDigest(id);
  const names = useNames();
  const layouts = useLayouts();

  const races = useMemo(() => (b?.sessions || []).filter((s) => isRace(s.session_type) && !s.parent_session_id), [b]);
  const digest = digestQ.data;
  const raceId = params.get("race") || races[races.length - 1]?.id;
  const race = races.find((r) => r.id === raceId);
  const raceDigest: RaceDigest | undefined = digest?.races.find((r) => r.sessionId === raceId);
  const tab = (params.get("tab") as Tab) || "story";
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set("tab", t);
    setParams(p, { replace: true });
  };
  const setRace = (rid: string) => {
    const p = new URLSearchParams(params);
    p.set("race", rid);
    setParams(p, { replace: true });
  };

  if (bundle.loading || !b) {
    if (!bundle.loading && bundle.data === null)
      return (
        <Shell>
          <Page className="pt-16">
            <Note title="Race not found">
              <Link to="/results" className="underline underline-offset-4">Browse all races</Link>
            </Note>
          </Page>
        </Shell>
      );
    return (
      <Shell>
        <Page className="pt-10">
          <Skeleton className="h-64" />
          <Skeleton className="mt-6 h-[520px]" />
        </Page>
      </Shell>
    );
  }

  const ev = b.event;
  // The race's own layout (a venue may run an oval and a road course), else the event's.
  const layout = layoutFor({ layout_id: race?.layout_id || ev.layout_id, circuit_id: ev.circuit_id }, layouts);
  const raceWeather = b.weather.find((w) => w.session_id === raceId);
  const hasReplay = !!raceDigest?.hasLaps;
  const multi = (raceDigest?.classes.length || 0) > 1;
  const controlCount = b.sections.reduce((n, s) => n + (s.v2_annotation_items?.length || 0), 0);

  return (
    <Shell>
      <SEOHead title={`${ev.name} – results, replay and analysis`} description={`Results, race replay and analysis for the ${ev.name}.`} canonical={`/events/${ev.id}`} />

      {/* ── Masthead ──────────────────────────────────────────── */}
      <Page className="pt-6 sm:pt-10">
        <div className="relative grid gap-6 lg:grid-cols-[1fr_380px] lg:items-end">
          <div className="relative z-10">
            <Eyebrow>
              <Link to={`/series/${ev.v2_seasons?.v2_series?.id}`} className="hover:text-ink">
                {ev.v2_seasons?.v2_series?.name}
              </Link>
              <span>·</span>
              <span>{ev.v2_seasons?.year}</span>
              {ev.round_number && (
                <>
                  <span>·</span>
                  <span>Round {ev.round_number}</span>
                </>
              )}
            </Eyebrow>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.9] sm:text-[5rem] lg:text-[6.2rem]">{stripYear(ev.name)}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-ink-2">
              {ev.v2_circuits && (
                <Link to={`/circuit/${ev.v2_circuits.id}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                  <MapPin className="h-4 w-4" />
                  <span className="link-u">{ev.v2_circuits.name}</span>
                </Link>
              )}
              <span className="num text-[14px]">{dateRange(ev.start_date, ev.end_date)}</span>
              {raceWeather?.condition_summary && (
                <span className="inline-flex items-center gap-1.5">
                  <CloudSun className="h-4 w-4" />
                  {raceWeather.condition_summary}
                  {raceWeather.air_temp_max != null && <span className="num text-[13px] text-ink-3">{Math.round(raceWeather.air_temp_max)}°C</span>}
                </span>
              )}
            </div>
          </div>
          <TrackMap src={layout?.layout_image_url} alt={`${ev.v2_circuits?.name} layout`} className="hidden h-56 w-full opacity-80 lg:block" />
        </div>
      </Page>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="z-40 mt-8 lg:sticky lg:top-20">
        <Page>
          <div className="flex flex-wrap items-center gap-3 rounded-full border bg-paper/85 p-1.5 backdrop-blur-xl">
            <Tabs
              className="border-0 bg-transparent p-0"
              value={tab}
              onChange={setTab}
              items={[
                { value: "story", label: "Story" },
                { value: "replay", label: <span className="inline-flex items-center gap-1.5"><Play className="h-3 w-3 fill-current" />Replay</span>, disabled: !hasReplay },
                { value: "results", label: "Results" },
                { value: "analysis", label: "Analysis", disabled: !hasReplay },
                { value: "control", label: `Race control${controlCount ? ` · ${controlCount}` : ""}`, disabled: !controlCount },
              ]}
            />
            {races.length > 1 && (tab === "story" || tab === "replay" || tab === "analysis") && (
              <div className="ml-auto flex gap-1">
                {races.map((r) => (
                  <button key={r.id} onClick={() => setRace(r.id)} className={cn("h-8 rounded-full px-3 text-[13px]", r.id === raceId ? "bg-hl text-hl-ink" : "text-ink-2 hover:bg-ink/[0.05]")}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Page>
      </div>

      <Page className="mt-10">
        {tab === "story" && <Story b={b} race={race} digest={raceDigest} names={names} multi={multi} onReplay={hasReplay ? () => setTab("replay") : undefined} />}
        {tab === "replay" && race && hasReplay && <ReplayTab b={b} raceId={race.id} names={names} />}
        {tab === "results" && <ResultsTab b={b} />}
        {tab === "analysis" && race && (
          <Analysis b={b} race={race} names={names} multi={multi} />
        )}
        {tab === "control" && <RaceControl b={b} />}
      </Page>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      {children}
      <Footer />
    </div>
  );
}

/* ── Story ──────────────────────────────────────────────────────── */

function Story({ b, race, digest, names, multi, onReplay }: { b: EventBundle; race?: any; digest?: RaceDigest; names: ReturnType<typeof useNames>; multi: boolean; onReplay?: () => void }) {
  if (!race || !digest)
    return (
      <Note title="No race classification yet">
        {b.sessions.length ? "Practice and qualifying results are under Results." : "Sessions for this event haven't been published."}
      </Note>
    );
  // Only show generated reports that actually have a body (many stored drafts are a headline only)
  const summary = [b.summaries.find((s) => s.tab_key === "overall"), b.summaries.find((s) => s.session_id === race.id)].find((s) => (s?.summary_markdown || "").length > 400);
  const highlights = b.sessions.find((s) => s.highlights_url)?.highlights_url;
  return (
    <div className="space-y-20">
      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>{race.name} · {multi ? "Class winners" : "Podium"}</Eyebrow>
            <h2 className="display mt-2 text-[2.4rem] sm:text-[3rem]">How it finished</h2>
          </div>
          <div className="flex gap-2">
            {onReplay && (
              <button onClick={onReplay} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-1.5 pr-5 text-sm font-medium text-paper">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hl text-hl-ink">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                Replay
              </button>
            )}
            {highlights && (
              <a href={highlights} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm hover:bg-ink/[0.05]">
                Highlights <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        <div className={cn("grid gap-4", digest.classes.length >= 4 ? "md:grid-cols-2" : digest.classes.length === 3 ? "lg:grid-cols-3" : digest.classes.length === 2 ? "md:grid-cols-2" : "")}>
          {digest.classes.map((c) => (
            <ClassPodium key={c.name} name={c.name} color={c.color} cars={digest.podiums[c.name] || []} names={names} multi={multi} wide={digest.classes.length === 1} />
          ))}
        </div>
      </section>

      {digest.insights.length > 0 && (
        <section>
          <Eyebrow>From the timing data</Eyebrow>
          <h2 className="display mb-6 mt-2 text-[2.4rem] sm:text-[3rem]">The story in numbers</h2>
          <InsightGrid insights={digest.insights} names={names} />
          <StatsRibbon race={digest} />
        </section>
      )}

      {summary?.summary_markdown && (
        <section className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div>
            <Eyebrow>Race report</Eyebrow>
            <p className="mt-3 text-sm text-ink-3">Written from the official results and timing.</p>
          </div>
          <Markdown
            text={summary.summary_markdown}
            className="max-w-[68ch] text-[17px] leading-[1.7] text-ink-2 [&_h3]:display [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-3xl [&_h3]:text-ink first:[&_h3]:mt-0 [&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:font-medium [&_h4]:text-ink [&_li]:mb-1.5 [&_p]:mb-4 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5"
          />
        </section>
      )}
    </div>
  );
}

function ClassPodium({ name, color, cars, names, multi, wide }: { name: string; color: string | null; cars: ClassifiedCar[]; names: ReturnType<typeof useNames>; multi: boolean; wide: boolean }) {
  const [w, ...rest] = cars;
  if (!w) return null;
  const c = color || getClassColor(multi ? name : null);
  return (
    <div className="group relative overflow-hidden rounded-[28px] border bg-sheet">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: c }} />
      <div className={cn("grid items-center gap-4 p-6 sm:p-8", wide && "md:grid-cols-[1fr_1.1fr]")}>
        <div>
          <div className="flex items-center gap-3">
            {multi ? <ClassTag name={name} color={color} /> : <Eyebrow>Winner</Eyebrow>}
            <span className="num text-xs text-ink-3">#{w.carNumber}</span>
          </div>
          <div className="mt-4 flex items-start gap-4">
            <PosNum n={1} size="lg" />
            <div className="space-y-0.5">
              {w.driverIds.map((id) => (
                <Link key={id} to={`/driver/${id}`} className="display block text-[1.9rem] leading-[1.05] hover:underline hover:decoration-1 hover:underline-offset-4">
                  {names?.drivers[id]?.full_name?.replace(/\s*\(R\)$/, "") || "…"}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-3 text-sm text-ink-2">
            {w.teamId && (
              <Link to={`/team/${w.teamId}`} className="hover:text-ink">
                {names?.teams[w.teamId]?.full_name}
              </Link>
            )}
            {w.carId && names?.cars[w.carId] && (
              <>
                <span className="text-ink-3"> · </span>
                <Link to={`/car/${w.carId}`} className="hover:text-ink">
                  {names.cars[w.carId].model_name}
                </Link>
              </>
            )}
          </div>
        </div>
        <Livery src={w.livery} alt={`#${w.carNumber}`} className={cn("w-full transition-transform duration-700 group-hover:-translate-x-2", wide ? "h-52" : "h-36")} />
      </div>
      {rest.length > 0 && (
        <div className="grid border-t sm:grid-cols-2">
          {rest.map((r, i) => (
            <div key={r.carNumber} className={cn("flex items-center gap-3 px-6 py-4", i === 0 && "sm:border-r")}>
              <PosNum n={i + 2} size="md" className="text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px]">{r.driverIds.map((id) => lastName(names?.drivers[id]?.full_name)).join(" / ")}</div>
                <div className="num text-xs text-ink-3">#{r.carNumber}</div>
              </div>
              <Livery src={r.livery} alt="" className="h-10 w-20 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Replay ─────────────────────────────────────────────────────── */

function ReplayTab({ b, raceId, names }: { b: EventBundle; raceId: string; names: ReturnType<typeof useNames> }) {
  const model = useLoad(`replay:${raceId}`, () => loadReplay(b, raceId)).data;
  if (!model)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-[600px]" />
        <p className="text-center text-sm text-ink-3">Loading every lap of the race…</p>
      </div>
    );
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Race replay · {model.cars.length} cars · {clock(model.duration)}</Eyebrow>
          <h2 className="display mt-2 text-[2.4rem] sm:text-[3rem]">Watch it unfold</h2>
        </div>
        <p className="max-w-sm text-sm text-ink-2">Rebuilt from every timed lap: positions, gaps, who was driving and every pit visit, as they happened.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Replay model={model} names={names} classColors={b.classColors} />
      </Suspense>
    </div>
  );
}

/* ── Results ────────────────────────────────────────────────────── */

function ResultsTab({ b }: { b: EventBundle }) {
  const top = b.sessions.filter((s) => !s.parent_session_id);
  const [sid, setSid] = useState(() => [...top].reverse().find((s) => isRace(s.session_type))?.id || top[0]?.id);
  const s = top.find((x) => x.id === sid);
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!s || !isRace(s.session_type)) return;
    supabase
      .from("v2_lap_times")
      .select("elapsed")
      .eq("session_id", s.id)
      .order("elapsed", { ascending: false })
      .limit(1)
      .then(({ data }) => setDuration((data as any)?.[0]?.elapsed ?? null));
  }, [s]);
  if (!top.length) return <Note title="No sessions yet" />;
  return (
    <div>
      <Tabs className="mb-6" value={sid} onChange={setSid} items={top.map((x) => ({ value: x.id, label: x.name }))} />
      {s && <Classification key={s.id} session={s} childIds={b.sessions.filter((c) => c.parent_session_id === s.id).map((c) => c.id)} classColors={b.classColors} liveries={b.liveries} duration={duration} />}
    </div>
  );
}

/* ── Analysis ───────────────────────────────────────────────────── */

function Analysis({ b, race, names, multi }: { b: EventBundle; race: any; names: ReturnType<typeof useNames>; multi: boolean }) {
  const teamNameMap = useMemo(() => Object.fromEntries(Object.entries(names?.teams || {}).map(([k, v]) => [k, v.full_name])), [names]);
  const hourSessions = b.sessions.filter((s) => s.parent_session_id === race.id).sort((a, x) => (a.sort_order ?? 0) - (x.sort_order ?? 0));
  const blocks = [
    { key: "delta", title: "Gap to the class leader", body: "Every car's deficit to its class leader, lap by lap. Shaded bands are caution periods.", el: <ClassTimeDelta sessionId={race.id} teamNameMap={teamNameMap} isMulticlass={multi} seasonClasses={b.seasonClasses} /> },
    { key: "strategy", title: "Strategy", body: "Each car's race as stints and pit stops. Click a class to expand it, or a car to highlight it.", el: <StrategyTimeline sessionId={race.id} teamNameMap={teamNameMap} isMulticlass={multi} seasonClasses={b.seasonClasses} /> },
    ...(hourSessions.length
      ? [{ key: "progression", title: "Positions hour by hour", body: "How the order changed at every hour mark.", el: <PositionProgressionChart hourSessions={hourSessions} teamNameMap={teamNameMap} isMulticlass={multi} seasonClasses={b.seasonClasses} /> }]
      : []),
  ];
  return (
    <div className="space-y-10">
      {blocks.map((x) => (
        <section key={x.key} className="overflow-hidden rounded-[28px] border bg-sheet">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-6 py-5">
            <h3 className="display text-3xl">{x.title}</h3>
            <p className="max-w-md text-sm text-ink-2">{x.body}</p>
          </div>
          <div className="p-4 sm:p-6">
            <Suspense fallback={<Skeleton className="h-80" />}>{x.el}</Suspense>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Race control ───────────────────────────────────────────────── */

function RaceControl({ b }: { b: EventBundle }) {
  const [q, setQ] = useState("");
  const items = useMemo(
    () =>
      b.sections
        .flatMap((s) => (s.v2_annotation_items || []).map((i: any) => ({ ...i, session: b.sessions.find((x) => x.id === s.session_id)?.name })))
        .map((i: any) => {
          const m = i.description.match(/^\[([^\]]*)\]\s*\(([^)]*)\)\s*(.*)$/);
          return { time: m?.[1] || "", offset: m?.[2] || "", text: (m?.[3] || i.description).trim(), color: i.color, session: i.session, sort: i.sort_order };
        })
        .sort((a: any, x: any) => (a.offset < x.offset ? -1 : 1)),
    [b],
  );
  const shown = items.filter((i: any) => !q || i.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div className="lg:sticky lg:top-40 lg:self-start">
        <Eyebrow>Race control</Eyebrow>
        <h2 className="display mt-2 text-[2.4rem]">The official log</h2>
        <p className="mt-2 text-sm text-ink-2">{items.length} messages: penalties, flags, pit lane status and more.</p>
        <label className="relative mt-5 block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Car 7, penalty, FCY…" className="h-11 w-full rounded-full border bg-sheet pl-10 pr-4 text-sm outline-none focus:border-ink/40" />
        </label>
      </div>
      <ol className="relative border-l pl-6">
        {shown.map((i: any, k: number) => (
          <li key={k} className="relative pb-5">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-paper" style={{ backgroundColor: i.color || "hsl(var(--ink-3))" }} />
            <div className="num text-[11px] text-ink-3">
              {i.offset.replace(/^\+/, "+")} {i.session && <span className="ml-1">· {i.session}</span>}
            </div>
            <p className="mt-0.5 text-[15px]">{i.text.charAt(0) + i.text.slice(1).toLowerCase()}</p>
          </li>
        ))}
        {!shown.length && <li className="text-sm text-ink-3">No messages match “{q}”.</li>}
      </ol>
    </div>
  );
}
