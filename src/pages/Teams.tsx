import { useDeferredValue, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { classRank } from "@/lib/insights";
import { ClassTag, Eyebrow, Note, Page, Skeleton, Tabs } from "@/site/ui";
import { plural, useRecordIndex, type TeamIndexRow } from "@/site/records";
import { Chip, RecordCard, SearchField } from "@/site/record-ui";

type Sort = "wins" | "entries" | "az";

export default function Teams() {
  const book = useRecordIndex();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const series = params.get("series") || "";
  const cls = params.get("class") || "";
  const sort = (params.get("sort") as Sort) || "wins";
  const dq = useDeferredValue(q);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    if (!book) return [];
    const short = new Map(book.series.map((s) => [s.id, s.short]));
    return book.teams.map((r: TeamIndexRow) => ({ ...r, seriesShort: r.series.map((id) => short.get(id) || "") }));
  }, [book]);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of book?.classes || []) if (!series || c.seriesId === series) m.set(c.name, c.color);
    return [...m.entries()].sort((a, b) => classRank(a[0]) - classRank(b[0]));
  }, [book, series]);

  const shown = useMemo(() => {
    const n = dq.trim().toLocaleLowerCase();
    const out = rows
      .filter((r) => (!n || r.name.toLocaleLowerCase().includes(n)) && (!series || r.series.includes(series)) && (!cls || r.classes.includes(cls)))
      .map((r) => {
        if (!series) return r;
        const [starts, wins, podiums] = r.bySeries[series] || [0, 0, 0];
        return { ...r, starts, wins, podiums };
      });
    if (sort === "az") return out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "entries") return out.sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name));
    return out.sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.starts - a.starts || a.name.localeCompare(b.name));
  }, [rows, dq, series, cls, sort]);

  const winners = rows.filter((r) => r.wins > 0).length;
  const anyClassed = rows.some((r) => r.classed);

  return (
    <div className="min-h-screen">
      <SEOHead title="Teams – Track Records" description="Every team on the record, in every series, with car entries, wins, podiums and the cars they ran." canonical="/teams" />
      <Header />
      <Page className="pt-6 sm:pt-10">
        <Eyebrow>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Teams</span>
          <span>{book ? `${rows.length} with race entries` : "Loading"}</span>
        </Eyebrow>
        <h1 className="display mt-5 max-w-4xl text-[3.4rem] leading-[0.9] sm:text-[5rem] lg:text-[6.2rem]">
          The teams <em>behind the cars.</em>
        </h1>
        <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          {book ? (
            <>
              {plural(rows.length, "team")} have entered a car; {winners} of them have won {anyClassed ? "a race or their class" : "a race"}. Open one for line-ups by season and every result.
            </>
          ) : (
            <Skeleton className="h-6 w-80" />
          )}
        </div>

        <section className="mt-12 sm:mt-16">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchField value={q} onChange={(v) => set("q", v)} placeholder="Search teams" className="lg:max-w-md lg:flex-1" />
            <Tabs<Sort>
              value={sort}
              onChange={(v) => set("sort", v === "wins" ? "" : v)}
              items={[
                { value: "wins", label: "Most wins" },
                { value: "entries", label: "Most entries" },
                { value: "az", label: "A–Z" },
              ]}
              className="self-start lg:ml-auto lg:self-auto"
            />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <Chip active={!series} onClick={() => setParams(drop(params, ["series", "class"]), { replace: true })}>
              All series
            </Chip>
            {book?.series.map((s) => (
              <Chip key={s.id} active={series === s.id} onClick={() => setParams(drop(params, ["class"], { series: series === s.id ? "" : s.id }), { replace: true })}>
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

        <section className="mt-10">
          {!book ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-80 rounded-3xl" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <Note title="No teams match">
              Try another spelling, or{" "}
              <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                clear the filters
              </button>
              .
            </Note>
          ) : (
            <>
              <p className="mb-6 text-sm text-ink-3">{plural(shown.length, "team")}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((r) => (
                  <RecordCard
                    key={r.id}
                    to={`/team/${r.id}`}
                    livery={r.last?.livery ?? undefined}
                    number={r.last?.carNumber}
                    tint={r.last?.color}
                    eyebrow={`${r.seriesShort.join(" · ")}${r.years ? ` · ${r.years[0] !== r.years[1] ? `${r.years[0]}–${r.years[1]}` : r.years[0]}` : ""}`}
                    title={r.name}
                    tags={r.classes.map((c) => (
                      <ClassTag key={c} name={c} color={r.classColors[c]} />
                    ))}
                    stats={[
                      { label: "Entries", value: r.starts },
                      { label: "Wins", value: r.wins },
                      { label: "Podiums", value: r.podiums },
                    ]}
                  />
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

function drop(p: URLSearchParams, keys: string[], add: Record<string, string> = {}) {
  const next = new URLSearchParams(p);
  for (const k of keys) next.delete(k);
  for (const [k, v] of Object.entries(add)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  return next;
}
