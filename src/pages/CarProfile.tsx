/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { ClassBadge, EmptyState, PageHeader, SectionHeader, Stat, StatStrip } from "@/components/tr/primitives";
import {
  CountList,
  DriverTallyTable,
  EntriesTable,
  ProfileLoading,
  ProfileNotFound,
  ShareButton,
  buildEntries,
  driverTallies,
  entryStats,
  yearSpan,
} from "@/components/profile-kit";
import { fetchSeasonClassColors } from "@/lib/race-data";
import { getClassColor, sortClasses } from "@/lib/classes";

const CarProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [car, setCar] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [teamAliasMap, setTeamAliasMap] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: c } = await supabase.from("v2_cars").select("*").eq("id", id).single();
      setCar(c);

      if (c) {
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select(
            "position, status, car_number, session_id, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name), v2_sessions(id, name, session_type, event_id, date, parent_session_id, v2_events(id, name, start_date, end_date, v2_seasons(id, year, v2_series(id, name, short_name)), v2_circuits(name, country)))",
          )
          .eq("car_id", id)
          .order("created_at", { ascending: false })
          .limit(1000);

        const results = (raceResults || []) as any[];
        setRaceHistory(results);

        // Build team alias map + class colours
        const seasonIds = [...new Set(results.map((r) => r.v2_sessions?.v2_events?.v2_seasons?.id).filter(Boolean))] as string[];
        if (seasonIds.length > 0) {
          const [{ data: aliases }, colors] = await Promise.all([
            supabase.from("v2_team_season_names" as any).select("team_id, season_id, display_name").in("season_id", seasonIds),
            fetchSeasonClassColors(seasonIds),
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

  const entries = useMemo(() => buildEntries(raceHistory, teamAliasMap), [raceHistory, teamAliasMap]);
  const stats = useMemo(() => entryStats(entries), [entries]);
  const drivers = useMemo(() => driverTallies(entries), [entries]);
  const side = useMemo(() => {
    const teams = new Map<string, { id: string; name: string; n: number; wins: number }>();
    for (const e of entries) {
      if (!e.team) continue;
      const t = teams.get(e.team.id) ?? { ...e.team, n: 0, wins: 0 };
      t.n++;
      if (e.classified && e.classPos === 1) t.wins++;
      teams.set(e.team.id, t);
    }
    const classes = new Map<string, { n: number; seasonId?: string }>();
    for (const e of entries) if (e.cls) classes.set(e.cls, { n: (classes.get(e.cls)?.n || 0) + 1, seasonId: e.seasonId });
    const series = new Map<string, { name: string; n: number }>();
    for (const e of entries) {
      const s = e.event?.v2_seasons?.v2_series;
      if (s) series.set(s.id, { name: s.name, n: (series.get(s.id)?.n || 0) + 1 });
    }
    return {
      teams: [...teams.values()].sort((a, b) => b.n - a.n),
      classes: [...classes.entries()].sort((a, b) => sortClasses(a[0], b[0])).map(([c, v]) => ({ c, ...v })),
      series: [...series.entries()].map(([sid, v]) => ({ id: sid, ...v })),
    };
  }, [entries]);

  if (loading) return <ProfileLoading />;
  if (!car) return <ProfileNotFound what="Car" backTo="/cars" backLabel="Back to cars" />;

  const displayName = [car.manufacturer, car.model_name].filter(Boolean).join(" ");
  const pct = (n: number) => (stats.starts > 0 ? `${Math.round((n / stats.starts) * 100)}% of entries` : undefined);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={displayName} description={`Car profile for ${displayName}. View race history and results.`} canonical={`/car/${id}`} />
      <Header />

      <PageHeader
        kicker={
          <>
            <Link to="/cars" className="text-primary hover:underline">
              Car
            </Link>
            {car.manufacturer && (
              <>
                <span>·</span>
                <span>{car.manufacturer}</span>
              </>
            )}
            {side.classes.map((c) => (
              <ClassBadge key={c.c} name={c.c} color={getClassColor(c.c, c.seasonId ? classColors[c.seasonId] : undefined)} />
            ))}
          </>
        }
        title={displayName}
        meta={
          <>
            {side.series.map((s) => (
              <span key={s.id}>{s.name}</span>
            ))}
            {stats.years.length > 0 && <span className="num">{yearSpan(stats.years)}</span>}
          </>
        }
        actions={
          <>
            <ShareButton title={`${displayName} · Track Records`} />
          </>
        }
      >
        <StatStrip className="mt-7 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Entries" value={stats.starts} sub={`${stats.events} event${stats.events !== 1 ? "s" : ""}${stats.dnfs ? ` · ${stats.dnfs} DNF` : ""}`} />
          <Stat label={stats.classAware ? "Class wins" : "Wins"} value={stats.wins} accent={stats.wins > 0} sub={pct(stats.wins)} />
          <Stat label={stats.classAware ? "Class podiums" : "Podiums"} value={stats.podiums} sub={pct(stats.podiums)} />
          <Stat
            label="Best finish"
            value={stats.best ? `P${stats.best.classPos}` : "—"}
            sub={stats.best ? (stats.bestCount > 1 ? `${stats.bestCount} times` : stats.best.event?.name) : undefined}
          />
          <Stat label="Teams" value={side.teams.length} sub="ran this car" />
          <Stat label="Drivers" value={drivers.length} sub={stats.years.length ? yearSpan(stats.years) : undefined} />
        </StatStrip>
      </PageHeader>

      <main className="container py-10 md:py-12">
        {entries.length === 0 ? (
          <EmptyState title="No race results">We don't have race results for this car yet.</EmptyState>
        ) : (
          <>
            <div className="grid items-start gap-8 lg:grid-cols-[300px_1fr]">
              <section className="min-w-0">
                <SectionHeader kicker="Entrants" title="Teams" />
                <div className="grid gap-px overflow-hidden rounded border bg-border">
                  <CountList
                    title="Team · entries"
                    items={side.teams.map((t) => ({
                      key: t.id,
                      label: (
                        <Link to={`/team/${t.id}`} className="font-medium hover:text-primary">
                          {t.name}
                        </Link>
                      ),
                      sub: t.wins > 0 ? `${t.wins} class win${t.wins !== 1 ? "s" : ""}` : undefined,
                      count: t.n,
                    }))}
                  />
                </div>
              </section>
              <section className="min-w-0">
                <SectionHeader kicker={`${drivers.length} drivers · by entries`} title="Drivers" />
                <DriverTallyTable tallies={drivers} classAware={stats.classAware} />
              </section>
            </div>

            <section className="mt-12">
              <SectionHeader kicker={`${entries.length} entries · one row per car`} title="Race results" />
              <EntriesTable entries={entries} other="team" classColors={classColors} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CarProfilePage;
