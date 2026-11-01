import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { classRank } from "@/lib/insights";
import { useEvents, useLayouts, useSeasonLeaders, useSeasons, layoutFor, lastName, type SeasonLite, type SeasonStandings } from "@/site/data";
import { Eyebrow, Note, Page, PosNum, Skeleton, Sparkline, TrackMap, Ticker } from "@/site/ui";
import { classColor, plural, useSeasonClasses, useSeries, type SeriesRow } from "@/site/archive";

/** Leaders (position 1, ties included) and the runner-up's points of each class, from the light leaders file. */
function leadersOf(st: SeasonStandings | undefined) {
  if (!st) return null;
  return st.byClass
    .map((c) => {
      const lead = c.rows.filter((r) => r.position === 1);
      const second = c.rows.find((r) => r.position > 1);
      return { c: c.className, lead, gap: lead[0] && second ? lead[0].totalPoints - second.totalPoints : null };
    })
    .filter((x) => x.lead.length && x.lead[0].totalPoints > 0)
    .sort((a, b) => classRank(a.c) - classRank(b.c));
}

const PAST_SHOWN = 4;

const SeriesIndex = () => {
  const series = useSeries();
  const seasons = useSeasons();
  const events = useEvents();

  const rows = useMemo(() => {
    if (!series || !seasons) return null;
    return series
      .map((s) => {
        const list = seasons.filter((x) => x.series.id === s.id).sort((a, b) => b.year - a.year);
        return { series: s, seasons: list, rounds: list.reduce((n, x) => n + x.eventCount, 0) };
      })
      // Most recently raced first, then the longest record.
      .sort((a, b) => (b.seasons.find((x) => x.eventCount > 0)?.year ?? 0) - (a.seasons.find((x) => x.eventCount > 0)?.year ?? 0) || b.rounds - a.rounds || a.series.name.localeCompare(b.series.name));
  }, [series, seasons]);

  const totalSeasons = seasons?.filter((s) => s.eventCount > 0).length ?? 0;
  const totalRounds = events?.length ?? 0;

  return (
    <div className="min-h-screen">
      <SEOHead title="Championships" description="Every championship on the record: points races, standings and every round, season by season." canonical="/series" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <Eyebrow>Championships</Eyebrow>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
              Every title fight, <em>round by round.</em>
            </h1>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-ink-2 lg:justify-self-end">
            Points races, standings and the full calendar of each season, computed from the official results.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-3xl border bg-rule">
          {[
            { label: "Championships", value: series?.length },
            { label: "Seasons", value: seasons ? totalSeasons : undefined },
            { label: "Rounds", value: events ? totalRounds : undefined },
          ].map((s) => (
            <div key={s.label} className="bg-sheet px-4 py-5 sm:px-6">
              <div className="eyebrow">{s.label}</div>
              <div className="num mt-2 text-2xl sm:text-3xl">{s.value == null ? <Skeleton className="h-8 w-12" /> : <Ticker value={s.value} />}</div>
            </div>
          ))}
        </div>
      </Page>

      <Page className="mt-16 space-y-5 sm:mt-24">
        {!rows ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[360px] rounded-[28px]" />)
        ) : rows.length === 0 ? (
          <Note title="No championships yet">Championships appear here once their first season is published.</Note>
        ) : (
          rows.map((r) => <SeriesCard key={r.series.id} series={r.series} seasons={r.seasons} />)
        )}
      </Page>

      <Footer />
    </div>
  );
};

function SeriesCard({ series, seasons }: { series: SeriesRow; seasons: SeasonLite[] }) {
  const latest = seasons.find((s) => s.eventCount > 0) || seasons[0];
  const st = useSeasonLeaders(latest?.id);
  const classes = useSeasonClasses();
  const events = useEvents();
  const layouts = useLayouts();
  const rounds = (events || []).filter((e) => e.season_id === latest?.id).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const leaders = leadersOf(st);
  const finished = latest ? latest.year < new Date().getFullYear() : false;
  const years = seasons.map((s) => s.year);

  return (
    <article className="group/card relative overflow-hidden rounded-[28px] border bg-sheet">
      <div className="grid lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col p-6 sm:p-9">
          <Eyebrow>
            {series.short_name && <span>{series.short_name}</span>}
            {series.short_name && <span>·</span>}
            <span>{years.length > 1 ? `${Math.min(...years)}–${Math.max(...years)}` : years[0]}</span>
          </Eyebrow>
          <h2 className="display mt-3 text-[2.4rem] leading-[0.98] sm:text-[3.2rem]">
            <Link to={`/series/${series.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none [&:focus-visible]:underline">
              {series.name}
            </Link>
          </h2>
          <div className="relative z-10 mt-6 flex flex-wrap gap-2">
            {seasons.filter((s) => s.eventCount > 0).slice(0, 12).map((s) => (
              <Link
                key={s.id}
                to={`/series/${series.id}?season=${s.year}`}
                className="inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors hover:border-ink/40 hover:bg-ink/[0.04]"
              >
                <span className="num">{s.year}</span>
                <span className="text-[11px] text-ink-3">{plural(s.eventCount, "rd", "rds")}</span>
              </Link>
            ))}
          </div>
          {(() => {
            const past = seasons.filter((s) => s.id !== latest?.id && s.eventCount > 0 && s.year < new Date().getFullYear());
            return (
              <>
                {past.slice(0, PAST_SHOWN).map((s) => (
                  <PastChampions key={s.id} season={s} />
                ))}
                {past.length > PAST_SHOWN && (
                  <Link to={`/series/${series.id}?season=${past[PAST_SHOWN].year}`} className="relative z-10 mt-6 text-sm text-ink-2 underline underline-offset-4 hover:text-ink">
                    {plural(past.length - PAST_SHOWN, "earlier season")} on the record
                  </Link>
                )}
              </>
            );
          })()}
          {/* the season in track maps */}
          {rounds.length > 0 && (
            <div className="mt-auto pt-10">
              <div className="eyebrow mb-3">{latest?.year} calendar</div>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {rounds.map((e) => (
                  <div key={e.id} className="flex h-10 w-14 items-center justify-center" title={e.short_name || e.name}>
                    <TrackMap key={layoutFor(e, layouts)?.layout_image_url || "none"} src={layoutFor(e, layouts)?.layout_image_url} alt={e.circuit?.name || ""} className="h-full w-full opacity-70" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-6 sm:p-9 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <Eyebrow>
              {latest?.year} · {finished ? "Champions" : "Leaders"}
              {st && leaders && leaders.length > 0 && <span>· after {plural(st.rounds, "round")}</span>}
            </Eyebrow>
            <ArrowUpRight className="h-5 w-5 text-ink-3 transition-transform group-hover/card:-translate-y-0.5 group-hover/card:translate-x-0.5 group-hover/card:text-ink" />
          </div>
          <div className="mt-6 space-y-5">
            {!leaders && <Skeleton className="h-40" />}
            {leaders && leaders.length === 0 && (
              <p className="max-w-sm text-[15px] text-ink-2">No championship points have been published for {latest?.year} yet. The results of its rounds are on the record.</p>
            )}
            {leaders?.slice(0, 5).map(({ c, lead, gap }) => {
              const col = classColor(latest ? classes?.[latest.id] : undefined, c);
              return (
                <div key={c} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
                  <PosNum n={1} size="md" className="w-6 text-center" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {c && (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col }} />
                          {c}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[16px]">{lead.map((e) => lastName(e.name)).join(" / ")}</div>
                    <Sparkline values={[0, ...lead[0].cumulative]} color={col} className="mt-1.5 h-5" />
                  </div>
                  <div className="text-right">
                    <div className="num text-xl">{lead[0].totalPoints.toLocaleString()}</div>
                    {gap != null && <div className="num text-[11px] text-ink-3">+{gap.toLocaleString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function PastChampions({ season }: { season: SeasonLite }) {
  const st = useSeasonLeaders(season.id);
  const classes = useSeasonClasses();
  if (!st) return <Skeleton className="mt-8 h-16" />;
  const champs = leadersOf(st) || [];
  if (!champs.length) return null;
  return (
    <div className="mt-8">
      <div className="eyebrow mb-2.5">{season.year} champions</div>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {champs.map(({ c, lead }) => (
          <li key={c} className="flex min-w-0 items-center gap-2 text-[14px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: classColor(classes?.[season.id], c) }} />
            {c && <span className="w-[3.6rem] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{c}</span>}
            <span className="truncate">{lead.map((e) => lastName(e.name)).join(" / ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SeriesIndex;
