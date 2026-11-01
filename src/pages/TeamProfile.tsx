/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
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

const TeamProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [classColors, setClassColors] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: t } = await supabase.from("v2_teams").select("*").eq("id", id).single();
      setTeam(t);

      if (t) {
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select(
            "position, status, car_number, session_id, extra_data, v2_drivers(id, full_name, nationality), v2_cars(id, model_name, manufacturer), v2_sessions(id, name, session_type, event_id, date, parent_session_id, v2_events(id, name, start_date, end_date, v2_seasons(id, year, v2_series(id, name, short_name)), v2_circuits(name, country)))",
          )
          .eq("team_id", id)
          .order("created_at", { ascending: false })
          .limit(1000);

        const results = (raceResults || []) as any[];
        setRaceHistory(results);

        const seasonIds = [...new Set(results.map((r) => r.v2_sessions?.v2_events?.v2_seasons?.id).filter(Boolean))] as string[];
        if (seasonIds.length) setClassColors(await fetchSeasonClassColors(seasonIds));
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const entries = useMemo(() => buildEntries(raceHistory), [raceHistory]);
  const stats = useMemo(() => entryStats(entries), [entries]);
  const drivers = useMemo(() => driverTallies(entries), [entries]);
  const side = useMemo(() => {
    const count = (key: (e: (typeof entries)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const e of entries) {
        const k = key(e);
        if (k) m.set(k, (m.get(k) || 0) + 1);
      }
      return m;
    };
    const cars = new Map(entries.filter((e) => e.car).map((e) => [e.car!.id, e.car!]));
    const carCounts = count((e) => e.car?.id ?? null);
    const classCounts = count((e) => e.cls);
    const classSeason = new Map(entries.filter((e) => e.cls).map((e) => [e.cls!, e.seasonId]));
    const series = new Map(entries.map((e) => [e.event?.v2_seasons?.v2_series?.id, e.event?.v2_seasons?.v2_series?.name]));
    const seriesCounts = count((e) => e.event?.v2_seasons?.v2_series?.id ?? null);
    const numbers = [...new Set(entries.map((e) => e.carNumber).filter(Boolean))] as string[];
    return {
      cars: [...carCounts.entries()].sort((a, b) => b[1] - a[1]).map(([cid, n]) => ({ car: cars.get(cid)!, n })),
      classes: [...classCounts.entries()].sort((a, b) => sortClasses(a[0], b[0])).map(([c, n]) => ({ c, n, seasonId: classSeason.get(c) })),
      series: [...seriesCounts.entries()].map(([sid, n]) => ({ id: sid, name: series.get(sid) as string, n })),
      numbers: numbers.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    };
  }, [entries]);

  if (loading) return <ProfileLoading />;
  if (!team) return <ProfileNotFound what="Team" backTo="/teams" backLabel="Back to teams" />;

  const pct = (n: number) => (stats.starts > 0 ? `${Math.round((n / stats.starts) * 100)}% of entries` : undefined);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={team.full_name}
        description={`Motorsport team profile for ${team.full_name}. View race history and results.`}
        canonical={`/team/${id}`}
      />
      <Header />

      <PageHeader
        kicker={
          <>
            <Link to="/teams" className="text-primary hover:underline">
              Team
            </Link>
            {stats.years.length > 0 && (
              <>
                <span>·</span>
                <span className="num normal-case tracking-normal">{yearSpan(stats.years)}</span>
              </>
            )}
            {side.classes.map((c) => (
              <ClassBadge key={c.c} name={c.c} color={getClassColor(c.c, c.seasonId ? classColors[c.seasonId] : undefined)} />
            ))}
          </>
        }
        title={team.full_name}
        meta={
          <>
            {team.nationality && (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <FlagImage nationality={team.nationality} size={18} /> {team.nationality}
              </span>
            )}
            {side.series.map((s) => (
              <span key={s.id}>{s.name}</span>
            ))}
            {side.numbers.length > 0 && (
              <span>
                Car{side.numbers.length > 1 ? "s" : ""} <span className="num text-foreground">{side.numbers.map((n) => `#${n}`).join(" ")}</span>
              </span>
            )}
          </>
        }
        actions={
          <>
            <ShareButton title={`${team.full_name} · Track Records`} />
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
          <Stat label="Drivers" value={drivers.length} sub="raced for the team" />
          <Stat label="Seasons" value={stats.years.length || "—"} sub={stats.years.length ? yearSpan(stats.years) : undefined} />
        </StatStrip>
      </PageHeader>

      <main className="container py-10 md:py-12">
        {entries.length === 0 ? (
          <EmptyState title="No race results">We don't have race results for this team yet.</EmptyState>
        ) : (
          <>
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
              <section className="min-w-0">
                <SectionHeader kicker={`${drivers.length} drivers · by entries`} title="Drivers" />
                <DriverTallyTable tallies={drivers} classAware={stats.classAware} />
              </section>
              <section className="min-w-0">
                <SectionHeader kicker="Machinery" title="Cars & classes" />
                <div className="grid gap-px overflow-hidden rounded border bg-border">
                  <CountList
                    title="Cars"
                    items={side.cars.map(({ car, n }) => ({
                      key: car.id,
                      label: (
                        <Link to={`/car/${car.id}`} className="font-medium hover:text-primary">
                          {car.name}
                        </Link>
                      ),
                      count: n,
                    }))}
                  />
                  <CountList
                    title="Classes"
                    items={side.classes.map((c) => ({
                      key: c.c,
                      label: <ClassBadge name={c.c} color={getClassColor(c.c, c.seasonId ? classColors[c.seasonId] : undefined)} />,
                      count: c.n,
                    }))}
                  />
                </div>
              </section>
            </div>

            <section className="mt-12">
              <SectionHeader kicker={`${entries.length} entries · one row per car`} title="Race results" />
              <EntriesTable entries={entries} other="car" classColors={classColors} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default TeamProfilePage;
