import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Merge, XCircle, Check, Sprout } from "lucide-react";

interface TeamProfile {
  id: string;
  name: string;
  nationality: string | null;
  primary_category: string | null;
  bio: string | null;
  logo_url: string | null;
  website: string | null;
}

interface DuplicateGroup {
  key: string;
  teams: (TeamProfile & { entryCount: number })[];
}

interface DismissedPair {
  team_id_1: string;
  team_id_2: string;
}

interface TeamDuplicatesTabProps {
  onRefresh: () => void;
  onGroupCountChange?: (count: number) => void;
}

function makePairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[-_\\s]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return true;
  // One contains the other (handles "Racing Team ABC" vs "ABC")
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export default function TeamDuplicatesTab({ onRefresh, onGroupCountChange }: TeamDuplicatesTabProps) {
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamProfile[]>([]);
  const [dismissed, setDismissed] = useState<DismissedPair[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [primaryOverrides, setPrimaryOverrides] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchTeams(), fetchDismissed(), fetchEntryCounts()]);
    setLoading(false);
  };

  const fetchTeams = async () => {
    const { data } = await supabase.from("team_profiles" as any).select("*").order("name");
    if (data) setTeams(data as any[]);
  };

  const fetchDismissed = async () => {
    const { data } = await supabase.from("dismissed_team_duplicates" as any).select("team_id_1, team_id_2");
    if (data) setDismissed(data as any[]);
  };

  const fetchEntryCounts = async () => {
    const { data } = await supabase.from("race_entries").select("team_profile_id");
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        if (row.team_profile_id) counts[row.team_profile_id] = (counts[row.team_profile_id] || 0) + 1;
      }
      setEntryCounts(counts);
    }
  };

  const dismissedSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of dismissed) s.add(makePairKey(d.team_id_1, d.team_id_2));
    return s;
  }, [dismissed]);

  const groups = useMemo(() => {
    // Build groups using fuzzy name matching (not just exact normalized match)
    const used = new Set<number>();
    const result: DuplicateGroup[] = [];

    for (let i = 0; i < teams.length; i++) {
      if (used.has(i)) continue;
      const cluster: TeamProfile[] = [teams[i]];
      used.add(i);

      for (let j = i + 1; j < teams.length; j++) {
        if (used.has(j)) continue;
        const matches = cluster.some(c => namesAreSimilar(c.name, teams[j].name));
        if (matches) {
          cluster.push(teams[j]);
          used.add(j);
        }
      }

      if (cluster.length < 2) continue;
      let hasUndismissed = false;
      for (let a = 0; a < cluster.length && !hasUndismissed; a++) {
        for (let b = a + 1; b < cluster.length && !hasUndismissed; b++) {
          if (!dismissedSet.has(makePairKey(cluster[a].id, cluster[b].id))) hasUndismissed = true;
        }
      }
      if (!hasUndismissed) continue;
      const key = cluster.map(t => t.id).sort().join("|");
      result.push({ key, teams: cluster.map(t => ({ ...t, entryCount: entryCounts[t.id] || 0 })) });
    }
    return result;
  }, [teams, dismissedSet, entryCounts]);

  useEffect(() => {
    onGroupCountChange?.(groups.length);
  }, [groups.length, onGroupCountChange]);

  const pickPrimary = (group: DuplicateGroup): string => {
    if (primaryOverrides[group.key]) return primaryOverrides[group.key];
    const sorted = [...group.teams].sort((a, b) => {
      if (a.entryCount !== b.entryCount) return b.entryCount - a.entryCount;
      const aFields = [a.nationality, a.bio, a.logo_url, a.website].filter(Boolean).length;
      const bFields = [b.nationality, b.bio, b.logo_url, b.website].filter(Boolean).length;
      return bFields - aFields;
    });
    return sorted[0].id;
  };

  const handleMerge = async (group: DuplicateGroup) => {
    const primaryId = pickPrimary(group);
    const secondaryIds = group.teams.filter(t => t.id !== primaryId).map(t => t.id);
    const primary = group.teams.find(t => t.id === primaryId)!;

    setMerging(group.key);
    try {
      for (const secId of secondaryIds) {
        await supabase.from("race_entries").update({ team_profile_id: primaryId } as any).eq("team_profile_id", secId);
        const secondary = group.teams.find(t => t.id === secId)!;
        const updates: Record<string, any> = {};
        for (const field of ["nationality", "bio", "logo_url", "website"] as (keyof TeamProfile)[]) {
          if (!primary[field] && secondary[field]) updates[field] = secondary[field];
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("team_profiles" as any).update(updates).eq("id", primaryId);
        }
        await supabase.from("team_profiles" as any).delete().eq("id", secId);
      }
      toast({ title: "Teams merged", description: `Kept "${primary.name}", merged ${secondaryIds.length} duplicate(s).` });
      onRefresh();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Merge failed", description: err.message, variant: "destructive" });
    }
    setMerging(null);
  };

  const handleDismiss = async (group: DuplicateGroup) => {
    setDismissing(group.key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const pairs: any[] = [];
      for (let i = 0; i < group.teams.length; i++) {
        for (let j = i + 1; j < group.teams.length; j++) {
          const [id1, id2] = [group.teams[i].id, group.teams[j].id].sort();
          if (!dismissedSet.has(makePairKey(id1, id2))) {
            pairs.push({ team_id_1: id1, team_id_2: id2, dismissed_by: session?.user?.id || null });
          }
        }
      }
      if (pairs.length > 0) await supabase.from("dismissed_team_duplicates" as any).insert(pairs);
      toast({ title: "Marked as not duplicates" });
      fetchDismissed();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDismissing(null);
  };

  const handleSeedTeams = async () => {
    setSeeding(true);
    try {
      // Fetch all entries with team_name but no team_profile_id
      let allEntries: any[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase.from("race_entries").select("id, team_name").not("team_name", "is", null).is("team_profile_id", null).range(offset, offset + 999);
        if (!data || data.length === 0) break;
        allEntries = allEntries.concat(data);
        if (data.length < 1000) break;
        offset += 1000;
      }

      if (allEntries.length === 0) {
        toast({ title: "No unlinked teams found", description: "All entries already have team profiles linked." });
        setSeeding(false);
        return;
      }

      // Group by normalized name, pick most common casing
      const nameMap = new Map<string, { name: string; count: number; entryIds: string[] }>();
      for (const entry of allEntries) {
        const norm = normalizeTeamName(entry.team_name);
        if (!norm) continue;
        const existing = nameMap.get(norm);
        if (!existing) {
          nameMap.set(norm, { name: entry.team_name, count: 1, entryIds: [entry.id] });
        } else {
          existing.entryIds.push(entry.id);
          existing.count++;
          // Keep the most common casing (approximation: longer = more detailed)
          if (entry.team_name.length > existing.name.length) existing.name = entry.team_name;
        }
      }

      // Also fetch existing teams to avoid re-creating
      const { data: existingTeams } = await supabase.from("team_profiles" as any).select("id, name") as any;
      const existingMap = new Map<string, string>();
      for (const t of (existingTeams || [])) {
        existingMap.set(normalizeTeamName(t.name), t.id);
      }

      let created = 0;
      let linked = 0;
      for (const [norm, info] of nameMap) {
        let teamId = existingMap.get(norm);
        if (!teamId) {
          const { data: newTeam } = await supabase.from("team_profiles" as any).insert({ name: info.name } as any).select("id").single() as any;
          if (newTeam) { teamId = newTeam.id; created++; }
        }
        if (teamId) {
          // Update entries in batches
          for (let i = 0; i < info.entryIds.length; i += 100) {
            const batch = info.entryIds.slice(i, i + 100);
            await supabase.from("race_entries").update({ team_profile_id: teamId } as any).in("id", batch);
          }
          linked += info.entryIds.length;
        }
      }

      toast({ title: "Teams seeded!", description: `Created ${created} team profiles, linked ${linked} entries.` });
      onRefresh();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    }
    setSeeding(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Seed Teams section */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-card-foreground">Seed Teams from Results</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auto-create team profiles from existing race entry team names and link them.
            </p>
          </div>
          <Button size="sm" onClick={handleSeedTeams} disabled={seeding} className="gap-1.5">
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
            {seeding ? "Seeding…" : "Seed Teams"}
          </Button>
        </div>
      </div>

      {/* Duplicates */}
      {teams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No team profiles exist yet. Use "Seed Teams" above to create them from race results.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <Check className="h-12 w-12 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium text-foreground">No team duplicates detected</p>
          <p className="text-sm text-muted-foreground mt-1">All {teams.length} team profiles look unique.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{groups.length} potential duplicate group{groups.length !== 1 ? "s" : ""} found.</p>
          {groups.map(group => {
            const primaryId = pickPrimary(group);
            const isMerging = merging === group.key;
            const isDismissing = dismissing === group.key;

            return (
              <div key={group.key} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-4 mb-4">
                  {group.teams.map(team => {
                    const isPrimary = team.id === primaryId;
                    return (
                      <div
                        key={team.id}
                        className={`flex-1 min-w-[200px] rounded-lg border p-3 cursor-pointer transition-colors ${isPrimary ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                        onClick={() => setPrimaryOverrides(prev => ({ ...prev, [group.key]: team.id }))}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {isPrimary && <Badge className="text-[10px]">Keep</Badge>}
                        </div>
                        <p className="font-medium text-foreground">{team.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{team.entryCount} race entr{team.entryCount === 1 ? "y" : "ies"}</p>
                        {team.nationality && <p className="text-xs text-muted-foreground">{team.nationality}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleMerge(group)} disabled={isMerging || isDismissing}>
                    {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
                    Merge (keep "{group.teams.find(t => t.id === primaryId)?.name}")
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDismiss(group)} disabled={isMerging || isDismissing}>
                    {isDismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                    Not Duplicates
                  </Button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
