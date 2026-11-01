/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import ReportDialog from "@/components/ReportDialog";
import DriverFingerprint, { DriverFingerprintData } from "@/components/DriverFingerprint";
import { ClassBadge, EmptyState, PageHeader, Pos, SectionHeader, Stat, StatStrip } from "@/components/tr/primitives";
import {
  CountList,
  ProfileLoading,
  ProfileNotFound,
  ReportStrip,
  ShareButton,
  StatusCell,
  classInfo,
  fmtDate,
  isClassified,
  yearSpan,
} from "@/components/profile-kit";
import { useDriverStandings } from "@/hooks/useDriverStandings";
import { formatDateRange } from "@/lib/date-utils";
import { fetchSeasonClassColors } from "@/lib/race-data";
import { getClassColor, sortClasses } from "@/lib/classes";
import { cn } from "@/lib/utils";

const DriverProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [driver, setDriver] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [allSessionResults, setAllSessionResults] = useState<any[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [teamAliasMap, setTeamAliasMap] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, Record<string, string>>>({});
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [fingerprint, setFingerprint] = useState<DriverFingerprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const standingsData = useDriverStandings(id);

  const qualifyingResults = useMemo(() => allSessionResults.filter((r) => r._source === "qualifying"), [allSessionResults]);

  const seasonYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of [...raceHistory, ...qualifyingResults]) {
      const y = r.event?.v2_seasons?.year;
      if (y) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [raceHistory, qualifyingResults]);

  const teamName = (r: any) => (r.v2_teams ? teamAliasMap[`${r.v2_teams.id}:${r.event?.v2_seasons?.id}`] || r.v2_teams.full_name : null);
  const carName = (r: any) => (r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : null);

  /* ── Career numbers (honest: computed only from the loaded results) ── */
  const stats = useMemo(() => {
    const filterBySeason = (rows: any[]) =>
      selectedSeason === "all" ? rows : rows.filter((r) => String(r.event?.v2_seasons?.year) === selectedSeason);

    const races = filterBySeason(raceHistory);
    const finished = races.filter(isClassified);
    const quals = filterBySeason(qualifyingResults).filter((r) => r.position != null);

    const withPos = finished.map((r) => ({ r, ...classInfo(r) })).filter((x) => x.classPos != null);
    const wins = withPos.filter((x) => x.classPos === 1).length;
    const podiums = withPos.filter((x) => x.classPos! <= 3).length;
    const best = withPos.reduce<(typeof withPos)[number] | null>((b, x) => (!b || x.classPos! < b.classPos! ? x : b), null);
    const bestCount = best ? withPos.filter((x) => x.classPos === best.classPos).length : 0;

    const avg = (arr: number[]) => (arr.length === 0 ? null : arr.reduce((s, n) => s + n, 0) / arr.length);
    const avgRace = avg(withPos.map((x) => x.classPos!));
    const qualPos = quals.map((r) => classInfo(r).classPos).filter((n): n is number => n != null);
    const avgQual = avg(qualPos);

    const classAware = races.some((r) => classInfo(r).cls);
    const dnfs = races.filter((r) => r.status === "dnf").length;

    // Career record lists
    const tally = <T,>(rows: any[], key: (r: any) => string | null, make: (r: any) => T) => {
      const m = new Map<string, { item: T; count: number; last: string }>();
      for (const r of rows) {
        const k = key(r);
        if (!k) continue;
        const cur = m.get(k);
        const d = r.event?.start_date || "";
        if (cur) {
          cur.count++;
          if (d > cur.last) cur.last = d;
        } else m.set(k, { item: make(r), count: 1, last: d });
      }
      return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
    };
    const teams = tally(races, (r) => r.v2_teams?.id ?? null, (r) => ({ id: r.v2_teams.id, name: teamName(r) as string }));
    const cars = tally(races, (r) => r.v2_cars?.id ?? null, (r) => ({ id: r.v2_cars.id, name: carName(r) as string }));
    const classes = tally(races, (r) => classInfo(r).cls, (r) => ({ name: classInfo(r).cls as string, seasonId: r.event?.v2_seasons?.id }));
    const series = tally(races, (r) => r.event?.v2_seasons?.v2_series?.id ?? null, (r) => ({ name: r.event?.v2_seasons?.v2_series?.name as string }));
    const years = [...new Set(races.map((r) => r.event?.v2_seasons?.year).filter(Boolean))] as number[];

    return {
      starts: races.length,
      finishes: finished.length,
      dnfs,
      wins,
      podiums,
      best,
      bestCount,
      avgRace,
      raceCount: withPos.length,
      avgQual,
      qualCount: qualPos.length,
      classAware,
      teams,
      cars,
      classes: classes.sort((a, b) => sortClasses(a.item.name, b.item.name)),
      series,
      years,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceHistory, qualifyingResults, selectedSeason, teamAliasMap]);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: d } = await supabase.from("v2_drivers").select("*").eq("id", id).single();
      setDriver(d);

      // Fetch fingerprint data
      if (d) {
        supabase
          .from("v2_driver_fingerprints" as any)
          .select("dps, dps_band, dcs, dcs_band, das, das_band, dws, dws_band, events_included, adps, adps_band")
          .eq("driver_id", id)
          .maybeSingle()
          .then(({ data: fp }) => {
            if (fp) setFingerprint(fp as any);
          });
      }

      if (d) {
        const sessionSelect =
          "id, name, session_type, event_id, date, parent_session_id, v2_events(id, name, start_date, end_date, v2_seasons(id, year, v2_series(id, name, short_name)), v2_circuits(id, name, country))";
        const raceSelect = `id, position, status, car_number, total_time, gap_to_leader, driver_id, session_id, extra_data, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`;
        const sortResults = (items: any[]) =>
          items.sort((a: any, b: any) => {
            const dateA = a.event?.start_date || "";
            const dateB = b.event?.start_date || "";
            return dateB.localeCompare(dateA);
          });

        // Fetch race results where this driver is the primary driver
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select(raceSelect)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        const primaryResults = (raceResults || []) as any[];

        // Find car_numbers this driver uses (from qualifying/practice)
        const [{ data: qualForDriver }, { data: pracForDriver }] = await Promise.all([
          supabase.from("v2_qualifying_results" as any).select("session_id, car_number, v2_sessions(event_id)").eq("driver_id", id),
          supabase.from("v2_practice_results" as any).select("session_id, car_number, v2_sessions(event_id)").eq("driver_id", id),
        ]);

        // Build map of event_id -> car_numbers this driver uses
        const driverCarsByEvent = new Map<string, Set<string>>();
        for (const r of [...(qualForDriver || []), ...(pracForDriver || [])] as any[]) {
          if (r.car_number && r.v2_sessions?.event_id) {
            const eventId = r.v2_sessions.event_id;
            if (!driverCarsByEvent.has(eventId)) driverCarsByEvent.set(eventId, new Set());
            driverCarsByEvent.get(eventId)!.add(r.car_number);
          }
        }
        for (const r of primaryResults) {
          if (r.car_number && r.v2_sessions?.v2_events?.id) {
            const eventId = r.v2_sessions.v2_events.id;
            if (!driverCarsByEvent.has(eventId)) driverCarsByEvent.set(eventId, new Set());
            driverCarsByEvent.get(eventId)!.add(r.car_number);
          }
        }

        // For events where this driver has NO direct race result, fetch co-driver results by event+car_number
        // ONLY for endurance races — in standard races, if the driver isn't listed they didn't race
        const directEventIds = new Set(primaryResults.map((r: any) => r.v2_sessions?.v2_events?.id).filter(Boolean));
        const coDriverEventIds = [...driverCarsByEvent.keys()].filter((eid) => !directEventIds.has(eid));

        const coDriverResults: any[] = [];
        const fetchCoDriverResults = async (eventIds: string[]) => {
          for (let i = 0; i < eventIds.length; i += 20) {
            const chunk = eventIds.slice(i, i + 20);
            const { data: eventSessions } = await supabase
              .from("v2_sessions" as any)
              .select("id, event_id, session_type")
              .in("event_id", chunk)
              .is("parent_session_id", null)
              .in("session_type", ["endurance_race"]);

            if (!eventSessions || eventSessions.length === 0) continue;

            const sessionIdsForChunk = (eventSessions as any[]).map((s: any) => s.id);
            const carNumbersForChunk = new Set<string>();
            for (const eid of chunk) {
              const cars = driverCarsByEvent.get(eid);
              if (cars) cars.forEach((c) => carNumbersForChunk.add(c));
            }

            const { data: coResults } = await supabase
              .from("v2_race_results" as any)
              .select(raceSelect)
              .in("session_id", sessionIdsForChunk)
              .in("car_number", [...carNumbersForChunk]);

            if (coResults) coDriverResults.push(...coResults);
          }
        };
        await fetchCoDriverResults(coDriverEventIds);

        // Also find co-driver results in events where driver HAS a direct result but in different sessions
        // Only for endurance races where drivers rotate
        const eventsWithDirectButMissingRace: string[] = [];
        for (const eid of directEventIds) {
          const hasRaceResult = primaryResults.some((r: any) => {
            const st = r.v2_sessions?.session_type;
            return r.v2_sessions?.v2_events?.id === eid && (st === "race" || st === "endurance_race" || st === "sprint_race");
          });
          if (!hasRaceResult) eventsWithDirectButMissingRace.push(eid);
        }
        await fetchCoDriverResults(eventsWithDirectButMissingRace);

        const mapResult = (r: any, source: string) => ({
          ...r,
          event: r.v2_sessions?.v2_events,
          session: r.v2_sessions,
          _source: source,
        });

        // Combine and filter out hourly sub-sessions (parent_session_id not null)
        // Only show final race/endurance_race results, not individual hour breakdowns
        const allRaceRows = [...primaryResults, ...coDriverResults]
          .map((r: any) => mapResult(r, "race"))
          .filter((r: any) => {
            const sess = r.session;
            if (!sess) return true;
            if (sess.parent_session_id) return false;
            return true;
          });

        // Deduplicate by session_id + car_number
        const seen = new Set<string>();
        const uniqueRaceRows = allRaceRows.filter((r) => {
          const key = `${r.session?.id}:${r.car_number}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setRaceHistory(sortResults([...uniqueRaceRows]));

        // Fetch qualifying results (only for this driver directly)
        const { data: qualResults } = await supabase
          .from("v2_qualifying_results" as any)
          .select(`position, car_number, best_time, gap_to_pole, extra_data, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        // Fetch practice results
        const { data: pracResults } = await supabase
          .from("v2_practice_results" as any)
          .select(`position, car_number, best_lap_time, gap_to_p1, extra_data, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        const qualRows = (qualResults || []).map((r: any) => mapResult(r, "qualifying"));
        const pracRows = (pracResults || []).map((r: any) => mapResult(r, "practice"));
        const allRows = [...uniqueRaceRows, ...qualRows, ...pracRows];
        setAllSessionResults(sortResults([...allRows]));

        // Build team alias map from v2_team_season_names, and class colours per season
        const seasonIds = new Set<string>();
        for (const r of allRows) {
          const sid = r.event?.v2_seasons?.id;
          if (sid) seasonIds.add(sid);
        }
        if (seasonIds.size > 0) {
          const [{ data: aliases }, colors] = await Promise.all([
            supabase.from("v2_team_season_names" as any).select("team_id, season_id, display_name").in("season_id", Array.from(seasonIds)),
            fetchSeasonClassColors(Array.from(seasonIds)),
          ]);
          const map: Record<string, string> = {};
          for (const a of (aliases || []) as any[]) {
            map[`${a.team_id}:${a.season_id}`] = a.display_name;
          }
          setTeamAliasMap(map);
          setClassColors(colors);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <ProfileLoading />;
  if (!driver) return <ProfileNotFound what="Driver" backTo="/search" backLabel="Back to search" />;

  const age = (() => {
    if (!driver.date_of_birth) return null;
    const b = new Date(driver.date_of_birth + "T00:00:00Z");
    const now = new Date();
    let a = now.getUTCFullYear() - b.getUTCFullYear();
    if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
    return Number.isFinite(a) ? a : null;
  })();

  const latest = raceHistory[0];
  const latestTeam = latest ? teamName(latest) : null;
  const latestClass = latest ? classInfo(latest).cls : null;
  const seasonLabel = selectedSeason === "all" ? "Career" : selectedSeason;
  const pct = (n: number) => (stats.starts > 0 ? `${Math.round((n / stats.starts) * 100)}% of starts` : undefined);

  const displayResults = showAllSessions ? allSessionResults : raceHistory;
  const resultsByYear: { year: string; rows: any[] }[] = [];
  for (const r of displayResults) {
    const y = String(r.event?.v2_seasons?.year ?? "—");
    const last = resultsByYear[resultsByYear.length - 1];
    if (last && last.year === y) last.rows.push(r);
    else resultsByYear.push({ year: y, rows: [r] });
  }

  const gain = stats.avgRace != null && stats.avgQual != null ? Math.round((stats.avgQual - stats.avgRace) * 10) / 10 : null;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={driver.full_name}
        description={`Motorsport profile for ${driver.full_name}${driver.nationality ? ` from ${driver.nationality}` : ""}. View race results and statistics.`}
        canonical={`/driver/${id}`}
      />
      <Header />

      <PageHeader
        kicker={
          <>
            <Link to="/search?tab=drivers" className="text-primary hover:underline">Driver</Link>
            {stats.years.length > 0 && selectedSeason === "all" && (
              <>
                <span>·</span>
                <span className="num normal-case tracking-normal">{yearSpan(stats.years)}</span>
              </>
            )}
            {latestClass && (
              <>
                <span>·</span>
                <ClassBadge name={latestClass} color={getClassColor(latestClass, classColors[latest?.event?.v2_seasons?.id])} />
              </>
            )}
          </>
        }
        title={driver.full_name}
        meta={
          <>
            {driver.nationality && (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <FlagImage nationality={driver.nationality} size={18} /> {driver.nationality}
              </span>
            )}
            {driver.date_of_birth && (
              <span>
                Born <span className="num text-foreground">{fmtDate(driver.date_of_birth)}</span>
                {age != null && <span className="num"> · {age} yrs</span>}
              </span>
            )}
            {latest?.v2_teams && (
              <span>
                Latest{" "}
                <Link to={`/team/${latest.v2_teams.id}`} className="font-medium text-foreground hover:text-primary">
                  {latestTeam}
                </Link>
              </span>
            )}
          </>
        }
        actions={
          <>
            <ShareButton title={`${driver.full_name} · Track Records`} text={`${driver.full_name}'s racing record`} />
            <ReportDialog reportType="driver" targetId={driver.id} targetName={driver.full_name} />
          </>
        }
      >
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="label-caps">{seasonLabel} record · race results</div>
            {seasonYears.length > 0 && (
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="h-8 w-[130px] rounded bg-card font-display text-xs font-semibold uppercase tracking-[0.12em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All seasons</SelectItem>
                  {seasonYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <StatStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Starts" value={stats.starts} sub={stats.starts ? `${stats.finishes} classified${stats.dnfs ? ` · ${stats.dnfs} DNF` : ""}` : "No race starts"} />
            <Stat label={stats.classAware ? "Class wins" : "Wins"} value={stats.wins} accent={stats.wins > 0} sub={pct(stats.wins)} />
            <Stat label={stats.classAware ? "Class podiums" : "Podiums"} value={stats.podiums} sub={pct(stats.podiums)} />
            <Stat
              label="Best finish"
              value={stats.best ? `P${stats.best.classPos}` : "—"}
              sub={
                stats.best
                  ? stats.bestCount > 1
                    ? `${stats.bestCount} times`
                    : `${stats.best.cls ? `${stats.best.cls} · ` : ""}${stats.best.r.event?.name ?? ""}`
                  : undefined
              }
            />
            <Stat
              label="Avg finish"
              value={stats.avgRace != null ? stats.avgRace.toFixed(1) : "—"}
              sub={
                stats.avgRace != null ? (
                  <>
                    {stats.classAware ? "in class" : "overall"} · {stats.raceCount} result{stats.raceCount !== 1 ? "s" : ""}
                    {gain != null && gain !== 0 && (
                      <span className={cn("num ml-1", gain > 0 ? "text-pb" : "text-dnf")}>
                        {gain > 0 ? "▲" : "▼"}
                        {Math.abs(gain)}
                      </span>
                    )}
                  </>
                ) : undefined
              }
            />
            <Stat
              label="Avg qualifying"
              value={stats.avgQual != null ? stats.avgQual.toFixed(1) : "—"}
              sub={stats.avgQual != null ? `${stats.qualCount} session${stats.qualCount !== 1 ? "s" : ""}` : "No qualifying data"}
            />
          </StatStrip>
        </div>
      </PageHeader>

      <main className="container py-10 md:py-12">
        {/* ── Fingerprint ─────────────────────────────────────── */}
        <section>
          <SectionHeader
            kicker={fingerprint?.events_included ? `Beta · from ${fingerprint.events_included} events` : "Beta"}
            title="Driver fingerprint"
            right={
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="flex shrink-0 items-center gap-1 label-caps transition-colors hover:text-foreground">
                      <HelpCircle className="h-3.5 w-3.5" /> How it works
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[260px] text-xs">
                    Performance metrics calculated from positional data across all sessions — no AI or subjective judgment involved.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
          />
          <DriverFingerprint data={fingerprint} standingsData={standingsData} />
        </section>

        {/* ── Career record ───────────────────────────────────── */}
        {stats.starts > 0 && (
          <section className="mt-12">
            <SectionHeader kicker={`${seasonLabel} · by starts`} title="Teams, cars & classes" />
            <div className="grid gap-px overflow-hidden rounded border bg-border md:grid-cols-3">
              <CountList
                title="Teams"
                items={stats.teams.map(({ item, count }) => ({
                  key: item.id,
                  label: (
                    <Link to={`/team/${item.id}`} className="font-medium hover:text-primary">
                      {item.name}
                    </Link>
                  ),
                  count,
                }))}
              />
              <CountList
                title="Cars"
                items={stats.cars.map(({ item, count }) => ({
                  key: item.id,
                  label: (
                    <Link to={`/car/${item.id}`} className="font-medium hover:text-primary">
                      {item.name}
                    </Link>
                  ),
                  count,
                }))}
              />
              <CountList
                title="Classes & series"
                items={[
                  ...stats.classes.map(({ item, count }) => ({
                    key: `c-${item.name}`,
                    label: <ClassBadge name={item.name} color={getClassColor(item.name, classColors[item.seasonId])} />,
                    count,
                  })),
                  ...stats.series.map(({ item, count }) => ({ key: `s-${item.name}`, label: <span className="text-muted-foreground">{item.name}</span>, count })),
                ]}
              />
            </div>
          </section>
        )}

        {/* ── Results ─────────────────────────────────────────── */}
        <section className="mt-12">
          <SectionHeader
            kicker={`${displayResults.length} ${showAllSessions ? "sessions" : "races"}`}
            title={showAllSessions ? "All session results" : "Race results"}
            right={
              <div className="flex shrink-0 overflow-hidden rounded border font-display text-xs font-semibold uppercase tracking-[0.12em]">
                {[
                  { v: false, l: "Races" },
                  { v: true, l: "All sessions" },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    onClick={() => setShowAllSessions(o.v)}
                    aria-pressed={showAllSessions === o.v}
                    className={cn(
                      "h-8 px-3 transition-colors",
                      showAllSessions === o.v ? "bg-signal text-signal-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            }
          />

          {displayResults.length === 0 ? (
            <EmptyState title={`No ${showAllSessions ? "session" : "race"} results`}>
              We don't have {showAllSessions ? "session" : "race"} results for this driver yet.
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded border bg-card">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="hidden w-[7.5rem] sm:table-cell">Date</th>
                      <th>Event</th>
                      {showAllSessions && <th className="hidden sm:table-cell">Session</th>}
                      <th className="hidden md:table-cell">Team</th>
                      <th className="hidden lg:table-cell">Car</th>
                      <th>Class</th>
                      <th className="text-center">Pos</th>
                      <th className="hidden text-right sm:table-cell">{showAllSessions ? "Time / Gap" : "Status"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultsByYear.map((g) => (
                      <Fragment key={g.year}>
                        <tr className="hover:bg-transparent">
                          <td colSpan={8} className="!h-8 bg-muted/50">
                            <span className="label-caps text-foreground">
                              <span className="num">{g.year}</span>
                            </span>
                            <span className="label-caps ml-2">
                              · {g.rows.length} {showAllSessions ? "sessions" : g.rows.length === 1 ? "race" : "races"}
                            </span>
                          </td>
                        </tr>
                        {g.rows.map((r: any, i: number) => {
                          const ci = classInfo(r);
                          const tName = teamName(r);
                          const cName = carName(r);
                          const date = fmtDate(r.session?.date) || (r.event?.start_date ? formatDateRange(r.event.start_date, r.event.end_date) : "—");
                          return (
                            <tr key={r.id || `${r._source}-${g.year}-${i}`}>
                              <td className="num hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{date}</td>
                              <td className="py-2 sm:min-w-[11rem]">
                                {r.event ? (
                                  <Link to={`/events/${r.event.id}`} className="font-medium leading-snug hover:text-primary">
                                    {r.event.name}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                                <div className="text-xs leading-snug text-muted-foreground">
                                  <span className="num whitespace-nowrap sm:hidden">{date} · </span>
                                  {r.event?.v2_seasons?.v2_series?.short_name || r.event?.v2_seasons?.v2_series?.name}
                                  {showAllSessions && r.session?.name && <span className="sm:hidden"> · {r.session.name}</span>}
                                  {tName && <span className="md:hidden"> · {tName}</span>}
                                  {r._source !== "race" && (r.best_time || r.best_lap_time) && (
                                    <span className="num sm:hidden"> · {r.best_time || r.best_lap_time}</span>
                                  )}
                                </div>
                              </td>
                              {showAllSessions && <td className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{r.session?.name || "—"}</td>}
                              <td className="hidden md:table-cell">
                                {r.v2_teams ? (
                                  <Link to={`/team/${r.v2_teams.id}`} className="hover:text-primary">
                                    {tName}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                                {r.v2_cars ? (
                                  <Link to={`/car/${r.v2_cars.id}`} className="hover:text-foreground">
                                    {cName}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                                {r.car_number && <span className="num ml-2 text-xs">#{r.car_number}</span>}
                              </td>
                              <td>
                                {ci.cls ? (
                                  <ClassBadge name={ci.cls} color={getClassColor(ci.cls, classColors[r.event?.v2_seasons?.id])} />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="text-center">
                                <div className="inline-flex flex-col items-center">
                                  <Pos value={ci.classPos} />
                                  {ci.cls && ci.overall != null && ci.overall !== ci.classPos && (
                                    <span className="num mt-0.5 whitespace-nowrap text-[10px] leading-none text-muted-foreground">P{ci.overall} OA</span>
                                  )}
                                  {r._source === "race" && r.status && r.status !== "finished" && (
                                    <span className="mt-0.5 sm:hidden">
                                      <StatusCell status={r.status} />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="hidden whitespace-nowrap text-right sm:table-cell">
                                {r._source === "race" ? (
                                  <StatusCell status={r.status} />
                                ) : (
                                  <span className="num text-xs text-muted-foreground">{r.best_time || r.best_lap_time || r.gap_to_pole || r.gap_to_p1 || "—"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <ReportStrip reportType="driver" targetId={id!} targetName={driver.full_name} noun="driver" />
      </main>
      <Footer />
    </div>
  );
};

export default DriverProfilePage;
