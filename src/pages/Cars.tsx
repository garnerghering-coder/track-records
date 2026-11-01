import { useDeferredValue, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { classRank } from "@/lib/insights";
import { Eyebrow, Note, Page, Skeleton } from "@/site/ui";
import { plural, useRecordIndex } from "@/site/records";
import { Chip, RecordCard, SearchField } from "@/site/record-ui";

export default function Cars() {
  const book = useRecordIndex();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const series = params.get("series") || "";
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
    return book.cars.map((r) => ({
      ...r,
      label: [r.manufacturer, r.model_name].map((x) => (x || "").trim()).filter(Boolean).join(" "),
      seriesShort: r.series.map((id) => short.get(id) || ""),
    }));
  }, [book]);

  const groups = useMemo(() => {
    const n = dq.trim().toLocaleLowerCase();
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      if (n && !r.label.toLocaleLowerCase().includes(n)) continue;
      if (series && !r.series.includes(series)) continue;
      // Classed cars group by class; cars from single-class series by series.
      const k = r.primary || (r.seriesShort.length === 1 ? r.seriesShort[0] : "Other");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()]
      .map(([cls, list]) => ({
        cls,
        color: list[0].primary ? list[0].hero?.color : undefined,
        list: list.sort((a, b) => {
          const sa = series ? a.bySeries[series] || [0, 0, 0] : [a.starts, a.wins];
          const sb = series ? b.bySeries[series] || [0, 0, 0] : [b.starts, b.wins];
          return sb[1] - sa[1] || sb[0] - sa[0] || a.label.localeCompare(b.label);
        }),
      }))
      .sort((a, b) => classRank(a.cls) - classRank(b.cls) || a.cls.localeCompare(b.cls));
  }, [rows, dq, series]);

  const makers = new Set(rows.map((r) => (r.manufacturer || "").trim()).filter(Boolean)).size;
  const count = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="min-h-screen">
      <SEOHead title="Cars – Track Records" description="Every car on the record, in every series: entries, wins, teams and liveries for each model." canonical="/cars" />
      <Header />
      <Page className="pt-6 sm:pt-10">
        <Eyebrow>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Cars</span>
          <span>{book ? `${rows.length} models` : "Loading"}</span>
        </Eyebrow>
        <h1 className="display mt-5 max-w-4xl text-[3.4rem] leading-[0.9] sm:text-[5rem] lg:text-[6.2rem]">
          The <em>machines.</em>
        </h1>
        <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          {book ? (
            <>
              {plural(rows.length, "model")} from {plural(makers, "manufacturer")}, grouped by the class (or series) they race in. Each record holds every livery, every team and every result.
            </>
          ) : (
            <Skeleton className="h-6 w-80" />
          )}
        </div>

        <section className="mt-12 flex flex-col gap-3 sm:mt-16 lg:flex-row lg:items-center">
          <SearchField value={q} onChange={(v) => set("q", v)} placeholder="Search cars or makes" className="lg:max-w-md lg:flex-1" />
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:ml-auto lg:pb-0">
            <Chip active={!series} onClick={() => set("series", "")}>
              All series
            </Chip>
            {book?.series.map((s) => (
              <Chip key={s.id} active={series === s.id} onClick={() => set("series", series === s.id ? "" : s.id)}>
                {s.short}
              </Chip>
            ))}
          </div>
        </section>

        <section className="mt-12">
          {!book ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-80 rounded-3xl" />
              ))}
            </div>
          ) : count === 0 ? (
            <Note title="No cars match">
              Try a make like “Porsche”, or{" "}
              <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                clear the filters
              </button>
              .
            </Note>
          ) : (
            <div className="space-y-16">
              {groups.map((g) => (
                <div key={g.cls}>
                  <div className="mb-6 flex items-baseline gap-3 border-b border-ink/80 pb-3">
                    <span className="h-3 w-3 shrink-0 self-center rounded-full" style={{ backgroundColor: g.color }} />
                    <h2 className="display text-[2.4rem] leading-none">{g.cls}</h2>
                    <span className="num text-xs text-ink-3">{plural(g.list.length, "model")}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {g.list.map((r) => (
                      <RecordCard
                        key={r.id}
                        to={`/car/${r.id}`}
                        livery={r.hero?.livery ?? undefined}
                        number={r.hero?.carNumber}
                        tint={r.hero?.color}
                        eyebrow={(r.manufacturer || "").trim() || "Car"}
                        title={r.model_name.trim()}
                        tags={
                          <span className="text-xs text-ink-3">
                            {plural(r.teams, "team")} · {r.seriesShort.join(", ")}
                          </span>
                        }
                        stats={[
                          { label: "Starts", value: series ? r.bySeries[series]?.[0] ?? 0 : r.starts },
                          { label: "Wins", value: series ? r.bySeries[series]?.[1] ?? 0 : r.wins },
                          { label: "Podiums", value: series ? r.bySeries[series]?.[2] ?? 0 : r.podiums },
                        ]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Page>
      <Footer />
    </div>
  );
}
