import { useDeferredValue, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { classRank } from "@/lib/insights";
import { Eyebrow, Note, Page, Skeleton } from "@/site/ui";
import { carLabel, countBy, isWin, plural, tally, useRecordBook, type Entry } from "@/site/records";
import { Chip, RecordCard, SearchField } from "@/site/record-ui";

export default function Cars() {
  const book = useRecordBook();
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
    return [...book.byCar.entries()]
      .map(([id, list]) => {
        const t = tally(list);
        const primary = countBy(list, (e) => e.className)[0]?.key ?? null;
        const hero: Entry | undefined = [...list].reverse().find((e) => isWin(e) && e.livery) || [...list].reverse().find((e) => e.livery) || list[list.length - 1];
        return { id, car: book.cars[id], label: carLabel(book.cars[id]), list, t, primary, hero, teams: new Set(list.map((e) => e.teamId)).size };
      })
      .filter((r) => r.car && r.t.starts > 0);
  }, [book]);

  const groups = useMemo(() => {
    const n = dq.trim().toLocaleLowerCase();
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      if (n && !r.label.toLocaleLowerCase().includes(n)) continue;
      if (series && !r.list.some((e) => e.seriesId === series)) continue;
      const k = r.primary || "Other";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()]
      .map(([cls, list]) => ({ cls, color: list[0].hero?.classColor, list: list.sort((a, b) => b.t.wins - a.t.wins || b.t.starts - a.t.starts || a.label.localeCompare(b.label)) }))
      .sort((a, b) => classRank(a.cls) - classRank(b.cls));
  }, [rows, dq, series]);

  const makers = new Set(rows.map((r) => (r.car.manufacturer || "").trim()).filter(Boolean)).size;
  const count = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="min-h-screen">
      <SEOHead title="Cars – Track Records" description="Every car on the record: entries, class wins, teams and liveries for each model." canonical="/cars" />
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
              {plural(rows.length, "model")} from {plural(makers, "manufacturer")}, grouped by the class they race in. Each record holds every livery, every team and every result.
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
                        livery={r.hero?.livery}
                        number={r.hero?.carNumber}
                        tint={r.hero?.classColor}
                        eyebrow={(r.car.manufacturer || "").trim() || "Car"}
                        title={r.car.model_name.trim()}
                        tags={<span className="text-xs text-ink-3">{plural(r.teams, "team")} · {r.t.series.join(", ")}</span>}
                        stats={[
                          { label: "Starts", value: r.t.starts },
                          { label: "Wins", value: r.t.wins },
                          { label: "Podiums", value: r.t.podiums },
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
