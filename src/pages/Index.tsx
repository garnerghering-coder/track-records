import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import Header, { openSearch } from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { getClassColor } from "@/lib/classes";
import { classRank, fmtDuration, type ClassifiedCar, type Insight, type RaceDigest } from "@/lib/insights";
import {
  cleanName,
  lastName,
  layoutFor,
  useDigests,
  useEvents,
  useLayouts,
  useNames,
  useSeasons,
  useSeasonStandings,
  type EventLite,
  type SeasonLite,
} from "@/site/data";
import { ClassTag, Eyebrow, Livery, Page, PosNum, SectionHead, Skeleton, Sparkline, Ticker, TrackMap, dateRange } from "@/site/ui";

const stripYear = (name: string) => name.replace(/^\d{4}\s+/, "");

const Index = () => {
  const events = useEvents();
  const digests = useDigests();
  const names = useNames();
  const layouts = useLayouts();
  const seasons = useSeasons();

  const today = new Date().toISOString().slice(0, 10);
  const past = useMemo(() => (events || []).filter((e) => (e.start_date || "") <= today && digests?.[e.id]?.races.length), [events, digests, today]);
  const lead = past[0];
  const leadDigest = lead ? digests?.[lead.id] : undefined;
  const leadRace = leadDigest?.races[leadDigest.races.length - 1];
  const more = past.slice(1, 5);

  const championships = useMemo(() => {
    const seen = new Set<string>();
    return (seasons || []).filter((s) => s.eventCount > 0 && !seen.has(s.series.id) && seen.add(s.series.id));
  }, [seasons]);

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Track Records – The record of sportscar racing"
        description="Replay every race, read the story in the numbers, and follow every driver's record across IMSA and beyond."
        canonical="/"
      />
      <Header />

      {/* ── Lead story ─────────────────────────────────────────── */}
      <Page className="pt-6 sm:pt-10">
        {!lead || !leadRace ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <Skeleton className="h-[420px]" />
            <Skeleton className="h-[420px]" />
          </div>
        ) : (
          <LeadStory ev={lead} race={leadRace} names={names} layout={layoutFor(lead, layouts)} />
        )}
      </Page>

      {/* ── Insights ───────────────────────────────────────────── */}
      {lead && leadRace && leadRace.insights.length > 0 && (
        <Page className="mt-20 sm:mt-28">
          <SectionHead eyebrow={`${stripYear(lead.name)} · ${leadRace.sessionName}`} title={<>The race in <em>numbers</em></>} to={`/events/${lead.id}`} />
          <InsightGrid insights={leadRace.insights} names={names} />
          <StatsRibbon race={leadRace} />
        </Page>
      )}

      {/* ── More races ─────────────────────────────────────────── */}
      {more.length > 0 && (
        <Page className="mt-24 sm:mt-32">
          <SectionHead eyebrow="Also on the record" title="Recent races" to="/results" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {more.map((e) => {
              const d = digests?.[e.id];
              return <RaceCard key={e.id} ev={e} race={d?.races[d.races.length - 1]} names={names} />;
            })}
          </div>
        </Page>
      )}

      {/* ── Championships ──────────────────────────────────────── */}
      {championships.length > 0 && (
        <Page className="mt-24 sm:mt-32">
          <SectionHead eyebrow="Who leads" title="Championships" to="/series" />
          <div className="grid gap-4 lg:grid-cols-3">
            {championships.map((s) => (
              <ChampionshipCard key={s.id} season={s} />
            ))}
          </div>
        </Page>
      )}

      {/* ── Explore ────────────────────────────────────────────── */}
      <Page className="mt-24 sm:mt-32">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <button onClick={openSearch} className="group relative overflow-hidden rounded-[28px] bg-ink p-8 text-left text-paper sm:p-12">
            <Eyebrow className="text-paper/50">Search the record</Eyebrow>
            <p className="display mt-4 max-w-lg text-4xl leading-[1.02] sm:text-6xl">
              Any driver, team, car or circuit. <em className="text-hl">One keystroke.</em>
            </p>
            <span className="mt-8 inline-flex items-center gap-3 rounded-full bg-paper/10 px-4 py-2.5 text-sm">
              Press <kbd className="rounded-md bg-paper/15 px-2 py-0.5 font-mono text-xs">/</kbd> anywhere
            </span>
          </button>
          <Link to="/compare" className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border bg-sheet p-8 sm:p-10">
            <div>
              <Eyebrow>New</Eyebrow>
              <p className="display mt-4 text-4xl leading-[1.02] sm:text-5xl">
                Head to head.
              </p>
              <p className="mt-3 max-w-xs text-ink-2">Put any two drivers side by side: results, shape and the races they shared.</p>
            </div>
            <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium">
              Compare drivers <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </Page>

      <Footer />
    </div>
  );
};

/* ── Lead story ─────────────────────────────────────────────────── */

function LeadStory({ ev, race, names, layout }: { ev: EventLite; race: RaceDigest; names: ReturnType<typeof useNames>; layout?: { layout_image_url?: string | null } }) {
  const overall = [...race.winners].sort((a, b) => a.position - b.position)[0];
  const drivers = overall?.driverIds.map((id) => names?.drivers[id]?.full_name).filter(Boolean) as string[];
  const car = overall?.carId ? names?.cars[overall.carId]?.model_name : undefined;
  const team = overall?.teamId ? names?.teams[overall.teamId]?.full_name : undefined;
  const margin = race.insights.find((i) => i.kind === "margin" || (i.kind === "closest_finish" && i.carNumber === overall?.carNumber));
  const multi = race.classes.length > 1;
  const shown = multi ? race.winners : race.podiums[race.classes[0].name] || [];
  const sentence = overall && (
    <>
      {joinNames(drivers.map(cleanName))} won{multi ? " overall" : ""} in the{" "}
      <span className="whitespace-nowrap">#{overall.carNumber}</span>
      {car ? ` ${car}` : ""}
      {team ? ` for ${team}` : ""}
      {margin ? (
        <>
          , <span className="mark">{margin.value}</span> ahead
        </>
      ) : null}
      {overall.laps ? ` after ${overall.laps} laps.` : "."}
    </>
  );

  return (
    <article>
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-4">
        <div className="relative z-10">
          <Eyebrow>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-hl px-2 py-0.5 text-hl-ink">Latest race</span>
            <span>{ev.series?.short_name || ev.series?.name}</span>
            <span>·</span>
            <span>{dateRange(ev.start_date, ev.end_date)}</span>
          </Eyebrow>
          <h1 className="display mt-5 text-[3.4rem] leading-[0.9] sm:text-[5rem] lg:text-[6.4rem]">
            {stripYear(ev.name)}
            <span className="ml-3 align-top font-mono text-base tracking-normal text-ink-3 sm:text-lg">{ev.year}</span>
          </h1>
          {sentence && <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">{sentence}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            {race.hasLaps && (
              <Link
                to={`/events/${ev.id}?tab=replay`}
                className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-ink pl-2 pr-6 text-[15px] font-medium text-paper transition-transform hover:scale-[1.02]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hl text-hl-ink">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                Replay the race
              </Link>
            )}
            <Link to={`/events/${ev.id}`} className="inline-flex h-12 items-center gap-2 rounded-full border px-6 text-[15px] hover:bg-ink/[0.05]">
              The full story <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="relative -mx-4 aspect-[16/11] sm:mx-0">
          <TrackMap src={layout?.layout_image_url} alt="" className="absolute inset-0 m-auto h-[92%] w-[92%] opacity-[0.07]" />
          {overall && (
            <span className="pointer-events-none absolute -top-2 right-2 font-accent text-[9rem] leading-none text-ink/[0.06] sm:text-[13rem]">
              {overall.carNumber}
            </span>
          )}
          <Livery src={overall?.livery} alt={`#${overall?.carNumber}`} className="absolute inset-0 m-auto w-full drop-shadow-[0_30px_30px_rgba(0,0,0,0.25)] transition-transform duration-700 hover:-translate-x-2" />
        </div>
      </div>

      {/* class winners */}
      <div className={`mt-10 grid gap-px overflow-hidden rounded-3xl border bg-rule ${shown.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : shown.length === 3 ? "sm:grid-cols-3" : shown.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {shown.map((c, i) => (
          <WinnerCell key={c.carNumber} car={c} names={names} label={multi ? undefined : `P${i + 1}`} color={race.classes.find((k) => k.name === c.className)?.color} />
        ))}
      </div>
    </article>
  );
}

function WinnerCell({ car, names, label, color }: { car: ClassifiedCar; names: ReturnType<typeof useNames>; label?: string; color?: string | null }) {
  const c = color || getClassColor(car.className);
  return (
    <div className="group relative flex items-center gap-4 bg-sheet p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {label ? <span className="eyebrow">{label}</span> : <ClassTag name={car.className} color={color} />}
          <span className="num text-xs text-ink-3">#{car.carNumber}</span>
        </div>
        <div className="mt-2 space-y-0.5 text-[15px] leading-snug">
          {car.driverIds.slice(0, 4).map((id) => (
            <Link key={id} to={`/driver/${id}`} className="block truncate hover:underline hover:underline-offset-4">
              {lastName(names?.drivers[id]?.full_name) || "…"}
            </Link>
          ))}
        </div>
        {car.teamId && <div className="mt-1 truncate text-xs text-ink-3">{names?.teams[car.teamId]?.full_name}</div>}
      </div>
      <Livery src={car.livery} alt={`#${car.carNumber}`} className="h-14 w-28 shrink-0 transition-transform duration-500 group-hover:-translate-x-1 sm:w-32" />
    </div>
  );
}

/* ── Insights ───────────────────────────────────────────────────── */

export function InsightGrid({ insights, names, max = 5 }: { insights: Insight[]; names: ReturnType<typeof useNames>; max?: number }) {
  const list = insights.slice(0, max);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((i, k) => (
        <div key={i.kind} className={`sheet flex flex-col justify-between p-6 sm:p-7 ${k === 0 ? "lg:row-span-2 lg:p-9" : ""}`}>
          <Eyebrow>{i.title}</Eyebrow>
          <div className={`display mt-4 tabular-nums ${k === 0 ? "text-[5.5rem] leading-[0.85] lg:text-[8rem]" : "text-6xl"}`}>
            {k === 0 ? <span className="mark">{i.value}</span> : i.value}
          </div>
          <p className={`mt-4 text-ink-2 ${k === 0 ? "text-lg" : "text-[15px]"}`}>
            {i.detail}
            {i.driverIds && i.driverIds.length > 0 && names && i.kind !== "longest_stint" && i.kind !== "quickest_stop" && (
              <span className="text-ink-3"> {i.driverIds.map((id) => lastName(names.drivers[id]?.full_name)).filter(Boolean).join(" / ")}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

export function StatsRibbon({ race }: { race: RaceDigest }) {
  const s = race.stats;
  const items = [
    { label: "Starters", value: s.cars, fmt: (n: number) => String(n) },
    { label: "Finished", value: s.finishers, fmt: (n: number) => String(n) },
    s.leaderLaps != null && { label: "Laps", value: s.leaderLaps, fmt: (n: number) => n.toLocaleString() },
    s.distanceKm != null && { label: "Distance", value: s.distanceKm, fmt: (n: number) => `${n.toLocaleString()} km` },
    s.durationS != null && { label: "Duration", value: s.durationS, fmt: (n: number) => fmtDuration(n), static: true },
    s.leadChanges != null && { label: "Lead changes", value: s.leadChanges, fmt: (n: number) => String(n) },
    s.pitStops > 0 && { label: "Pit stops", value: s.pitStops, fmt: (n: number) => n.toLocaleString() },
  ].filter(Boolean) as { label: string; value: number; fmt: (n: number) => string; static?: boolean }[];
  return (
    <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-rule sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {items.map((it) => (
        <div key={it.label} className="bg-sheet px-5 py-5">
          <div className="eyebrow">{it.label}</div>
          <div className="num mt-2 text-2xl">{it.static ? it.fmt(it.value) : <Ticker value={it.value} format={it.fmt} />}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Race card ──────────────────────────────────────────────────── */

export function RaceCard({ ev, race, names }: { ev: EventLite; race?: RaceDigest; names: ReturnType<typeof useNames> }) {
  const overall = race ? [...race.winners].sort((a, b) => a.position - b.position)[0] : undefined;
  const tint = getClassColor(overall?.className);
  return (
    <Link to={`/events/${ev.id}`} className="group flex flex-col overflow-hidden rounded-3xl border bg-sheet transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)]">
      <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${tint}22, transparent 70%)` }}>
        <span className="absolute -bottom-6 -right-2 font-accent text-[7rem] leading-none text-ink/[0.06]">{overall?.carNumber}</span>
        <Livery src={overall?.livery} alt="" className="absolute inset-x-4 bottom-2 m-auto h-28 w-[88%] transition-transform duration-500 group-hover:-translate-x-2 group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <Eyebrow>
          {ev.series?.short_name || ev.series?.name} · {dateRange(ev.start_date, ev.end_date)}
        </Eyebrow>
        <h3 className="display mt-2 text-[1.75rem] leading-[1.02]">{stripYear(ev.name)}</h3>
        <div className="mt-auto pt-4 text-sm text-ink-2">
          {overall ? (
            <>
              <span className="text-ink-3">Won by </span>
              {overall.driverIds.map((id) => lastName(names?.drivers[id]?.full_name)).filter(Boolean).join(" / ")}
            </>
          ) : (
            "Classification pending"
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Championship card ─────────────────────────────────────────── */

function ChampionshipCard({ season }: { season: SeasonLite }) {
  const st = useSeasonStandings(season.id);
  return (
    <Link to={`/series/${season.series.id}`} className="group flex flex-col rounded-3xl border bg-sheet p-6 transition-colors hover:border-ink/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>
            {season.series.short_name} · {season.year}
          </Eyebrow>
          <h3 className="display mt-2 text-[1.9rem] leading-[1.02]">{season.series.name}</h3>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      <div className="mt-6 space-y-4">
        {!st && <Skeleton className="h-24" />}
        {st && st.byClass.every((c) => c.rows.every((r) => r.totalPoints === 0)) && <p className="text-sm text-ink-3">No points published yet this season.</p>}
        {st?.byClass
          .filter((c) => c.rows[0]?.totalPoints > 0)
          .sort((a, b) => classRank(a.className) - classRank(b.className))
          .map((c) => {
            const leader = c.rows[0];
            const second = c.rows.find((r) => r.position > leader.position);
            const col = getClassColor(c.className);
            return (
              <div key={c.className} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <PosNum n={1} size="sm" className="w-5 text-center" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {c.className && <ClassTag name={c.className} />}
                    <span className="truncate text-[15px]">
                      {c.rows
                        .filter((r) => r.position === leader.position)
                        .map((r) => lastName(r.name))
                        .join(" / ")}
                    </span>
                  </div>
                  <Sparkline values={leader.cumulative} color={col} className="mt-1.5 h-5" />
                </div>
                <div className="text-right">
                  <div className="num text-lg">{leader.totalPoints}</div>
                  {second && <div className="num text-[11px] text-ink-3">+{leader.totalPoints - second.totalPoints}</div>}
                </div>
              </div>
            );
          })}
      </div>
      <div className="mt-auto pt-5 text-xs text-ink-3">
        {st ? `${st.rounds} ${st.rounds === 1 ? "round" : "rounds"} scored` : ""}
      </div>
    </Link>
  );
}

function joinNames(list: string[]) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export default Index;
