import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { useEvents, useLayouts } from "@/site/data";
import { Eyebrow, Note, Page, SectionHead, Skeleton, Tabs, TrackMap } from "@/site/ui";
import { fingerprint, fold, layoutsOf, num, plural, useCircuits, type CircuitRow, type LayoutRow } from "@/site/archive";

type Sort = "raced" | "name" | "length";

interface Item {
  c: CircuitRow;
  layout?: LayoutRow;
  layouts: number;
  races: number;
  last: number | null;
  character: string | null;
}

export default function Circuits() {
  const circuits = useCircuits();
  const layouts = useLayouts();
  const events = useEvents();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const sort = (["raced", "name", "length"].includes(params.get("sort") || "") ? params.get("sort") : "raced") as Sort;

  const items = useMemo<Item[] | null>(() => {
    if (!circuits || !layouts || !events) return null;
    return circuits.map((c) => {
      const ls = layoutsOf(c.id, layouts);
      const evs = events.filter((e) => e.circuit_id === c.id);
      return {
        c,
        layout: ls[0],
        layouts: ls.length,
        races: evs.length,
        last: evs.reduce<number | null>((m, e) => (e.year != null && (m == null || e.year > m) ? e.year : m), null),
        character: fingerprint(ls[0])?.tcsCategory ?? null,
      };
    });
  }, [circuits, layouts, events]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const f = fold(q);
    const list = f ? items.filter((i) => [i.c.name, i.c.location, i.c.country, i.character].some((s) => fold(s).includes(f))) : items;
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.c.name.localeCompare(b.c.name)
        : sort === "length"
          ? (num(b.layout?.length_km) ?? 0) - (num(a.layout?.length_km) ?? 0)
          : b.races - a.races || (b.last ?? 0) - (a.last ?? 0) || a.c.name.localeCompare(b.c.name),
    );
  }, [items, q, sort]);

  const raced = filtered?.filter((i) => i.races > 0) || [];
  const atlas = filtered?.filter((i) => i.races === 0) || [];
  const countries = items ? new Set(items.map((i) => i.c.country).filter(Boolean)).size : null;

  const setSort = (s: Sort) => {
    const n = new URLSearchParams(params);
    if (s === "raced") n.delete("sort");
    else n.set("sort", s);
    setParams(n, { replace: true });
  };

  return (
    <div className="min-h-screen">
      <SEOHead title="Circuits" description="Every circuit on the record: track maps, character, winners and lap records." canonical="/circuits" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <div>
            <Eyebrow>Circuits</Eyebrow>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
              The circuits of <em>the record.</em>
            </h1>
          </div>
          <div className="max-w-md text-lg leading-relaxed text-ink-2 lg:justify-self-end">
            {items ? (
              <>
                {plural(items.length, "circuit")} in {plural(countries || 0, "country", "countries")}; {plural(items.filter((i) => i.races > 0).length, "has", "have")} hosted a race on the record. Each one with its
                character, winners and lap records.
              </>
            ) : (
              <Skeleton className="h-14 w-full" />
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex h-11 w-full items-center rounded-full border bg-sheet pl-11 pr-3 focus-within:border-ink/40 sm:max-w-sm">
            <Search className="absolute left-4 h-4 w-4 text-ink-3" />
            <span className="sr-only">Filter circuits</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, country or character"
              className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear filter" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-ink/[0.06]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <Tabs
            value={sort}
            onChange={setSort}
            items={[
              { value: "raced", label: "Most raced" },
              { value: "name", label: "A–Z" },
              { value: "length", label: "Longest" },
            ]}
          />
        </div>
      </Page>

      <Page className="mt-12">
        {!filtered ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[380px] rounded-3xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Note title="No circuit matches that">Try a circuit name, a country, or a character such as “technical” or “power”.</Note>
        ) : (
          <>
            {raced.length > 0 && (
              <section>
                <SectionHead eyebrow={plural(raced.length, "circuit")} title="On the record" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {raced.map((i) => (
                    <CircuitCard key={i.c.id} item={i} large />
                  ))}
                </div>
              </section>
            )}
            {atlas.length > 0 && (
              <section className={cn(raced.length > 0 && "mt-24")}>
                <SectionHead eyebrow={`${plural(atlas.length, "circuit")} · no races on the record yet`} title="The atlas" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {atlas.map((i) => (
                    <CircuitCard key={i.c.id} item={i} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Page>

      <Footer />
    </div>
  );
}

function CircuitCard({ item, large }: { item: Item; large?: boolean }) {
  const { c, layout } = item;
  const len = num(layout?.length_km);
  return (
    <Link
      to={`/circuit/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border bg-sheet transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className={cn("relative", large ? "aspect-[16/10]" : "aspect-[4/3]")}>
        <TrackMap
          key={layout?.layout_image_url}
          src={layout?.layout_image_url}
          alt={`${c.name} layout`}
          className={cn("absolute inset-0 m-auto transition-transform duration-500 group-hover:scale-[1.04]", large ? "h-[74%] w-[80%] opacity-90" : "h-[70%] w-[78%] opacity-75")}
        />
        {large && item.races > 0 && (
          <span className="absolute left-4 top-4 rounded-full border bg-paper/80 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2 backdrop-blur">
            {plural(item.races, "race")}
            {item.last ? ` · ${item.last}` : ""}
          </span>
        )}
      </div>
      <div className={cn("flex flex-1 flex-col border-t", large ? "p-5" : "p-4")}>
        <div className="eyebrow flex items-center gap-1.5 truncate">
          <FlagImage nationality={c.country} size={13} className="shrink-0 rounded-[2px]" />
          <span className="truncate">{c.location || c.country}</span>
        </div>
        <h3 className={cn("display mt-2 leading-[1.02]", large ? "text-[1.75rem]" : "text-[1.3rem]")}>{c.name}</h3>
        <div className={cn("mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-ink-2", large ? "text-[13px]" : "text-[12px]")}>
          {len != null && <span className="num">{len.toFixed(3)} km</span>}
          {layout?.turns != null && <span className="num">{layout.turns} turns</span>}
          {large && item.character && <span className="text-ink-3">{item.character}</span>}
        </div>
      </div>
    </Link>
  );
}
