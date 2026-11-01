import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { classRank } from "@/lib/insights";
import { cleanName, lastName } from "@/site/data";
import { ClassTag, Eyebrow, Note, Page, SectionHead } from "@/site/ui";
import { byRace, bySeason, carLabel, countBy, isPodium, isWin, plural, raceTitle, tally, useRecord, type Entry, type RecordBook } from "@/site/records";
import { GhostLink, LiveryStage, NotOnRecord, RaceGroups, RecordSkeleton, RecordStrip, ResultMark, SeasonHead, ShareButton } from "@/site/record-ui";

export default function TeamProfile() {
  const { id = "" } = useParams<{ id: string }>();
  const book = useRecord("teams", id);
  const team = book?.teams[id];
  return (
    <div className="min-h-screen">
      <SEOHead
        title={team ? `${team.full_name} – Team record` : "Team record"}
        description={team ? `${team.full_name}'s record: entries, wins, podiums, line-ups and results by season.` : undefined}
        canonical={`/team/${id}`}
      />
      <Header />
      <Page className="pt-6 sm:pt-10">
        {!book ? <RecordSkeleton /> : !team ? <NotOnRecord what="team" back="/teams" backLabel="All teams" /> : <TeamRecord key={id} book={book} id={id} />}
      </Page>
      <Footer />
    </div>
  );
}

function TeamRecord({ book, id }: { book: RecordBook; id: string }) {
  const team = book.teams[id];
  const entries = useMemo(() => book.byTeam.get(id) || [], [book, id]);
  const t = useMemo(() => tally(entries), [entries]);
  const cw = t.classed && !t.outright;
  const latest = t.last;
  const seasons = bySeason(entries);
  const cars = countBy(entries, (e) => e.carId);
  const drivers = new Set(entries.flatMap((e) => e.driverIds));
  const latestRace = latest ? entries.filter((e) => e.sessionId === latest.sessionId) : [];
  const latestCar = latest?.carId ? carLabel(book.cars[latest.carId]) : "";
  const winsByClass = countBy(entries.filter(isWin), (e) => e.className);

  const lead = !t.starts ? (
    <>{team.full_name} is on the record, but hasn't started a race yet.</>
  ) : (
    <>
      {plural(t.starts, "car entry", "car entries")} across {plural(t.events, "event")} in {t.series.join(" and ")}
      {t.wins > 0 ? (
        <>
          , with{" "}
          <span className="mark">
            {winsByClass.length === 1 ? `${plural(t.wins, cw ? `${winsByClass[0].key} class win` : "win")}` : plural(t.wins, cw ? "class win" : "win")}
          </span>
          {t.podiums > t.wins ? ` and ${plural(t.podiums, "podium")}` : ""}
        </>
      ) : t.podiums > 0 ? (
        <>
          , with <span className="mark">{plural(t.podiums, cw ? "class podium" : "podium")}</span>
        </>
      ) : t.best != null ? (
        <>, best {cw ? "class " : ""}finish P{t.best}</>
      ) : null}
      .{" "}
      {latest && (
        <>
          Most recently ran {latestRace.length > 1 ? `${latestRace.length} cars` : `the #${latest.carNumber}`}
          {latestCar ? ` ${latestCar}` : ""} at {raceTitle(latest)}.
        </>
      )}
    </>
  );

  return (
    <>
      <section className={latest ? "grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-6" : "max-w-4xl"}>
        <div className="relative z-10 min-w-0">
          <Eyebrow>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Team record</span>
            {t.series.length > 0 && <span>{t.series.join(" · ")}</span>}
            {t.years.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{t.years.length > 1 ? `${t.years[0]}–${t.years[t.years.length - 1]}` : t.years[0]}</span>
              </>
            )}
          </Eyebrow>
          <h1 className="display mt-5 break-words text-[3.2rem] leading-[0.9] sm:text-[4.8rem] lg:text-[5.8rem]">{team.full_name}</h1>
          {t.classes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {t.classes.map((c) => (
                <ClassTag key={c} name={c} color={t.classColors[c]} />
              ))}
            </div>
          )}
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">{lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShareButton title={`${team.full_name} – Track Records`} />
            <GhostLink to="/teams">All teams</GhostLink>
          </div>
        </div>
        {latest && (
          <LiveryStage
            src={latest.livery}
            number={latest.carNumber}
            color={latest.classColor}
            alt={`#${latest.carNumber} ${latestCar}`}
            className="-mx-2 sm:mx-0"
            caption={
              <>
                <span className="num">#{latest.carNumber}</span>
                {latestCar && <span>· {latestCar}</span>}
                <span>
                  · {raceTitle(latest)} {latest.year}
                </span>
              </>
            }
          />
        )}
      </section>

      {!t.starts ? (
        <Note title="No race entries yet" className="mt-14">
          Line-ups and results appear here after the team's first race.
        </Note>
      ) : (
        <>
          <section className="mt-14 sm:mt-20" aria-label="Team record">
            <RecordStrip
              items={[
                { label: "Car entries", value: t.starts, sub: plural(t.events, "event") },
                { label: cw ? "Class wins" : "Wins", value: t.wins, sub: `${Math.round((t.wins / t.starts) * 100)}% of entries` },
                { label: "Podiums", value: t.podiums, sub: `${Math.round((t.podiums / t.starts) * 100)}% of entries` },
                { label: "Best finish", value: t.best != null ? `P${t.best}` : null, sub: t.best != null ? `${t.bestCount > 1 ? `×${t.bestCount} · ` : ""}${t.bestClass || ""}` : "No classified finish" },
                { label: cw ? "Class poles" : "Poles", value: t.poles, sub: "In qualifying" },
                { label: "Drivers", value: drivers.size, sub: "Raced for the team" },
                { label: "Finished", value: `${Math.round((t.finishes / t.starts) * 100)}%`, sub: `${t.dnfs} DNF` },
              ]}
            />
            {cars.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                <span className="eyebrow mr-1">Ran the</span>
                {cars.map((x) => (
                  <Link key={x.key} to={`/car/${x.key}`} className="rounded-full border bg-sheet px-3 py-1 text-ink-2 transition-colors hover:border-ink/30 hover:text-ink">
                    {carLabel(book.cars[x.key])} <span className="num text-xs text-ink-3">{x.n}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* line-ups */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow="Cars and crews, season by season" title={<>The <em>line-ups</em></>} />
            <div className="space-y-12">
              {seasons.map((s) => (
                <div key={s.seasonId}>
                  <SeasonHead year={s.year} series={s.seriesName} right={seasonLine(s.rows)} />
                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {lineups(s.rows).map((l) => (
                      <LineupCard key={l.number} book={book} rows={l.rows} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* results */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow="Every race, every car" title="Results" />
            <div className="space-y-12">
              {seasons.map((s) => (
                <div key={s.seasonId}>
                  <SeasonHead year={s.year} series={s.seriesName} />
                  <RaceGroups
                    races={byRace(s.rows)}
                    line={(e) => (
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ClassTag name={e.className} color={e.classColor} />
                          <span className="num text-xs text-ink-3">#{e.carNumber}</span>
                        </div>
                        <div className="mt-1 truncate text-ink-2">
                          {e.driverIds.map((d, i) => (
                            <span key={d}>
                              {i > 0 && " / "}
                              <Link to={`/driver/${d}`} className="hover:text-ink hover:underline hover:underline-offset-2">
                                {lastName(book.drivers[d]?.full_name)}
                              </Link>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function seasonLine(rows: Entry[]) {
  const t = tally(rows);
  return `${plural(t.starts, "entry", "entries")}${t.wins ? ` · ${plural(t.wins, "win")}` : ""}${t.podiums ? ` · ${plural(t.podiums, "podium")}` : ""}`;
}

function lineups(rows: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of rows) {
    if (!m.has(e.carNumber)) m.set(e.carNumber, []);
    m.get(e.carNumber)!.push(e);
  }
  return [...m.entries()]
    .map(([number, rows]) => ({ number, rows }))
    .sort((a, b) => classRank(a.rows[0].className) - classRank(b.rows[0].className) || b.rows.length - a.rows.length || a.number.localeCompare(b.number, undefined, { numeric: true }));
}

function LineupCard({ book, rows }: { book: RecordBook; rows: Entry[] }) {
  const last = rows[rows.length - 1];
  const drivers = new Map<string, number>();
  for (const e of rows) for (const d of e.driverIds) drivers.set(d, (drivers.get(d) || 0) + 1);
  const ordered = [...drivers.entries()].sort((a, b) => b[1] - a[1] || personKey(book, a[0]).localeCompare(personKey(book, b[0])));
  const car = last.carId ? carLabel(book.cars[last.carId]) : "";
  const wins = rows.filter(isWin).length;
  const pods = rows.filter(isPodium).length;
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border bg-sheet">
      <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${last.classColor}26, transparent 70%)` }}>
        <span className="absolute -bottom-5 -right-1 font-accent text-[6.5rem] leading-none text-ink/[0.06]">{last.carNumber}</span>
        {last.livery && <img src={last.livery} alt={`#${last.carNumber} ${car}`} loading="lazy" className="absolute inset-x-4 bottom-2 m-auto h-24 w-[86%] object-contain" />}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <span className="num text-sm font-medium">#{last.carNumber}</span>
          <ClassTag name={last.className} color={last.classColor} />
          {last.carId && (
            <Link to={`/car/${last.carId}`} className="truncate text-sm text-ink-2 hover:text-ink hover:underline hover:underline-offset-2">
              {car}
            </Link>
          )}
        </div>
        <ul className="mt-4 space-y-1">
          {ordered.map(([d, n]) => (
            <li key={d} className="flex items-baseline justify-between gap-3">
              <Link to={`/driver/${d}`} className="display truncate text-[1.3rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4">
                {cleanName(book.drivers[d]?.full_name)}
              </Link>
              <span className="num shrink-0 text-xs text-ink-3">{plural(n, "race")}</span>
            </li>
          ))}
        </ul>
        <div className="h-5 shrink-0" />
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-4">
          {rows.map((e) => (
            <Link key={e.key} to={`/events/${e.eventId}`} title={`${raceTitle(e)}: ${e.status === "finished" ? `P${e.pic}` : e.status.toUpperCase()}`} className="rounded-full">
              <ResultMark e={e} />
            </Link>
          ))}
          <span className="ml-auto text-xs text-ink-3">{wins ? plural(wins, "win") : pods ? plural(pods, "podium") : plural(rows.length, "start")}</span>
        </div>
      </div>
    </div>
  );
}

const personKey = (book: RecordBook, id: string) => lastName(book.drivers[id]?.full_name).toLowerCase();
