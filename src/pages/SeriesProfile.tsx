/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronDown, ChevronUp, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import EventCard, { EventListHead, shortDateRange } from "@/components/EventCard";
import { ClassBadge, EmptyState, PageHeader, Pos, RowsSkeleton, SectionHeader, Stat, StatStrip } from "@/components/tr/primitives";
import { Count, Segmented } from "@/components/browse/Segmented";
import { Progress } from "@/components/ui/progress";
import { exportStandingsPdf } from "@/lib/standings-pdf-export";
import { fetchClassWinners, fetchSeasonClassColors, shortName, type ClassWinner } from "@/lib/race-data";
import { getClassColor } from "@/lib/classes";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface DisplayEvent {
  id: string;
  name: string;
  circuitName: string | null;
  country: string | null;
  date: string | null;
  endDate: string | null;
  year: number;
  seasonId: string;
  round: string | null;
}

interface StandingDriver {
  id: string;
  name: string;
  nationality: string | null;
}

interface StandingEntry {
  carNumber: string;
  drivers: StandingDriver[];
  teamName: string | null;
  teamId: string | null;
  totalPoints: number;
  position: number;
  className: string | null;
  wins: number;
  podiums: number;
}

const fmtPts = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

/* ── Standings table ─────────────────────────────────────────── */
function StandingsTable({ standings, className, color }: { standings: StandingEntry[]; className?: string | null; color?: string }) {
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 12;
  const rows = showAll ? standings : standings.slice(0, LIMIT);
  const leader = standings[0]?.totalPoints ?? 0;
  const multiDriver = standings.some((s) => s.drivers.length > 1);
  const hasWinsOrPodiums = standings.some((s) => s.wins > 0 || s.podiums > 0);

  if (standings.length === 0)
    return <EmptyState title="No points scored yet">Standings appear once classified results with points are published.</EmptyState>;

  return (
    <div className="overflow-hidden rounded border bg-card">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12">Pos</th>
              <th className="w-14 text-right">Car</th>
              <th>{multiDriver ? "Drivers" : "Driver"}</th>
              <th className="hidden lg:table-cell">Team</th>
              {className && <th className="hidden md:table-cell">Class</th>}
              {hasWinsOrPodiums && (
                <>
                  <th className="hidden w-12 text-right sm:table-cell" title="Wins">
                    W
                  </th>
                  <th className="hidden w-12 text-right sm:table-cell" title="Podiums">
                    Pod
                  </th>
                </>
              )}
              <th className="w-16 text-right">Pts</th>
              <th className="w-16 text-right">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.carNumber}>
                <td>
                  <Pos value={e.position} />
                </td>
                <td className="num text-right font-semibold">#{e.carNumber}</td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {e.drivers.length ? (
                      e.drivers.map((d) => (
                        <Link key={d.id} to={`/driver/${d.id}`} className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:text-primary">
                          <FlagImage nationality={d.nationality} size={14} />
                          {multiDriver ? shortName(d.name) : d.name}
                        </Link>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  {e.teamName && <div className="truncate text-xs text-muted-foreground lg:hidden">{e.teamName}</div>}
                </td>
                <td className="hidden max-w-[16rem] truncate text-muted-foreground lg:table-cell">
                  {e.teamId ? (
                    <Link to={`/team/${e.teamId}`} className="hover:text-foreground">
                      {e.teamName}
                    </Link>
                  ) : (
                    e.teamName || "—"
                  )}
                </td>
                {className && (
                  <td className="hidden md:table-cell">
                    <ClassBadge name={className} color={color} />
                  </td>
                )}
                {hasWinsOrPodiums && (
                  <>
                    <td className={cn("num hidden text-right sm:table-cell", e.wins ? "text-foreground" : "text-muted-foreground")}>{e.wins}</td>
                    <td className={cn("num hidden text-right sm:table-cell", e.podiums ? "text-foreground" : "text-muted-foreground")}>{e.podiums}</td>
                  </>
                )}
                <td className="num text-right font-semibold">{fmtPts(e.totalPoints)}</td>
                <td className="num text-right text-muted-foreground">{e.position === 1 ? "—" : `−${fmtPts(leader - e.totalPoints)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {standings.length > LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-1 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          {showAll ? "Show top " + LIMIT : `Show all ${standings.length}`}
          {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/* ── Export PDF control (with class picker for multi-class seasons) ── */
function ExportButton({ classes, isMulticlass, year, seasonId, seriesName }: {
  classes: { id: string; name: string }[];
  isMulticlass: boolean;
  year: number;
  seasonId: string;
  seriesName: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(classes.map((c) => c.name)));

  useEffect(() => setSelected(new Set(classes.map((c) => c.name))), [classes]);

  const handleExport = async (classNames?: string[] | null) => {
    setOpen(false);
    setExporting(true);
    setProgress(5);
    try {
      await exportStandingsPdf({ seriesName, year, seasonId, classNames, onProgress: setProgress });
      setProgress(100);
      setTimeout(() => {
        setExporting(false);
        setProgress(0);
      }, 800);
    } catch (e: any) {
      console.error("Standings PDF export failed:", e);
      setExporting(false);
      setProgress(0);
      alert("PDF export failed: " + (e?.message || "Unknown error"));
    }
  };

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (exporting)
    return (
      <div className="flex w-36 items-center gap-2">
        <Progress value={progress} className="h-1.5" />
        <span className="num text-[11px] text-muted-foreground">{Math.round(progress)}%</span>
      </div>
    );

  return (
    <div className="relative">
      <button
        onClick={() => (isMulticlass ? setOpen(!open) : handleExport(null))}
        className="flex h-8 items-center gap-1.5 rounded border bg-card px-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <FileDown className="h-3.5 w-3.5" /> Export PDF
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded border bg-popover p-3">
          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b pb-2">
            <input
              type="checkbox"
              checked={selected.size === classes.length}
              onChange={() => setSelected(selected.size === classes.length ? new Set() : new Set(classes.map((c) => c.name)))}
              className="accent-[hsl(var(--primary))]"
            />
            <span className="label-caps text-foreground">Select all</span>
          </label>
          {classes.map((cls) => (
            <label key={cls.id} className="flex cursor-pointer items-center gap-2 py-1">
              <input type="checkbox" checked={selected.has(cls.name)} onChange={() => toggle(cls.name)} className="accent-[hsl(var(--primary))]" />
              <span className="font-display text-sm font-semibold uppercase tracking-wide">{cls.name}</span>
            </label>
          ))}
          <button
            disabled={selected.size === 0}
            onClick={() => handleExport([...selected])}
            className="mt-2 h-8 w-full rounded-sm bg-signal font-display text-xs font-bold uppercase tracking-[0.12em] text-signal-foreground disabled:opacity-40"
          >
            Download {selected.size === classes.length ? "all" : `${selected.size} class${selected.size !== 1 ? "es" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<any>(null);
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<Record<string, StandingEntry[]>>({});
  const [standingsLoading, setStandingsLoading] = useState(true);
  const [seasonClassMap, setSeasonClassMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [classColors, setClassColors] = useState<Record<string, Record<string, string>>>({});
  const [winners, setWinners] = useState<Record<string, ClassWinner[]>>({});
  const [winnersLoaded, setWinnersLoaded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<string>("");
  const [activeClass, setActiveClass] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setSeasonId("");
    const fetchData = async () => {
      const { data: s } = await supabase.from("v2_series").select("*").eq("id", id).single();
      setSeries(s);
      setLoading(false);
      if (!s) return;

      const { data: seasons } = await supabase.from("v2_seasons").select("id, year, is_multiclass").eq("series_id", id);
      const seasonIds = (seasons || []).map((sn) => sn.id);
      const seasonYearMap = Object.fromEntries((seasons || []).map((sn) => [sn.id, sn.year]));
      const multiclassSeasons = new Set((seasons || []).filter((sn) => sn.is_multiclass).map((sn) => sn.id));

      fetchSeasonClassColors(seasonIds).then(setClassColors);

      if (multiclassSeasons.size > 0) {
        const { data: classes } = await supabase
          .from("v2_season_classes")
          .select("id, season_id, class_name, sort_order")
          .in("season_id", [...multiclassSeasons])
          .order("sort_order");
        const cMap: Record<string, { id: string; name: string }[]> = {};
        for (const c of (classes || []) as any[]) {
          if (!cMap[c.season_id]) cMap[c.season_id] = [];
          cMap[c.season_id].push({ id: c.id, name: c.class_name });
        }
        setSeasonClassMap(cMap);
      }

      if (seasonIds.length === 0) {
        setStandingsLoading(false);
        return;
      }

      const { data: evts } = await supabase
        .from("v2_events")
        .select("id, name, start_date, end_date, season_id, status, round_number, v2_circuits(name, country)")
        .in("season_id", seasonIds)
        .eq("status", "published" as any)
        .order("start_date", { ascending: true });

      const mappedEvents: DisplayEvent[] = ((evts || []) as any[]).map((e) => ({
        id: e.id,
        name: e.name,
        circuitName: e.v2_circuits?.name || null,
        country: e.v2_circuits?.country || null,
        date: e.start_date,
        endDate: e.end_date,
        year: seasonYearMap[e.season_id] || 0,
        seasonId: e.season_id,
        round: e.round_number,
      }));
      setEvents(mappedEvents);

      // Default to the most recent season with events
      const latest = [...mappedEvents].sort((a, b) => b.year - a.year)[0];
      if (latest) setSeasonId((cur) => cur || latest.seasonId);

      // Team season aliases for display names
      const { data: teamSeasonNames } = await supabase
        .from("v2_team_season_names" as any)
        .select("team_id, season_id, display_name")
        .in("season_id", seasonIds);
      const teamAliasMap = new Map<string, string>();
      for (const tsn of (teamSeasonNames || []) as any[]) teamAliasMap.set(`${tsn.team_id}|${tsn.season_id}`, tsn.display_name);

      // Compute standings per season from points data
      const standingsMap: Record<string, StandingEntry[]> = {};
      await Promise.all(
        seasonIds.map(async (sid) => {
          const evtIds = mappedEvents.filter((e) => e.seasonId === sid).map((e) => e.id);
          if (evtIds.length === 0) return;

          const { data: sessions } = await supabase.from("v2_sessions").select("id, parent_session_id, session_type, name").in("event_id", evtIds);
          if (!sessions || sessions.length === 0) return;
          const parentSessions = sessions.filter((x) => !x.parent_session_id);
          const sessIds = parentSessions.map((x) => x.id);
          if (sessIds.length === 0) return;

          // Main races (not sprints / qualifying) count towards wins and podiums
          const raceSessionIds = new Set(
            parentSessions
              .filter((x) => (x.session_type === "race" || x.session_type === "endurance_race") && !x.name?.toLowerCase().includes("sprint"))
              .map((x) => x.id),
          );

          const [{ data: raceRes }, { data: qualRes }] = await Promise.all([
            supabase
              .from("v2_race_results" as any)
              .select("car_number, driver_id, points, position, session_id, extra_data, v2_drivers(full_name, nationality), v2_teams(id, full_name)")
              .in("session_id", sessIds),
            supabase
              .from("v2_qualifying_results" as any)
              .select("car_number, driver_id, points, session_id, extra_data, v2_drivers(full_name, nationality), v2_teams(id, full_name)")
              .in("session_id", sessIds),
          ]);
          const allResults = [...((raceRes || []) as any[]), ...((qualRes || []) as any[])];

          const carMap = new Map<string, Omit<StandingEntry, "position" | "drivers"> & { drivers: Map<string, StandingDriver> }>();
          const countedPoints = new Set<string>();
          const countedWins = new Set<string>();

          for (const r of allResults) {
            if (!r.car_number) continue;
            const pts = r.points != null ? Number(r.points) : 0;
            const cls = r.extra_data?.Class || r.extra_data?.class || null;
            const teamId = r.v2_teams?.id || null;
            const teamDisplayName = (teamId ? teamAliasMap.get(`${teamId}|${sid}`) : null) || r.v2_teams?.full_name || null;

            if (!carMap.has(r.car_number))
              carMap.set(r.car_number, {
                carNumber: r.car_number,
                drivers: new Map(),
                teamName: teamDisplayName,
                teamId,
                totalPoints: 0,
                className: cls,
                wins: 0,
                podiums: 0,
              });
            const entry = carMap.get(r.car_number)!;

            // Points once per car per session (endurance cars have one row per driver)
            const key = `${r.car_number}|${r.session_id}`;
            if (pts > 0 && !countedPoints.has(key)) {
              entry.totalPoints += pts;
              countedPoints.add(key);
            }
            if (r.driver_id && r.v2_drivers?.full_name && !entry.drivers.has(r.driver_id))
              entry.drivers.set(r.driver_id, { id: r.driver_id, name: r.v2_drivers.full_name, nationality: r.v2_drivers.nationality ?? null });
            if (!entry.teamName && teamDisplayName) {
              entry.teamName = teamDisplayName;
              entry.teamId = teamId;
            }
            if (!entry.className && cls) entry.className = cls;

            // Wins / podiums: by class position in multi-class races, else overall
            if (r.position != null && r.session_id && raceSessionIds.has(r.session_id) && !countedWins.has(key)) {
              countedWins.add(key);
              const pic = Number(r.extra_data?.PIC);
              const rank = cls && pic > 0 ? pic : r.position;
              if (rank === 1) entry.wins++;
              if (rank <= 3) entry.podiums++;
            }
          }

          const standings = [...carMap.values()]
            .filter((e) => e.totalPoints > 0)
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .map((e, i) => ({ ...e, drivers: [...e.drivers.values()], position: i + 1 }));
          if (standings.length > 0) standingsMap[sid] = standings;
        }),
      );
      setSeasonStandings(standingsMap);
      setStandingsLoading(false);
    };
    fetchData();
  }, [id]);

  /* Seasons that have published events, newest first */
  const seasonOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.seasonId, e.year);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const seasonEvents = useMemo(() => events.filter((e) => e.seasonId === seasonId), [events, seasonId]);
  const year = seasonOptions.find(([s]) => s === seasonId)?.[1] ?? 0;
  const classes = useMemo(() => seasonClassMap[seasonId] || [], [seasonClassMap, seasonId]);
  const isMulticlass = classes.length > 0;
  const colors = classColors[seasonId];
  const standings = useMemo(() => seasonStandings[seasonId] || [], [seasonStandings, seasonId]);

  // Reset class tab when the season changes
  useEffect(() => {
    if (classes.length && !classes.some((c) => c.name === activeClass)) setActiveClass(classes[0].name);
  }, [classes, activeClass]);

  // Class winners for the selected season's schedule
  useEffect(() => {
    if (!seasonId || winnersLoaded.has(seasonId) || seasonEvents.length === 0) return;
    fetchClassWinners(seasonEvents.map((e) => e.id), 1).then((w) => {
      setWinners((prev) => ({ ...prev, ...w }));
      setWinnersLoaded((prev) => new Set(prev).add(seasonId));
    });
  }, [seasonId, seasonEvents, winnersLoaded]);

  const classStandings = useMemo(() => {
    if (!isMulticlass) return standings;
    return standings
      .filter((s) => s.className === activeClass)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((s, i) => ({ ...s, position: i + 1 }));
  }, [standings, isMulticlass, activeClass]);

  const today = new Date().toISOString().slice(0, 10);
  const completed = seasonEvents.filter((e) => e.date && e.date <= today);
  const lastRound = completed[completed.length - 1];
  const allYears = seasonOptions.map(([, y]) => y);

  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-10">
          <RowsSkeleton rows={8} />
        </div>
      </div>
    );
  if (!series)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-16">
          <EmptyState title="Series not found">
            <Link to="/series" className="text-primary hover:underline">
              Browse all series
            </Link>
          </EmptyState>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={series.name}
        description={`${series.name}: season schedules, race winners and championship standings.`}
        canonical={`/series/${id}`}
      />
      <Header />

      <PageHeader
        kicker={
          <>
            <Link to="/series" className="hover:text-foreground">
              Series
            </Link>
            <span>/</span>
            <span className="text-primary">{series.short_name || series.name}</span>
          </>
        }
        title={series.name}
        meta={
          seasonOptions.length > 0 && (
            <>
              <span>
                <span className="num text-foreground">{seasonOptions.length}</span> {seasonOptions.length === 1 ? "season" : "seasons"}
              </span>
              <span>
                <span className="num text-foreground">{events.length}</span> {events.length === 1 ? "event" : "events"}
              </span>
              <span className="num">{allYears.length > 1 ? `${Math.min(...allYears)}–${Math.max(...allYears)}` : allYears[0]}</span>
            </>
          )
        }
        actions={
          seasonOptions.length > 1 && (
            <Segmented label="Season" value={seasonId} onChange={setSeasonId} options={seasonOptions.map(([s, y]) => ({ value: s, label: <span className="num">{y}</span> }))} />
          )
        }
      />

      <main className="container py-8">
        {events.length === 0 ? (
          standingsLoading ? (
            <RowsSkeleton rows={6} />
          ) : (
            <EmptyState title="No events yet">No published events are linked to this series yet.</EmptyState>
          )
        ) : (
          <>
            <StatStrip className="grid-cols-2 md:grid-cols-4">
              <Stat label={`${year} rounds`} value={seasonEvents.length} sub={`${completed.length} completed`} />
              <Stat label="Classes" value={isMulticlass ? classes.length : 1} sub={isMulticlass ? classes.map((c) => c.name).join(" · ") : "Single class"} />
              <Stat label="Cars scoring" value={standingsLoading ? "—" : standings.length} sub="In the championship" />
              <Stat
                label="Latest round"
                value={<span className="num text-2xl">{lastRound ? shortDateRange(lastRound.date, lastRound.endDate) : "—"}</span>}
                sub={lastRound?.name}
              />
            </StatStrip>

            {/* Standings */}
            <section className="mt-10">
              <SectionHeader
                kicker={`${year} championship`}
                title="Standings"
                right={
                  standings.length > 0 && (
                    <ExportButton classes={classes} isMulticlass={isMulticlass} year={year} seasonId={seasonId} seriesName={series.name} />
                  )
                }
              />
              {isMulticlass && standings.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {classes.map((c) => {
                    const active = c.name === activeClass;
                    const col = getClassColor(c.name, colors);
                    const n = standings.filter((s) => s.className === c.name).length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveClass(c.name)}
                        aria-pressed={active}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-sm border px-3 font-display text-xs font-bold uppercase tracking-wider transition-colors",
                          active ? "border-foreground/40 bg-accent text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                        )}
                        style={active ? { borderColor: col } : undefined}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col }} />
                        {c.name}
                        <span className="num text-[11px] font-normal tracking-normal opacity-60">{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {standingsLoading ? (
                <RowsSkeleton rows={8} />
              ) : (
                <StandingsTable
                  key={`${seasonId}-${activeClass}`}
                  standings={classStandings}
                  className={isMulticlass ? activeClass : null}
                  color={isMulticlass ? getClassColor(activeClass, colors) : undefined}
                />
              )}
            </section>

            {/* Schedule */}
            <section className="mt-12">
              <SectionHeader kicker={`${year} season`} title="Schedule" right={<Count n={seasonEvents.length} label={seasonEvents.length === 1 ? "round" : "rounds"} />} />
              <div className="grid gap-px overflow-hidden rounded border bg-border">
                <EventListHead lead="Rnd · Date" />
                {seasonEvents.map((ev, i) => {
                  const upcoming = !!ev.date && ev.date > today;
                  return (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      hideYear
                      winners={winnersLoaded.has(seasonId) ? winners[ev.id] || [] : undefined}
                      colors={colors}
                      aside={upcoming ? <span className="label-caps text-primary">Upcoming</span> : undefined}
                      lead={
                        <div className="leading-tight">
                          <div className="font-accent text-lg text-foreground">R{String(ev.round || i + 1).padStart(2, "0")}</div>
                          <div className="num mt-0.5 text-xs text-muted-foreground">{shortDateRange(ev.date, ev.endDate)}</div>
                        </div>
                      }
                    />
                  );
                })}
              </div>
              {lastRound && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Last updated after <span className="text-foreground">{lastRound.name}</span>,{" "}
                  <span className="num">{formatDateRange(lastRound.date, lastRound.endDate)}</span>.
                </p>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SeriesProfile;
