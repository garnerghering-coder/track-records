import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Search as SearchIcon, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { useDigests, useEvents, useLayouts, useNames, layoutFor, cleanName } from "@/site/data";
import { Eyebrow, Initials, Livery, Note, Page, Skeleton, Tabs, TrackMap, dateRange } from "@/site/ui";
import { crewLastNames, fold, headline, layoutsOf, num, overallWinner, plural, stripYear, useAliases, useCircuits, useSeries, winsByDriver } from "@/site/archive";

type Kind = "all" | "drivers" | "teams" | "races" | "circuits" | "cars" | "series";
const REDIRECT: Record<string, string> = { drivers: "/drivers", circuits: "/circuits", teams: "/teams", cars: "/cars", series: "/series", events: "/results", results: "/results" };
const KIND_LABEL: Record<Exclude<Kind, "all">, string> = { drivers: "Drivers", teams: "Teams", races: "Races", circuits: "Circuits", cars: "Cars", series: "Championships" };
const SUGGEST = ["Porsche", "Daytona", "Nasr", "Cadillac", "Sebring", "GTD"];

/** Score a candidate: 0 = no match; higher is better. All query tokens must appear. */
function score(q: string, fields: (string | null | undefined)[], aliasHit = false) {
  if (!q) return 0;
  const toks = q.split(/\s+/).filter(Boolean);
  const hay = fields.map(fold);
  const joined = hay.join(" ");
  if (!aliasHit && !toks.every((t) => joined.includes(t))) return 0;
  let s = aliasHit ? 40 : 10;
  if (hay[0] === q) s += 100;
  else if (hay[0]?.startsWith(q)) s += 60;
  else if (hay[0]?.split(/\s+/).some((w) => w.startsWith(toks[0]))) s += 30;
  return s;
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const f = fold(text);
  const tok = q.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0];
  const i = tok ? f.indexOf(tok) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="underline decoration-hl decoration-[3px] underline-offset-[3px]">{text.slice(i, i + tok.length)}</span>
      {text.slice(i + tok.length)}
    </>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab");
  const qParam = params.get("q") || "";
  const [input, setInput] = useState(qParam);
  const kind = ((params.get("type") as Kind) || "all") as Kind;
  const inputRef = useRef<HTMLInputElement>(null);

  const names = useNames();
  const events = useEvents();
  const digests = useDigests();
  const circuits = useCircuits();
  const layouts = useLayouts();
  const series = useSeries();
  const aliases = useAliases();

  // keep the URL in step with typing (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      if (input === qParam) return;
      const n = new URLSearchParams(params);
      if (input) n.set("q", input);
      else n.delete("q");
      setParams(n, { replace: true });
    }, 180);
    return () => clearTimeout(t);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setInput(qParam), [qParam]);
  useEffect(() => {
    if (!qParam) inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = fold(qParam);
  const ready = !!(names && events && circuits && series && layouts);
  const wins = useMemo(() => winsByDriver(digests), [digests]);

  const results = useMemo(() => {
    if (!ready || !q) return null;
    const aliasIds = new Set((aliases || []).filter((a) => fold(a.alias).includes(q)).map((a) => fold(a.canonical)));
    const rank = <T,>(list: { item: T; s: number }[]) => list.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.item);

    const drivers = rank(
      Object.values(names!.drivers).map((d) => {
        const s = score(q, [cleanName(d.full_name), d.nationality], aliasIds.has(fold(d.id)) || aliasIds.has(fold(d.full_name)));
        return { item: d, s: s ? s + (wins.get(d.id) || 0) : 0 };
      }),
    );
    const teams = rank(Object.values(names!.teams).map((t) => ({ item: t, s: score(q, [t.full_name, t.short_name], aliasIds.has(fold(t.id)) || aliasIds.has(fold(t.full_name))) })));
    const cars = rank(Object.values(names!.cars).map((c) => ({ item: c, s: score(q, [`${c.manufacturer || ""} ${c.model_name}`.trim(), c.model_name], aliasIds.has(fold(c.id))) })));
    const circ = rank(circuits!.map((c) => ({ item: c, s: score(q, [c.name, c.location, c.country], aliasIds.has(fold(c.id)) || aliasIds.has(fold(c.name))) })));
    const races = rank(
      events!.map((e) => ({
        item: e,
        s: score(q, [stripYear(e.name), e.short_name, e.circuit?.name, e.circuit?.location, e.series?.name, e.series?.short_name, String(e.year ?? "")]),
      })),
    );
    const ser = rank(series!.map((s) => ({ item: s, s: score(q, [s.name, s.short_name], aliasIds.has(fold(s.id)) || aliasIds.has(fold(s.name))) })));
    return { drivers, teams, races, circuits: circ, cars, series: ser };
  }, [ready, q, names, events, circuits, series, aliases, wins]);

  if (tab && REDIRECT[tab]) return <Navigate to={REDIRECT[tab] + (qParam && (tab === "circuits" || tab === "drivers") ? `?q=${encodeURIComponent(qParam)}` : "")} replace />;

  const counts = results ? (Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])) as Record<Exclude<Kind, "all">, number>) : null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const show = (k: Exclude<Kind, "all">) => (kind === "all" || kind === k) && (counts?.[k] || 0) > 0;
  const lim = (n: number) => (kind === "all" ? n : 200);
  const setKind = (k: Kind) => {
    const n = new URLSearchParams(params);
    if (k === "all") n.delete("type");
    else n.set("type", k);
    setParams(n, { replace: true });
  };

  return (
    <div className="min-h-screen">
      <SEOHead title={qParam ? `“${qParam}” – Search` : "Search"} description="Search every driver, team, race, circuit, car and championship on the record." canonical="/search" noIndex={!!qParam} />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <Eyebrow>Search the record</Eyebrow>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const n = new URLSearchParams(params);
            if (input) n.set("q", input);
            else n.delete("q");
            setParams(n, { replace: true });
          }}
          className="mt-5"
        >
          <label className="group relative flex items-center rounded-[28px] border bg-sheet pl-5 pr-3 transition-colors focus-within:border-ink/50 sm:pl-8">
            <SearchIcon className="h-6 w-6 shrink-0 text-ink-3 sm:h-8 sm:w-8" />
            <span className="sr-only">Search</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Driver, team, race, circuit…"
              className="display h-20 min-w-0 flex-1 bg-transparent px-4 text-[2.2rem] outline-none placeholder:text-ink-3/70 sm:h-28 sm:px-6 sm:text-[3.6rem]"
              autoComplete="off"
              spellCheck={false}
            />
            {input && (
              <button type="button" onClick={() => setInput("")} aria-label="Clear search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/[0.06]">
                <X className="h-5 w-5" />
              </button>
            )}
          </label>
        </form>

        {!qParam ? (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm text-ink-3">Try</span>
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="h-9 rounded-full border bg-sheet px-4 text-sm transition-colors hover:border-ink/40">
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-lg text-ink-2">
              {!results ? (
                <Skeleton className="h-6 w-56" />
              ) : total ? (
                <>
                  {plural(total, "result")} for <span className="text-ink">&ldquo;{qParam}&rdquo;</span>
                </>
              ) : (
                <>
                  Nothing on the record for <span className="text-ink">&ldquo;{qParam}&rdquo;</span>
                </>
              )}
            </div>
            {counts && total > 0 && (
              <Tabs
                value={kind}
                onChange={setKind}
                items={[
                  { value: "all" as Kind, label: "All" },
                  ...(Object.keys(KIND_LABEL) as Exclude<Kind, "all">[])
                    .filter((k) => counts[k] > 0)
                    .map((k) => ({
                      value: k as Kind,
                      label: (
                        <>
                          {KIND_LABEL[k]} <span className="num ml-1 text-[11px] opacity-60">{counts[k]}</span>
                        </>
                      ),
                    })),
                ]}
              />
            )}
          </div>
        )}
      </Page>

      <Page className="mt-14">
        {!qParam ? (
          <Browse />
        ) : !results ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <Note title="No matches">
            Check the spelling, try a surname on its own, or browse the{" "}
            <Link to="/drivers" className="underline underline-offset-4">
              drivers
            </Link>
            ,{" "}
            <Link to="/results" className="underline underline-offset-4">
              races
            </Link>{" "}
            and{" "}
            <Link to="/circuits" className="underline underline-offset-4">
              circuits
            </Link>
            .
          </Note>
        ) : (
          <div className="space-y-16">
            {show("drivers") && (
              <Group title="Drivers" count={counts!.drivers} more={kind === "all" && counts!.drivers > 9 ? () => setKind("drivers") : undefined}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.drivers.slice(0, lim(9)).map((d) => (
                    <Link key={d.id} to={`/driver/${d.id}`} className="group flex items-center gap-4 rounded-2xl border bg-sheet p-4 transition-colors hover:border-ink/30">
                      <Initials name={d.full_name} className="h-11 w-11 shrink-0 text-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15.5px]">
                          <Hl text={cleanName(d.full_name)} q={q} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                          {d.nationality && <FlagImage nationality={d.nationality} size={13} className="rounded-[2px]" />}
                          <span className="truncate">{d.nationality || "Nationality unknown"}</span>
                        </div>
                      </div>
                      {(wins.get(d.id) || 0) > 0 && (
                        <span className="text-right">
                          <span className="num block text-lg leading-none">{wins.get(d.id)}</span>
                          <span className="eyebrow text-[9.5px]">{wins.get(d.id) === 1 ? "win" : "wins"}</span>
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </Group>
            )}

            {show("races") && (
              <Group title="Races" count={counts!.races} more={kind === "all" && counts!.races > 4 ? () => setKind("races") : undefined}>
                <div className="grid gap-3 md:grid-cols-2">
                  {results.races.slice(0, lim(4)).map((e) => {
                    const w = overallWinner(headline(digests?.[e.id]));
                    return (
                      <Link key={e.id} to={`/events/${e.id}`} className="group flex items-center gap-4 overflow-hidden rounded-2xl border bg-sheet p-4 transition-colors hover:border-ink/30">
                        <div className="relative h-12 w-20 shrink-0 sm:h-14 sm:w-28">
                          <Livery key={w?.livery} src={w?.livery} alt="" className="absolute inset-0 m-auto h-full w-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="eyebrow truncate">
                            {e.series?.short_name} · {dateRange(e.start_date, e.end_date)}
                          </div>
                          <div className="display mt-1 line-clamp-2 text-[1.45rem] leading-[1.05]">
                            <Hl text={stripYear(e.name)} q={q} />
                          </div>
                          <div className="truncate text-xs text-ink-3">{w ? `Won by ${crewLastNames(w.driverIds, names)}` : e.circuit?.name}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Group>
            )}

            {show("teams") && (
              <Group title="Teams" count={counts!.teams} more={kind === "all" && counts!.teams > 6 ? () => setKind("teams") : undefined}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.teams.slice(0, lim(6)).map((t) => (
                    <Row key={t.id} to={`/team/${t.id}`} title={<Hl text={t.full_name} q={q} />} meta={t.short_name && t.short_name !== t.full_name ? t.short_name : "Team"} />
                  ))}
                </div>
              </Group>
            )}

            {show("circuits") && (
              <Group title="Circuits" count={counts!.circuits} more={kind === "all" && counts!.circuits > 4 ? () => setKind("circuits") : undefined}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {results.circuits.slice(0, lim(4)).map((c) => {
                    const l = layoutsOf(c.id, layouts)[0];
                    return (
                      <Link key={c.id} to={`/circuit/${c.id}`} className="group flex flex-col rounded-2xl border bg-sheet p-4 transition-colors hover:border-ink/30">
                        <div className="relative h-24">
                          <TrackMap key={l?.layout_image_url} src={l?.layout_image_url} alt="" className="absolute inset-0 m-auto h-full w-full opacity-80 transition-transform duration-500 group-hover:scale-105" />
                        </div>
                        <div className="display mt-3 text-[1.3rem] leading-tight">
                          <Hl text={c.name} q={q} />
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                          <FlagImage nationality={c.country} size={13} className="rounded-[2px]" />
                          <span className="truncate">{c.location || c.country}</span>
                          {num(l?.length_km) != null && <span className="num ml-auto shrink-0">{num(l?.length_km)!.toFixed(3)} km</span>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Group>
            )}

            {show("cars") && (
              <Group title="Cars" count={counts!.cars} more={kind === "all" && counts!.cars > 6 ? () => setKind("cars") : undefined}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.cars.slice(0, lim(6)).map((c) => (
                    <Row key={c.id} to={`/car/${c.id}`} title={<Hl text={`${c.manufacturer ? `${c.manufacturer} ` : ""}${c.model_name}`} q={q} />} meta="Car" />
                  ))}
                </div>
              </Group>
            )}

            {show("series") && (
              <Group title="Championships" count={counts!.series}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.series.map((s) => (
                    <Row key={s.id} to={`/series/${s.id}`} title={<Hl text={s.name} q={q} />} meta={s.short_name || "Championship"} />
                  ))}
                </div>
              </Group>
            )}
          </div>
        )}
      </Page>

      <Footer />
    </div>
  );
}

function Group({ title, count, more, children }: { title: string; count: number; more?: () => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4 border-b pb-3">
        <h2 className="display text-[2rem] leading-none sm:text-[2.4rem]">
          {title} <span className="num align-top text-sm text-ink-3">{count}</span>
        </h2>
        {more && (
          <button onClick={more} className="group flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <span className="link-u">See all {count}</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ to, title, meta }: { to: string; title: ReactNode; meta: ReactNode }) {
  return (
    <Link to={to} className="group flex items-center justify-between gap-4 rounded-2xl border bg-sheet px-5 py-4 transition-colors hover:border-ink/30">
      <div className="min-w-0">
        <div className="truncate text-[15.5px]">{title}</div>
        <div className="mt-0.5 truncate text-xs text-ink-3">{meta}</div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

function Browse() {
  const items = [
    { to: "/results", label: "Races", blurb: "Every race, replayable" },
    { to: "/series", label: "Championships", blurb: "Points races, season by season" },
    { to: "/drivers", label: "Drivers", blurb: "Career records" },
    { to: "/teams", label: "Teams", blurb: "Entries, wins, line-ups" },
    { to: "/circuits", label: "Circuits", blurb: "Character, winners, lap records" },
    { to: "/cars", label: "Cars", blurb: "Machines and their results" },
  ];
  return (
    <div>
      <Eyebrow className="mb-4">Or browse</Eyebrow>
      <nav className="grid gap-x-10 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className={cn("group flex items-baseline justify-between gap-4 border-b py-5")}>
            <span className="display text-4xl transition-transform duration-300 group-hover:translate-x-1.5 sm:text-5xl">{i.label}</span>
            <span className="text-right text-xs text-ink-3">{i.blurb}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
