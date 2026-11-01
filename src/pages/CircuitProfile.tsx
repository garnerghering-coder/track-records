import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { classRank, fmtLap, type RaceDigest } from "@/lib/insights";
import { getClassColor } from "@/lib/classes";
import { useDigests, useEvents, useLayouts, useLoad, useNames, type EventLite } from "@/site/data";
import { CarNum, ClassTag, Eyebrow, Livery, Note, Page, SectionHead, Skeleton, Tabs, TrackMap, dateRange } from "@/site/ui";
import { characterWords, crewLastNames, fetchLapRecords, fingerprint, layoutsOf, num, plural, stripYear, useCircuits, type LayoutRow } from "@/site/archive";

type Names = ReturnType<typeof useNames>;

const INDICES = [
  { key: "tcs100", cat: "tcsCategory", label: "Character", lo: "Tight & twisty", hi: "Power", help: "Straights against corner density." },
  { key: "ei", cat: "eiCategory", label: "Elevation", lo: "Flat", hi: "Mountainous", help: "Elevation range per kilometre of lap." },
  { key: "csi", cat: "csiCategory", label: "Braking", lo: "Flowing", hi: "Extreme", help: "Share of corners that need heavy braking." },
  { key: "tdi", cat: "tdiCategory", label: "Demand", lo: "Efficient", hi: "Relentless", help: "The three combined: how hard the lap works a car." },
] as const;

export default function CircuitProfile() {
  const { id } = useParams<{ id: string }>();
  const circuits = useCircuits();
  const layouts = useLayouts();
  const events = useEvents();
  const digests = useDigests();
  const names = useNames();

  const circuit = circuits?.find((c) => c.id === id);
  const myLayouts = useMemo(() => (id ? layoutsOf(id, layouts) : []), [id, layouts]);
  const [layoutId, setLayoutId] = useState<string | null>(null);

  const races = useMemo(() => (events || []).filter((e) => e.circuit_id === id).sort((a, b) => (b.start_date || "").localeCompare(a.start_date || "")), [events, id]);
  // Default to the layout of the most recent race (an oval and a road course share a venue).
  const recentLayout = races.find((e) => e.layout_id && myLayouts.some((l) => l.id === e.layout_id))?.layout_id;
  const layout = myLayouts.find((l) => l.id === layoutId) || myLayouts.find((l) => l.id === recentLayout) || myLayouts[0];
  const multiLayout = myLayouts.length > 1;
  // Races on the layout on show (an oval and a road course at one venue are counted separately).
  const layoutRaces = multiLayout ? races.filter((e) => e.layout_id === layout?.id) : races;
  const layoutName = (lid: string | null | undefined) => myLayouts.find((l) => l.id === lid)?.name || null;
  const recKey = events ? `laprec:${id}` : null;
  const records = useLoad(recKey, () => fetchLapRecords(id, races, myLayouts[0]?.id ?? null));
  // Records of the layout on show (all of them when the circuit has a single layout).
  const shownRecords = useMemo(() => (records.data ? (multiLayout ? records.data.filter((r) => !r.layoutId || r.layoutId === layout?.id) : records.data) : undefined), [records.data, multiLayout, layout]);

  const winnerSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of races) for (const r of digests?.[e.id]?.races || []) for (const w of r.winners) for (const d of w.driverIds) s.add(d);
    return s;
  }, [races, digests]);

  if (circuits && !circuit) {
    return (
      <Shell title="Circuit not found">
        <Page className="pt-16">
          <Note title="We couldn't find that circuit.">
            <Link to="/circuits" className="underline underline-offset-4">
              Browse every circuit
            </Link>
            .
          </Note>
        </Page>
      </Shell>
    );
  }

  const len = num(layout?.length_km);
  const words = characterWords(layout);
  const latest = races[0];
  const first = races[races.length - 1];
  const fastest = shownRecords?.slice().sort((a, b) => a.seconds - b.seconds)[0];

  return (
    <Shell title={circuit ? `${circuit.name} – Circuit record` : "Circuit"} canonical={`/circuit/${id}`} description={circuit ? `${circuit.name}: layouts, character, winners by year and lap records.` : undefined}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Page className="pt-6 sm:pt-10">
        <Link to="/circuits" className="group inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Circuits
        </Link>
        <div className="mt-6 grid items-center gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
          <div className="relative z-10 min-w-0">
            <Eyebrow>
              <span>Circuit</span>
              {circuit && (
                <>
                  <span>·</span>
                  <FlagImage nationality={circuit.country} size={13} className="rounded-[2px]" />
                  <span>{[circuit.location, circuit.country].filter(Boolean).join(", ")}</span>
                </>
              )}
            </Eyebrow>
            {circuit ? (
              <h1 className="display mt-4 text-[3rem] leading-[0.92] sm:text-[4.6rem] lg:text-[5.4rem]">{circuit.name}</h1>
            ) : (
              <Skeleton className="mt-4 h-32 w-full max-w-xl" />
            )}
            {circuit && layouts && events && (
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
                {len != null ? (
                  <>
                    A <span className="num text-ink">{len.toFixed(3)} km</span>
                    {layout?.turns != null && (
                      <>
                        , <span className="num text-ink">{layout.turns}</span>-turn
                      </>
                    )}{" "}
                    {words.noun}
                    {words.traits.length ? `, ${words.traits.join(" and ")}` : ""}.
                  </>
                ) : (
                  "Layout details are not on the record yet. "
                )}{" "}
                {races.length ? (
                  <>
                    It has hosted {plural(races.length, "race")} on the record
                    {latest && (
                      <>
                        , most recently the{" "}
                        <Link to={`/events/${latest.id}`} className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                          {latest.year} {stripYear(latest.name)}
                        </Link>
                      </>
                    )}
                    .
                  </>
                ) : (
                  "No races here are on the record yet."
                )}
              </p>
            )}
            {myLayouts.length > 1 && (
              <div className="mt-6">
                <Tabs value={layout?.id || ""} onChange={setLayoutId} items={myLayouts.map((l) => ({ value: l.id, label: l.name || "Layout" }))} />
              </div>
            )}
          </div>
          <div className="relative -mx-2 aspect-[16/11] sm:mx-0">
            <div className="grid-bg absolute inset-0 rounded-[28px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
            {layout ? (
              <TrackMap key={layout.layout_image_url} src={layout.layout_image_url} alt={`${circuit?.name} – ${layout.name || "layout"}`} className="absolute inset-0 m-auto h-[88%] w-[92%] animate-in fade-in zoom-in-95 duration-700" />
            ) : layouts ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">No layout map on the record</div>
            ) : (
              <Skeleton className="absolute inset-6" />
            )}
            {layout?.name && <span className="eyebrow absolute bottom-3 right-4">{layout.name}</span>}
          </div>
        </div>

        {/* key numbers */}
        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-rule sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Length", value: len != null ? `${len.toFixed(3)} km` : "—" },
            { label: "Turns", value: layout?.turns ?? "—" },
            { label: "Elevation change", value: num(layout?.total_elevation_change_m) != null ? `${num(layout?.total_elevation_change_m)} m` : "—" },
            { label: "Straights", value: num(layout?.total_straight_length_km) != null ? `${num(layout?.total_straight_length_km)!.toFixed(2)} km` : "—" },
            { label: multiLayout ? "Races on this layout" : "Races held", value: events ? layoutRaces.length : "…" },
            { label: "Since", value: (multiLayout ? layoutRaces[layoutRaces.length - 1]?.year : first?.year) ?? (events ? "—" : "…") },
          ].map((s) => (
            <div key={s.label} className="bg-sheet px-5 py-5">
              <div className="eyebrow">{s.label}</div>
              <div className="num mt-2 text-2xl">{s.value}</div>
            </div>
          ))}
        </div>
      </Page>

      {/* ── Character ───────────────────────────────────────── */}
      <Page className="mt-24 sm:mt-32">
        <SectionHead eyebrow={layout?.name ? `Fingerprint · ${layout.name}` : "Fingerprint"} title={<>The <em>character</em> of the lap</>} />
        <Fingerprint layout={layout} loading={!layouts} />
      </Page>

      {/* ── Lap records ─────────────────────────────────────── */}
      <Page className="mt-24 sm:mt-32">
        <SectionHead
          eyebrow={`Fastest race lap per class or series${multiLayout && layout?.name ? ` · ${layout.name}` : ""}`}
          title="Lap records"
          action={
            multiLayout ? (
              <Tabs value={layout?.id || ""} onChange={setLayoutId} items={myLayouts.map((l) => ({ value: l.id, label: l.name || "Layout" }))} className="mb-2" />
            ) : undefined
          }
        />
        {!shownRecords ? (
          events && !races.length ? (
            <Note title="No lap records yet">Lap records appear once a race here is on the record.</Note>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56 rounded-3xl" />
              ))}
            </div>
          )
        ) : shownRecords.length === 0 ? (
          <Note title="No lap times on the record">
            {multiLayout && records.data?.length ? `No race on the ${layout?.name || "this layout"} has fastest-lap data yet; pick another layout above.` : "The races held here were published without fastest-lap data."}
          </Note>
        ) : (
          <div className={cn("grid gap-4 sm:grid-cols-2", shownRecords.length >= 4 ? "lg:grid-cols-4" : shownRecords.length === 3 ? "lg:grid-cols-3" : "")}>
            {shownRecords.map((r) => {
              const col = colorFromDigests(digests, races, r.className);
              const isOutright = fastest && r.className === fastest.className;
              const ev = races.find((e) => e.id === r.eventId);
              return (
                <div key={`${r.layoutId}|${r.className}`} className="sheet relative flex flex-col overflow-hidden p-6">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: col }} />
                  <div className="flex items-center justify-between">
                    {r.className === "Overall" || r.bySeries ? <span className="eyebrow">{r.className}</span> : <ClassTag name={r.className} color={col} />}
                    {isOutright && shownRecords.length > 1 && <span className="rounded-full bg-hl px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-hl-ink">Outright</span>}
                  </div>
                  <div className="num mt-6 text-[2.6rem] leading-none tracking-[-0.04em]">{fmtLap(r.seconds)}</div>
                  {len != null && <div className="num mt-2 text-[12px] text-ink-3">{((len / r.seconds) * 3600).toFixed(1)} km/h average</div>}
                  <div className="mt-6 flex items-center gap-2">
                    <CarNum n={r.carNumber} />
                    <span className="truncate text-[14.5px]">{crewLastNames(r.driverIds, names, 4) || "—"}</span>
                  </div>
                  {r.teamId && names?.teams[r.teamId] && (
                    <Link to={`/team/${r.teamId}`} className="mt-1 truncate text-xs text-ink-3 hover:text-ink">
                      {names.teams[r.teamId].full_name}
                    </Link>
                  )}
                  <Link to={`/events/${r.eventId}`} className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-[12.5px] text-ink-2 [margin-top:1.25rem] hover:text-ink">
                    <span className="truncate">
                      {r.year} {ev ? stripYear(ev.short_name || ev.name) : ""}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Page>

      {/* ── Winners by year ─────────────────────────────────── */}
      <Page className="mt-24 sm:mt-32">
        <SectionHead
          eyebrow={events ? `${plural(races.length, "race")} held · ${plural(winnerSet.size, "winning driver")}` : "Races held"}
          title="Winners by year"
        />
        {!events ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : !races.length ? (
          <Note title="No races on the record here yet">{circuit?.name} is in the atlas, but no race held here has been published.</Note>
        ) : (
          <ol className="overflow-hidden rounded-3xl border bg-sheet">
            {races.map((ev) => (
              <WinnerRow key={ev.id} ev={ev} race={lastRace(digests?.[ev.id]?.races)} names={names} loading={!digests} layout={multiLayout ? layoutName(ev.layout_id) : null} />
            ))}
          </ol>
        )}
      </Page>
    </Shell>
  );
}

const lastRace = (r?: RaceDigest[]) => (r?.length ? r[r.length - 1] : undefined);

function colorFromDigests(digests: ReturnType<typeof useDigests>, races: EventLite[], cls: string) {
  for (const e of races) for (const r of digests?.[e.id]?.races || []) for (const c of r.classes) if (c.name === cls && c.color) return c.color;
  return getClassColor(cls === "Overall" ? null : cls);
}

function Shell({ title, canonical, description, children }: { title: string; canonical?: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SEOHead title={title} canonical={canonical} description={description} />
      <Header />
      {children}
      <Footer />
    </div>
  );
}

/* ── Fingerprint ───────────────────────────────────────────────── */

function Fingerprint({ layout, loading }: { layout?: LayoutRow; loading: boolean }) {
  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-52 rounded-3xl" />
        ))}
      </div>
    );
  const fp = fingerprint(layout);
  if (!fp || INDICES.every((i) => fp[i.key] == null))
    return <Note title="Not enough layout data">The fingerprint needs the lap length, corner count, straights, elevation and braking zones of a layout; this one is missing some of them.</Note>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {INDICES.map((ix, k) => {
        const v = fp[ix.key];
        const cat = fp[ix.cat];
        return (
          <div key={ix.key} className={cn("sheet flex flex-col p-4 sm:p-6", k === 3 && "bg-ink text-paper [&_.eyebrow]:text-paper/50")}>
            <div className="eyebrow">{ix.label}</div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="num text-4xl sm:text-5xl">{v == null ? "—" : Math.round(v)}</span>
              <span className="num text-xs opacity-50">/100</span>
            </div>
            <div className="display mt-2 text-[1.3rem] italic leading-none sm:text-[1.7rem]">{cat || "Unknown"}</div>
            <div className="mt-auto pt-6">
              <div className="relative h-1.5 rounded-full bg-current/10" style={{ backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)" }}>
                {v != null && (
                  <span
                    className={cn("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2", k === 3 ? "border-ink bg-hl" : "border-sheet bg-ink")}
                    style={{ left: `${Math.max(0, Math.min(100, v))}%` }}
                  />
                )}
              </div>
              <div className="mt-2 hidden justify-between font-mono text-[10px] uppercase tracking-wide opacity-50 sm:flex">
                <span>{ix.lo}</span>
                <span>{ix.hi}</span>
              </div>
              <p className="mt-3 text-[12px] leading-snug opacity-70 sm:text-[13px]">{ix.help}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Winners row ───────────────────────────────────────────────── */

function WinnerRow({ ev, race, names, loading, layout }: { ev: EventLite; race?: RaceDigest; names: Names; loading: boolean; layout?: string | null }) {
  const winners = race ? [...race.winners].sort((a, b) => classRank(a.className) - classRank(b.className)) : [];
  return (
    <li className="grid gap-5 border-b px-5 py-6 last:border-b-0 sm:px-7 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <Link to={`/events/${ev.id}`} className="group min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="font-accent text-4xl leading-none">{ev.year}</span>
          <span className="eyebrow">{ev.series?.short_name || ev.series?.name}</span>
        </div>
        <div className="display mt-2 text-[1.5rem] leading-[1.05] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{stripYear(ev.name)}</div>
        <div className="mt-1 text-xs text-ink-3">
          {dateRange(ev.start_date, ev.end_date)}
          {layout ? ` · ${layout}` : ""}
        </div>
      </Link>
      {loading ? (
        <Skeleton className="h-20" />
      ) : !winners.length ? (
        <p className="self-center text-sm text-ink-3">The classification of this race is not on the record.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {winners.map((w) => {
            const col = race!.classes.find((c) => c.name === w.className)?.color || getClassColor(w.className);
            return (
              <div key={w.carNumber} className="relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-paper/60 p-3 pl-4">
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: col }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {w.className ? <ClassTag name={w.className} color={col} /> : <span className="eyebrow">Winner</span>}
                    <span className="num text-[11px] text-ink-3">#{w.carNumber}</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[13.5px] leading-snug">
                    {w.driverIds.slice(0, 4).map((d) => (
                      <Link key={d} to={`/driver/${d}`} className="block truncate hover:underline hover:underline-offset-4">
                        {names?.drivers[d]?.full_name?.replace(/\s*\(R\)\s*$/i, "").split(/\s+/).slice(1).join(" ") || "…"}
                      </Link>
                    ))}
                  </div>
                </div>
                <Livery key={w.livery} src={w.livery} alt={`#${w.carNumber}`} className="h-10 w-20 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
