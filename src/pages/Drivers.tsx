import { useDeferredValue, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { classRank } from "@/lib/insights";
import { cleanName } from "@/site/data";
import { ClassTag, Eyebrow, Note, Page, Skeleton, Tabs } from "@/site/ui";
import { origin, personSortKey, plural, useRecordIndex, type RecordIndex, type SeriesTally } from "@/site/records";
import { Chip, SearchField } from "@/site/record-ui";

type Sort = "az" | "starts" | "wins";

interface Row {
  id: string;
  name: string;
  nationality: string | null;
  code: string | null;
  country: string | null;
  key: string;
  letter: string;
  starts: number;
  wins: number;
  podiums: number;
  classed: boolean;
  classes: string[];
  classColors: Record<string, string>;
  series: string[];
  bySeries: Record<string, SeriesTally>;
  team: string | null;
  last: string;
}

function buildRows(ix: RecordIndex): Row[] {
  return ix.drivers.map((d) => {
    const o = origin(d.nationality);
    const name = cleanName(d.name);
    const key = personSortKey(d.name);
    return {
      id: d.id,
      name,
      nationality: d.nationality,
      code: o.code,
      country: o.country,
      key,
      letter: /[a-z]/.test(key[0] || "") ? key[0].toUpperCase() : "#",
      starts: d.starts,
      wins: d.wins,
      podiums: d.podiums,
      classed: d.classed,
      classes: d.classes,
      classColors: d.classColors,
      series: d.series,
      bySeries: d.bySeries,
      team: d.last?.team ?? null,
      last: d.last?.date || "",
    };
  });
}

/** A row's numbers within one series (or overall). */
const inSeries = (r: Row, series: string) => {
  if (!series) return r;
  const [starts, wins, podiums] = r.bySeries[series] || [0, 0, 0];
  return { ...r, starts, wins, podiums };
};

export default function Drivers() {
  const book = useRecordIndex();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const series = params.get("series") || "";
  const cls = params.get("class") || "";
  const nat = params.get("nat") || "";
  const sort = (params.get("sort") as Sort) || "az";
  const dq = useDeferredValue(q);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => (book ? buildRows(book) : []), [book]);
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of book?.classes || []) if (!series || c.seriesId === series) m.set(c.name, c.color);
    return [...m.entries()].sort((a, b) => classRank(a[0]) - classRank(b[0]));
  }, [book, series]);
  const nations = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    for (const r of rows) if (r.code) m.set(r.code, { code: r.code, name: r.country || r.code, n: (m.get(r.code)?.n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const n = dq.trim().toLocaleLowerCase();
    const out = rows
      .filter(
        (r) =>
          (!n || r.name.toLocaleLowerCase().includes(n) || (r.team || "").toLocaleLowerCase().includes(n)) &&
          (!series || r.series.includes(series)) &&
          (!cls || r.classes.includes(cls)) &&
          (!nat || r.code === nat),
      )
      .map((r) => inSeries(r, series));
    if (sort === "starts") return out.sort((a, b) => b.starts - a.starts || b.wins - a.wins || a.key.localeCompare(b.key));
    if (sort === "wins") return out.sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.starts - a.starts || a.key.localeCompare(b.key));
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, dq, series, cls, nat, sort]);

  const groups = useMemo(() => {
    if (sort !== "az") return [{ letter: "", rows: filtered }];
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      if (!m.has(r.letter)) m.set(r.letter, []);
      m.get(r.letter)!.push(r);
    }
    return [...m.entries()].map(([letter, rows]) => ({ letter, rows }));
  }, [filtered, sort]);

  // Most wins: within the chosen series, else across everything.
  const leaders = useMemo(
    () =>
      rows
        .filter((r) => !series || r.series.includes(series))
        .map((r) => inSeries(r, series))
        .filter((r) => r.wins > 0)
        .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums)
        .slice(0, 4),
    [rows, series],
  );
  const allClassed = leaders.length > 0 && leaders.every((r) => r.classed);
  const seriesName = book?.series.find((s) => s.id === series)?.short;
  const filtering = !!(q || cls || nat);
  const raced = rows.filter((r) => r.starts > 0).length;

  return (
    <div className="min-h-screen">
      <SEOHead title="Drivers – Track Records" description="Every driver on the record, across every series: search by name, nationality, series and class, with starts, wins and podiums." canonical="/drivers" />
      <Header />
      <Page className="pt-6 sm:pt-10">
        <Eyebrow>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Drivers</span>
          <span>{book ? `${rows.length} on the record` : "Loading"}</span>
        </Eyebrow>
        <h1 className="display mt-5 max-w-4xl text-[3.4rem] leading-[0.9] sm:text-[5rem] lg:text-[6.2rem]">
          Every driver, <em>on the record.</em>
        </h1>
        <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          {book ? (
            <>
              {plural(raced, "driver")} from {plural(nations.length, "country", "countries")} have taken a start in {listSeries(book.series.map((s) => s.short))}. Find
              anyone, then open their record.
            </>
          ) : (
            <Skeleton className="h-6 w-80" />
          )}
        </div>

        {/* ── Leaders ─────────────────────────────────────────── */}
        {book && !filtering && leaders.length > 0 && (
          <section className="mt-12" aria-label="Most wins">
            <Eyebrow className="mb-3">
              Most {allClassed ? "class " : ""}wins{seriesName ? ` in ${seriesName}` : ""}
            </Eyebrow>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-rule lg:grid-cols-4">
              {leaders.map((r) => {
                const rank = leaders.findIndex((x) => x.wins === r.wins) + 1;
                return (
                  <Link key={r.id} to={`/driver/${r.id}`} className="group flex flex-col bg-sheet p-5 transition-colors hover:bg-paper sm:p-6">
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-accent text-[3rem] leading-[0.8] sm:text-[3.6rem]", rank === 1 && "mark")}>{r.wins}</span>
                      <span className="eyebrow">wins</span>
                    </div>
                    <div className="display mt-4 truncate text-[1.45rem] leading-[1.05] decoration-1 underline-offset-4 group-hover:underline sm:text-[1.7rem]">{r.name}</div>
                    <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-ink-3">
                      {r.nationality && <FlagImage nationality={r.nationality} size={14} className="shrink-0 rounded-[2px]" />}
                      {r.classes.slice(0, 1).map((c) => (
                        <ClassTag key={c} name={c} color={r.classColors[c]} />
                      ))}
                      <span className="truncate">{plural(r.starts, "start")}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Controls ────────────────────────────────────────── */}
        <section className="mt-12 sm:mt-16">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchField value={q} onChange={(v) => set("q", v)} placeholder="Search drivers or teams" className="lg:max-w-md lg:flex-1" />
            <label className="relative flex h-12 items-center rounded-full border bg-sheet pl-4 pr-2 focus-within:border-ink/40">
              <span className="sr-only">Nationality</span>
              {nat && <FlagImage nationality={nat} size={16} className="mr-2 rounded-[2px]" />}
              <select value={nat} onChange={(e) => set("nat", e.target.value)} className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-[15px] outline-none">
                <option value="">All nationalities</option>
                {nations.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.name} ({n.n})
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-4 text-xs text-ink-3">
                ▾
              </span>
            </label>
            <Tabs<Sort>
              value={sort}
              onChange={(v) => set("sort", v === "az" ? "" : v)}
              items={[
                { value: "az", label: "A–Z" },
                { value: "starts", label: "Most starts" },
                { value: "wins", label: "Most wins" },
              ]}
              className="self-start lg:ml-auto lg:self-auto"
            />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <Chip active={!series} onClick={() => setParams(withOut(params, ["series", "class"]), { replace: true })}>
              All series
            </Chip>
            {book?.series.map((s) => (
              <Chip key={s.id} active={series === s.id} onClick={() => setParams(withOut(params, ["class"], { series: series === s.id ? "" : s.id }), { replace: true })}>
                {s.short}
              </Chip>
            ))}
            <span className="mx-1 w-px shrink-0 self-stretch bg-rule" aria-hidden />
            {classes.map(([c, col]) => (
              <Chip key={c} active={cls === c} onClick={() => set("class", cls === c ? "" : c)} dot={col}>
                {c}
              </Chip>
            ))}
          </div>
        </section>

        {/* ── Directory ───────────────────────────────────────── */}
        <section className="mt-10">
          {!book ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Note title="No drivers match">
              Nothing for that combination{q ? ` and “${q}”` : ""}. Try a different spelling, or{" "}
              <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                clear the filters
              </button>
              .
            </Note>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-ink-3">{filtering ? `${plural(filtered.length, "driver")} match` : `${plural(filtered.length, "driver")}`}</span>
                {sort === "az" && groups.length > 3 && (
                  <nav aria-label="Jump to letter" className="-mx-4 flex max-w-[calc(100%+2rem)] gap-0.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0">
                    {groups.map((g) => (
                      <a key={g.letter} href={`#letter-${g.letter}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs text-ink-2 hover:bg-ink hover:text-paper">
                        {g.letter}
                      </a>
                    ))}
                  </nav>
                )}
              </div>
              <div className="space-y-12">
                {groups.map((g) => (
                  <div key={g.letter || "all"} id={g.letter ? `letter-${g.letter}` : undefined} className="scroll-mt-24">
                    {g.letter && (
                      <div className="mb-2 flex items-baseline gap-4 border-b border-ink/80 pb-2">
                        <span className="display text-[3rem] leading-none">{g.letter}</span>
                        <span className="num text-xs text-ink-3">{g.rows.length}</span>
                      </div>
                    )}
                    <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                      {g.rows.map((r, i) => (
                        <DriverItem key={r.id} r={r} rank={sort !== "az" ? i + 1 : undefined} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </Page>
      <Footer />
    </div>
  );
}

/** "A, B and C"; long lists name the first few. */
function listSeries(names: string[]) {
  if (names.length > 5) return `${names.slice(0, 4).join(", ")} and ${names.length - 4} more series`;
  return names.join(", ").replace(/, ([^,]*)$/, " and $1");
}

function withOut(p: URLSearchParams, drop: string[], add: Record<string, string> = {}) {
  const next = new URLSearchParams(p);
  for (const d of drop) next.delete(d);
  for (const [k, v] of Object.entries(add)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  return next;
}

function DriverItem({ r, rank }: { r: Row; rank?: number }) {
  return (
    <li className="border-b [content-visibility:auto] [contain-intrinsic-size:auto_68px]">
      <Link to={`/driver/${r.id}`} className="group flex items-center gap-3 py-3.5 transition-colors">
        {rank != null && <span className="num w-7 shrink-0 text-xs text-ink-3">{rank}</span>}
        <span className="flex w-5 shrink-0 justify-center">{r.nationality ? <FlagImage nationality={r.nationality} size={18} className="rounded-[2px]" /> : null}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-medium decoration-1 underline-offset-4 group-hover:underline">{r.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-3">
            {r.classes.slice(0, 2).map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.classColors[c] }} />
                {c}
              </span>
            ))}
            {r.team && <span className="truncate">· {r.team}</span>}
            {!r.starts && <span>No race starts yet</span>}
          </span>
        </span>
        {r.wins > 0 && (
          <span className="w-11 shrink-0 text-right">
            <span className="num block text-[15px] leading-none">{r.wins}</span>
            <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">{r.wins === 1 ? "win" : "wins"}</span>
          </span>
        )}
        <span className="w-11 shrink-0 text-right">
          <span className={cn("num block text-[15px] leading-none", !r.starts && "text-ink-3")}>{r.starts}</span>
          <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">{r.starts === 1 ? "start" : "starts"}</span>
        </span>
        <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
      </Link>
    </li>
  );
}
