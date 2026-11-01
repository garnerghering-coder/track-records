import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cleanName, isRookie, lastName, useSeasonStandings } from "@/site/data";
import { ClassTag, Eyebrow, Note, Page, SectionHead } from "@/site/ui";
import {
  age,
  bySeason,
  carLabel,
  countBy,
  isPodium,
  isWin,
  origin,
  plural,
  raceTitle,
  shapeAxes,
  tally,
  teammatesOf,
  useRecordBook,
  type Entry,
  type RecordBook,
  type ShapeAxis,
} from "@/site/records";
import {
  GhostLink,
  LiveryStage,
  MarkLegend,
  NotOnRecord,
  RecordSkeleton,
  RecordStrip,
  ResultRow,
  SeasonHead,
  ShapeRadar,
  ShareButton,
  TONE_A,
  Timeline,
} from "@/site/record-ui";

export default function DriverProfile() {
  const { id = "" } = useParams<{ id: string }>();
  const book = useRecordBook();
  const driver = book?.drivers[id];

  return (
    <div className="min-h-screen">
      <SEOHead
        title={driver ? `${cleanName(driver.full_name)} – Driver record` : "Driver record"}
        description={
          driver ? `${cleanName(driver.full_name)}'s sportscar racing record: starts, class wins, podiums, career timeline and teammates.` : undefined
        }
        canonical={`/driver/${id}`}
      />
      <Header />
      <Page className="pt-6 sm:pt-10">
        {!book ? (
          <RecordSkeleton />
        ) : !driver ? (
          <NotOnRecord what="driver" back="/drivers" backLabel="All drivers" />
        ) : (
          <DriverRecord key={id} book={book} id={id} />
        )}
      </Page>
      <Footer />
    </div>
  );
}

function DriverRecord({ book, id }: { book: RecordBook; id: string }) {
  const driver = book.drivers[id];
  const name = cleanName(driver.full_name);
  const entries = useMemo(() => book.byDriver.get(id) || [], [book, id]);
  const t = useMemo(() => tally(entries, book.driverPoles.get(id) || 0), [entries, book, id]);
  const fp = book.fingerprints[id];
  const axes = shapeAxes(fp);
  const from = origin(driver.nationality);
  const yrs = age(driver.date_of_birth);
  const latest = t.last;
  const team = latest?.teamId ? book.teams[latest.teamId]?.full_name : null;
  const car = latest?.carId ? carLabel(book.cars[latest.carId]) : "";
  const seasons = bySeason(entries);
  const mates = useMemo(() => teammatesOf(id, entries), [id, entries]);
  const teams = countBy(entries, (e) => e.teamId);
  const cars = countBy(entries, (e) => e.carId);
  const eventsSeen = book.driverEvents.get(id)?.size || 0;
  const parts = name.split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const last = parts[parts.length - 1];

  const lead = (() => {
    if (!t.starts)
      return (
        <>
          {name} is on the record from {eventsSeen ? plural(eventsSeen, "event") : "the entry lists"} but hasn't taken a race start yet. Results appear here
          after the first green flag.
        </>
      );
    const seriesText = t.series.join(" and ");
    const oneClass = t.classes.length === 1 ? `${t.classes[0]} ` : "";
    const headline =
      t.wins > 0 ? (
        <>
          , with <span className="mark">{plural(t.wins, `${oneClass}class win`)}</span>
          {t.podiums > t.wins ? ` and ${plural(t.podiums, "podium")}` : ""}
        </>
      ) : t.podiums > 0 ? (
        <>
          , with <span className="mark">{plural(t.podiums, `${oneClass}class podium`)}</span>
        </>
      ) : t.best != null ? (
        <>, with a best class finish of P{t.best}</>
      ) : null;
    return (
      <>
        {plural(t.starts, "start")} in {seriesText}
        {t.seasons > 1 ? ` across ${t.seasons} seasons` : ""}
        {headline}.{" "}
        {latest && (
          <>
            Most recently in the <span className="whitespace-nowrap">#{latest.carNumber}</span>
            {car ? ` ${car}` : ""}
            {team ? ` for ${team}` : ""}.
          </>
        )}
      </>
    );
  })();

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={latest ? "grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-6" : "max-w-4xl"}>
        <div className="relative z-10 min-w-0">
          <Eyebrow>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Driver record</span>
            {from.code && <FlagImage nationality={driver.nationality} size={16} className="rounded-[2px]" />}
            {from.country && <span>{from.place ? `${from.place}, ${from.country}` : from.country}</span>}
            {yrs != null && (
              <>
                <span aria-hidden>·</span>
                <span>Age {yrs}</span>
              </>
            )}
            {isRookie(driver.full_name) && (
              <>
                <span aria-hidden>·</span>
                <span>Rookie</span>
              </>
            )}
          </Eyebrow>
          <h1 className="display mt-5 break-words text-[3.6rem] leading-[0.88] sm:text-[5.4rem] lg:text-[6.6rem]">
            {first && <span className="block">{first}</span>}
            <em className="block">{last}</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">{lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShareButton title={`${name} – Track Records`} text={`${name}'s racing record`} />
            <GhostLink to={`/compare?a=${id}`}>Compare with…</GhostLink>
          </div>
        </div>
        {latest && (
          <LiveryStage
            src={latest?.livery}
            number={latest?.carNumber}
            color={latest?.classColor}
            alt={latest ? `#${latest.carNumber} ${car}` : ""}
            className="-mx-2 sm:mx-0"
            caption={
              latest && (
                <>
                  <span className="num">#{latest.carNumber}</span>
                  {car && <span>· {car}</span>}
                  {team && (
                    <>
                      <span>·</span>
                      <Link to={`/team/${latest.teamId}`} className="link-u text-ink-2">
                        {team}
                      </Link>
                    </>
                  )}
                  <span>
                    · {raceTitle(latest)} {latest.year}
                  </span>
                </>
              )
            }
          />
        )}
      </section>

      {!t.starts ? (
        <Note title="No race starts yet" className="mt-14 sm:mt-20">
          The record fills in race by race: starts, results, the career timeline, co-drivers and the driving shape all appear after {lastName(driver.full_name)}
          's first green flag.
        </Note>
      ) : (
        <>
          {/* ── Record strip ─────────────────────────────────────── */}
          <section className="mt-14 sm:mt-20" aria-label="Career record">
            <RecordStrip
              items={[
                {
                  label: "Starts",
                  value: t.starts,
                  sub: t.events ? `${plural(t.events, "event")}` : "No starts yet",
                },
                {
                  label: "Class wins",
                  value: t.wins,
                  sub: t.starts ? `${Math.round((t.wins / t.starts) * 100)}% of starts` : undefined,
                },
                {
                  label: "Podiums",
                  value: t.podiums,
                  sub: t.starts ? `${Math.round((t.podiums / t.starts) * 100)}% of starts` : undefined,
                },
                {
                  label: "Best finish",
                  value: t.best != null ? `P${t.best}` : null,
                  sub: t.best != null ? `${t.bestCount > 1 ? `×${t.bestCount} · ` : ""}${t.bestClass || "overall"}` : "No classified finish",
                },
                { label: "Class poles", value: t.poles, sub: "In qualifying" },
                {
                  label: "Finished",
                  value: t.starts ? `${Math.round((t.finishes / t.starts) * 100)}%` : null,
                  sub: t.starts ? `${t.dnfs} DNF` : undefined,
                },
                {
                  label: "Seasons",
                  value: t.seasons,
                  sub: t.years.length ? (t.years.length > 1 ? `${t.years[0]}–${t.years[t.years.length - 1]}` : String(t.years[0])) : undefined,
                },
              ]}
            />
            {(teams.length > 0 || cars.length > 0) && (
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                {teams.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow mr-1">Drove for</span>
                    {teams.slice(0, 5).map((x) => (
                      <Link
                        key={x.key}
                        to={`/team/${x.key}`}
                        className="rounded-full border bg-sheet px-3 py-1 text-ink-2 transition-colors hover:border-ink/30 hover:text-ink"
                      >
                        {book.teams[x.key]?.full_name || "Team"} <span className="num text-xs text-ink-3">{x.n}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {cars.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow mr-1">In the</span>
                    {cars.slice(0, 4).map((x) => (
                      <Link
                        key={x.key}
                        to={`/car/${x.key}`}
                        className="rounded-full border bg-sheet px-3 py-1 text-ink-2 transition-colors hover:border-ink/30 hover:text-ink"
                      >
                        {carLabel(book.cars[x.key])} <span className="num text-xs text-ink-3">{x.n}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Timeline ─────────────────────────────────────────── */}
          <section className="mt-24 sm:mt-32">
            <SectionHead
              eyebrow={t.years.length ? `${t.years[0]}${t.years.length > 1 ? `–${t.years[t.years.length - 1]}` : ""} · ${plural(t.starts, "race")}` : "Career"}
              title={
                <>
                  Race by <em>race</em>
                </>
              }
              action={<MarkLegend className="mb-2 hidden md:flex" />}
            />
            {entries.length ? (
              <>
                <Timeline
                  lanes={[...seasons].reverse().map((s) => ({
                    id: s.seasonId,
                    title: s.year,
                    sub: s.seriesShort,
                    year: s.year,
                    rows: s.rows,
                  }))}
                  describe={(e) => <EntryLine e={e} book={book} self={id} />}
                />
                <MarkLegend className="mt-4 md:hidden" />
              </>
            ) : (
              <Note title="No races yet">{name} appears in practice or qualifying, but hasn't started a race on the record.</Note>
            )}
          </section>

          {/* ── Shape ────────────────────────────────────────────── */}
          <section className="mt-24 sm:mt-32">
            <SectionHead
              eyebrow={fp?.events_included ? `Built from ${plural(fp.events_included, "event")}` : "Driver fingerprint"}
              title={
                <>
                  The <em>shape</em> of a driver
                </>
              }
            />
            <ShapeBlock axes={axes} events={fp?.events_included ?? t.events} name={lastName(driver.full_name)} />
          </section>

          {/* ── Teammates ────────────────────────────────────────── */}
          <section className="mt-24 sm:mt-32">
            <SectionHead
              eyebrow={mates.length ? `${plural(mates.length, "co-driver")}` : "Co-drivers"}
              title={
                <>
                  Shared the <em>car</em>
                </>
              }
            />
            {mates.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mates.slice(0, 9).map((m) => (
                  <MateCard key={m.id} book={book} self={id} mateId={m.id} races={m.races} />
                ))}
              </div>
            ) : (
              <Note title="Solo so far">
                {t.starts
                  ? `Every start on the record was a solo drive. Co-drivers appear here once ${lastName(driver.full_name)} shares a car in an endurance race.`
                  : "Co-drivers appear here once races are on the record."}
              </Note>
            )}
            {mates.length > 9 && <p className="mt-4 text-sm text-ink-3">And {plural(mates.length - 9, "more co-driver")} in the results below.</p>}
          </section>

          {/* ── Results ──────────────────────────────────────────── */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow="Every start" title="Results" />
            {seasons.length ? (
              <div className="space-y-12">
                {seasons.map((s) => (
                  <div key={s.seasonId}>
                    <SeasonHead year={s.year} series={s.seriesName} right={<SeasonSummary seasonId={s.seasonId} driverId={id} rows={s.rows} />} />
                    <ul>
                      {[...s.rows].reverse().map((e) => (
                        <ResultRow
                          key={e.key}
                          e={e}
                          primary={
                            <>
                              {e.carId ? carLabel(book.cars[e.carId]) : ""}
                              {e.teamId && <span className="text-ink-3"> · {book.teams[e.teamId]?.full_name}</span>}
                            </>
                          }
                          secondary={coDrivers(e, id, book)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <Note title="Nothing classified yet">Race results appear here after {name}'s first start.</Note>
            )}
          </section>
        </>
      )}
    </>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function coDrivers(e: Entry, self: string, book: RecordBook) {
  const others = e.driverIds.filter((d) => d !== self);
  if (!others.length) return null;
  return (
    <>
      with{" "}
      {others.map((d, i) => (
        <span key={d}>
          {i > 0 && (i === others.length - 1 ? " & " : ", ")}
          <Link to={`/driver/${d}`} className="hover:text-ink hover:underline hover:underline-offset-2">
            {lastName(book.drivers[d]?.full_name)}
          </Link>
        </span>
      ))}
    </>
  );
}

function EntryLine({ e, book, self }: { e: Entry; book: RecordBook; self: string }) {
  const team = e.teamId ? book.teams[e.teamId]?.full_name : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
      <ClassTag name={e.className} color={e.classColor} />
      <span>
        {e.status === "finished" ? `P${e.pic} of ${e.classSize}` : e.status.toUpperCase()}
        <span className="text-ink-3"> · #{e.carNumber}</span>
        {team && <span className="text-ink-3"> · {team}</span>}
      </span>
      {e.driverIds.length > 1 && <span className="w-full text-xs text-ink-3 sm:text-right">{coDrivers(e, self, book)}</span>}
    </div>
  );
}

function SeasonSummary({ seasonId, driverId, rows }: { seasonId: string; driverId: string; rows: Entry[] }) {
  const st = useSeasonStandings(seasonId);
  const t = tally(rows);
  const mine = st?.byClass.flatMap((c) => c.rows.map((r) => ({ ...r, className: c.className }))).find((r) => r.driverId === driverId && r.totalPoints > 0);
  return (
    <span className="inline-flex flex-wrap gap-x-3 sm:justify-end">
      <span>
        {plural(t.starts, "start")}
        {t.wins ? ` · ${plural(t.wins, "win")}` : ""}
        {t.podiums ? ` · ${plural(t.podiums, "podium")}` : ""}
      </span>
      {mine && (
        <span className="text-ink-2">
          P{mine.position} in {mine.className || "the"} championship · <span className="num">{mine.totalPoints.toLocaleString()}</span> pts
        </span>
      )}
    </span>
  );
}

function ShapeBlock({ axes, events, name }: { axes: ShapeAxis[]; events: number; name: string }) {
  const known = axes.filter((a) => a.value != null);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="sheet relative flex flex-col items-center justify-center p-8 sm:p-12">
        <ShapeRadar series={[{ axes, tone: TONE_A }]} className="max-w-[400px]" />
        {known.length === 0 && (
          <p className="mt-2 max-w-xs text-center text-sm text-ink-3">
            The shape forms after 5 events. {name} has {plural(events, "event")} so far.
          </p>
        )}
      </div>
      <div className="sheet divide-y px-6 sm:px-8">
        {axes.map((a) => (
          <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[15px] font-medium">{a.label}</span>
                {a.band && <span className="eyebrow">{a.band}</span>}
              </div>
              <p className="mt-1 text-sm text-ink-2">{a.value != null ? a.about : `Not enough data yet: needs ${a.needs}.`}</p>
            </div>
            <div className="text-right">
              {a.value != null ? (
                <>
                  <div className="num text-[1.8rem] leading-none">{Math.round(a.value)}</div>
                  <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-ink/[0.08]">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${a.value}%` }} />
                  </div>
                </>
              ) : (
                <div className="num text-[1.8rem] leading-none text-ink-3">—</div>
              )}
            </div>
          </div>
        ))}
        <p className="py-4 text-xs text-ink-3">
          Scores run 0–100 and compare drivers within their class. Each appears only once there's enough racing behind it.
        </p>
      </div>
    </div>
  );
}

function MateCard({ book, self, mateId, races }: { book: RecordBook; self: string; mateId: string; races: Entry[] }) {
  const mate = book.drivers[mateId];
  const name = cleanName(mate?.full_name) || "Unknown driver";
  const wins = races.filter(isWin).length;
  const pods = races.filter(isPodium).length;
  const numbers = [...new Set(races.map((r) => r.carNumber))];
  const best = races.filter((r) => r.status === "finished" && r.pic != null).sort((a, b) => a.pic! - b.pic!)[0];
  return (
    <div className="group relative flex flex-col rounded-3xl border bg-sheet p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>
            {mate?.nationality && <FlagImage nationality={mate.nationality} size={14} className="rounded-[2px]" />}
            {numbers.map((n) => `#${n}`).join(" · ")}
          </Eyebrow>
          <Link to={`/driver/${mateId}`} className="display mt-2 block text-[1.8rem] leading-[1.02] after:absolute after:inset-0 after:rounded-3xl">
            {name}
          </Link>
        </div>
        <div className="text-right">
          <div className="num text-[2rem] leading-none">{races.length}</div>
          <div className="eyebrow mt-1">{races.length === 1 ? "race" : "races"}</div>
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3 border-t pt-4 text-sm text-ink-2">
        <span>
          {wins
            ? `${plural(wins, "win")} together`
            : pods
              ? `${plural(pods, "podium")} together`
              : best
                ? `Best together: P${best.pic}`
                : "No classified finish together"}
        </span>
        <Link
          to={`/compare?a=${self}&b=${mateId}`}
          className="relative z-10 inline-flex shrink-0 items-center gap-1 text-xs text-ink-3 hover:text-ink focus-visible:text-ink"
          aria-label={`Compare with ${name}`}
        >
          Compare <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
