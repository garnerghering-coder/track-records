import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { lastName } from "@/site/data";
import { ClassTag, Eyebrow, Livery, Note, Page, SectionHead } from "@/site/ui";
import { byRace, bySeason, carLabel, countBy, isWin, plural, raceTitle, tally, useRecordBook, type Entry, type RecordBook } from "@/site/records";
import { GhostLink, LiveryStage, NotOnRecord, RaceGroups, RecordSkeleton, RecordStrip, SeasonHead, ShareButton } from "@/site/record-ui";

export default function CarProfile() {
  const { id = "" } = useParams<{ id: string }>();
  const book = useRecordBook();
  const car = book?.cars[id];
  const label = carLabel(car);
  return (
    <div className="min-h-screen">
      <SEOHead
        title={car ? `${label} – Car record` : "Car record"}
        description={car ? `The ${label} on the record: entries, class wins, the teams that ran it and every livery.` : undefined}
        canonical={`/car/${id}`}
      />
      <Header />
      <Page className="pt-6 sm:pt-10">
        {!book ? <RecordSkeleton /> : !car ? <NotOnRecord what="car" back="/cars" backLabel="All cars" /> : <CarRecord key={id} book={book} id={id} />}
      </Page>
      <Footer />
    </div>
  );
}

function CarRecord({ book, id }: { book: RecordBook; id: string }) {
  const car = book.cars[id];
  const label = carLabel(car);
  const entries = useMemo(() => book.byCar.get(id) || [], [book, id]);
  const t = useMemo(() => tally(entries), [entries]);
  const teams = countBy(entries, (e) => e.teamId);
  const drivers = new Set(entries.flatMap((e) => e.driverIds));
  const seasons = bySeason(entries);
  // Hero: the most recent winning livery, else the latest entry.
  const hero = [...entries].reverse().find((e) => isWin(e) && e.livery) || [...entries].reverse().find((e) => e.livery) || t.last;
  const liveries = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = `${e.seasonId}|${e.carNumber}|${e.teamId}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.values()].sort((a, b) => b[0].year - a[0].year || b.filter(isWin).length - a.filter(isWin).length || b.length - a.length);
  }, [entries]);

  const [allLiveries, setAllLiveries] = useState(false);
  const manufacturer = (car.manufacturer || "").trim();
  const model = car.model_name.trim();

  const lead = !t.starts ? (
    <>The {label} is on the record, but hasn't started a race yet.</>
  ) : (
    <>
      The {label} has started {plural(t.starts, "time")} for {plural(teams.length, "team")}
      {t.classes.length ? ` in ${t.classes.join(" and ")}` : ""}
      {t.wins > 0 ? (
        <>
          , with <span className="mark">{plural(t.wins, "class win")}</span>
          {t.podiums > t.wins ? ` and ${plural(t.podiums, "podium")}` : ""}
        </>
      ) : t.podiums > 0 ? (
        <>
          , with <span className="mark">{plural(t.podiums, "class podium")}</span>
        </>
      ) : null}
      . {plural(drivers.size, "driver")} have raced it.
    </>
  );

  return (
    <>
      <section className={hero ? "grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-6" : "max-w-4xl"}>
        <div className="relative z-10 min-w-0">
          <Eyebrow>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Car record</span>
            {t.series.length > 0 && <span>{t.series.join(" · ")}</span>}
            {t.years.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{t.years.length > 1 ? `${t.years[0]}–${t.years[t.years.length - 1]}` : t.years[0]}</span>
              </>
            )}
          </Eyebrow>
          <h1 className="display mt-5 break-words text-[3.6rem] leading-[0.88] sm:text-[5.4rem] lg:text-[6.6rem]">
            {manufacturer && <span className="block">{manufacturer}</span>}
            <em className="block">{model}</em>
          </h1>
          {t.classes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {t.classes.map((c) => (
                <ClassTag key={c} name={c} color={t.classColors[c]} />
              ))}
            </div>
          )}
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">{lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShareButton title={`${label} – Track Records`} />
            <GhostLink to="/cars">All cars</GhostLink>
          </div>
        </div>
        {hero && (
          <LiveryStage
            src={hero.livery}
            number={hero.carNumber}
            color={hero.classColor}
            alt={`#${hero.carNumber} ${label}`}
            className="-mx-2 sm:mx-0"
            caption={
              <>
                <span className="num">#{hero.carNumber}</span>
                {hero.teamId && (
                  <>
                    <span>·</span>
                    <Link to={`/team/${hero.teamId}`} className="link-u text-ink-2">
                      {book.teams[hero.teamId]?.full_name}
                    </Link>
                  </>
                )}
                <span>
                  · {isWin(hero) ? "Won" : "Raced"} {raceTitle(hero)} {hero.year}
                </span>
              </>
            }
          />
        )}
      </section>

      {!t.starts ? (
        <Note title="No race entries yet" className="mt-14">
          Results, teams and liveries appear here after the {label}'s first race.
        </Note>
      ) : (
        <>
          <section className="mt-14 sm:mt-20" aria-label="Car record">
            <RecordStrip
              items={[
                { label: "Starts", value: t.starts, sub: plural(t.events, "event") },
                { label: "Class wins", value: t.wins, sub: `${Math.round((t.wins / t.starts) * 100)}% of starts` },
                { label: "Podiums", value: t.podiums, sub: `${Math.round((t.podiums / t.starts) * 100)}% of starts` },
                { label: "Best finish", value: t.best != null ? `P${t.best}` : null, sub: t.best != null ? `${t.bestCount > 1 ? `×${t.bestCount} · ` : ""}${t.bestClass || ""}` : "No classified finish" },
                { label: "Class poles", value: t.poles, sub: "In qualifying" },
                { label: "Teams", value: teams.length },
                { label: "Drivers", value: drivers.size },
              ]}
            />
          </section>

          {/* liveries */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow={plural(liveries.length, "car", "cars")} title={<>Every <em>livery</em></>} />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {(allLiveries ? liveries : liveries.slice(0, 9)).map((rows) => {
                const e = rows[rows.length - 1];
                const wins = rows.filter(isWin).length;
                return (
                  <div key={e.seasonId + e.carNumber + e.teamId} className="group flex flex-col overflow-hidden rounded-3xl border bg-sheet">
                    <div className="relative h-24 overflow-hidden sm:h-36" style={{ background: `linear-gradient(135deg, ${e.classColor}26, transparent 70%)` }}>
                      <span className="absolute -bottom-4 -right-2 font-accent text-[4.5rem] leading-none text-ink/[0.06] sm:-bottom-6 sm:text-[7rem]">{e.carNumber}</span>
                      <Livery src={e.livery} alt={`#${e.carNumber}`} className="absolute inset-x-2 bottom-1 m-auto h-20 w-[90%] transition-transform duration-500 group-hover:-translate-x-2 sm:inset-x-4 sm:bottom-2 sm:h-28 sm:w-[88%]" />
                      {!e.livery && <span className="eyebrow absolute bottom-4 left-5">No livery on file</span>}
                    </div>
                    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:p-5">
                      <div className="min-w-0">
                        <Eyebrow>
                          #{e.carNumber} · {e.year}
                          <span className="hidden sm:inline">· {e.seriesShort}</span>
                        </Eyebrow>
                        {e.teamId ? (
                          <Link to={`/team/${e.teamId}`} className="display mt-1.5 block truncate text-[1.15rem] leading-tight hover:underline sm:text-[1.4rem] hover:decoration-1 hover:underline-offset-4">
                            {book.teams[e.teamId]?.full_name}
                          </Link>
                        ) : (
                          <span className="display mt-1.5 block text-[1.4rem] text-ink-3">Team not recorded</span>
                        )}
                      </div>
                      <div className="shrink-0 text-xs text-ink-3 sm:text-right">
                        <span className="num text-ink sm:block sm:text-lg sm:leading-none">{rows.length}</span> {rows.length === 1 ? "start" : "starts"}
                        {wins ? ` · ${plural(wins, "win")}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {liveries.length > 9 && (
              <button type="button" onClick={() => setAllLiveries((v) => !v)} className="mt-6 inline-flex h-11 items-center rounded-full border px-5 text-sm hover:bg-ink/[0.05]" aria-expanded={allLiveries}>
                {allLiveries ? "Show fewer" : `Show all ${liveries.length} liveries`}
              </button>
            )}
          </section>

          {/* teams */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow={plural(teams.length, "team")} title={<>Who <em>ran it</em></>} />
            <ul className="overflow-hidden rounded-3xl border bg-sheet">
              {teams.map((x) => (
                <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:px-6">
                  <Link to={`/team/${x.key}`} className="display truncate text-[1.35rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4">
                    {book.teams[x.key]?.full_name}
                  </Link>
                  <div className="hidden h-1.5 overflow-hidden rounded-full bg-ink/[0.06] sm:block" aria-hidden>
                    <div className="h-full rounded-full bg-ink" style={{ width: `${(x.n / teams[0].n) * 100}%` }} />
                  </div>
                  <div className="num text-right text-sm">
                    {plural(x.n, "start")}
                    <span className="text-ink-3">{x.wins ? ` · ${plural(x.wins, "win")}` : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* results */}
          <section className="mt-24 sm:mt-32">
            <SectionHead eyebrow="Best-placed cars in every race" title="Results" />
            <div className="space-y-12">
              {seasons.map((s) => {
                const races = byRace(s.rows);
                return (
                  <div key={s.seasonId}>
                    <SeasonHead year={s.year} series={s.seriesName} />
                    <RaceGroups
                      races={races.map((rows) => [...rows].sort((a, b) => rank(a) - rank(b)).slice(0, 3))}
                      head={(rows) => {
                        const n = races.find((r) => r[0].sessionId === rows[0].sessionId)?.length || rows.length;
                        return n > rows.length ? `${n} entered · top ${rows.length} shown` : n > 1 ? `${n} entered` : null;
                      }}
                      line={(e) => (
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <ClassTag name={e.className} color={e.classColor} />
                            <span className="num text-xs text-ink-3">#{e.carNumber}</span>
                            {e.teamId && <span className="truncate text-xs text-ink-3">{book.teams[e.teamId]?.full_name}</span>}
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
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}

const rank = (e: Entry) => (e.status === "finished" ? (e.pic ?? 99) : 200) + (e.status === "dns" ? 100 : 0);
