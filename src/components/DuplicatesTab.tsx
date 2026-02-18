import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Merge, XCircle, Check } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;

interface DuplicateGroup {
  key: string;
  drivers: (DriverProfile & { entryCount: number })[];
}

interface DismissedPair {
  driver_id_1: string;
  driver_id_2: string;
}

interface DuplicatesTabProps {
  drivers: DriverProfile[];
  onRefresh: () => void;
  onGroupCountChange?: (count: number) => void;
}

function makePairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isAbbreviation(short: string, full: string): boolean {
  const s = short.replace(/\./g, "").toLowerCase().trim();
  const f = full.toLowerCase().trim();
  if (s.length === 0 || f.length === 0) return false;
  if (s.length >= f.length) return false;
  return f.startsWith(s);
}

function firstNamesMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().replace(/\./g, "").trim();
  const bl = b.toLowerCase().replace(/\./g, "").trim();
  if (al === bl) return true;
  if (isAbbreviation(al, bl) || isAbbreviation(bl, al)) return true;
  // Both start with same letter and one is single char
  if ((al.length <= 2 || bl.length <= 2) && al[0] === bl[0]) return true;
  return false;
}

export default function DuplicatesTab({ drivers, onRefresh, onGroupCountChange }: DuplicatesTabProps) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<DismissedPair[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [primaryOverrides, setPrimaryOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDismissed();
    fetchEntryCounts();
  }, []);

  const fetchDismissed = async () => {
    const { data } = await supabase.from("dismissed_duplicates" as any).select("driver_id_1, driver_id_2");
    if (data) setDismissed(data as any[]);
    setLoading(false);
  };

  const fetchEntryCounts = async () => {
    const { data } = await supabase.from("race_entry_drivers").select("driver_profile_id");
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.driver_profile_id] = (counts[row.driver_profile_id] || 0) + 1;
      }
      setEntryCounts(counts);
    }
  };

  const dismissedSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of dismissed) s.add(makePairKey(d.driver_id_1, d.driver_id_2));
    return s;
  }, [dismissed]);

  const groups = useMemo(() => {
    // Group by normalized last name
    const byLast = new Map<string, DriverProfile[]>();
    for (const d of drivers) {
      const key = d.last_name.toLowerCase().trim();
      if (!byLast.has(key)) byLast.set(key, []);
      byLast.get(key)!.push(d);
    }

    const result: DuplicateGroup[] = [];
    for (const [, group] of byLast) {
      if (group.length < 2) continue;

      // Find connected components of matching first names
      const visited = new Set<number>();
      for (let i = 0; i < group.length; i++) {
        if (visited.has(i)) continue;
        const cluster: DriverProfile[] = [group[i]];
        visited.add(i);
        for (let j = i + 1; j < group.length; j++) {
          if (visited.has(j)) continue;
          // Check if j matches any driver in cluster
          const matches = cluster.some(c => firstNamesMatch(c.first_name, group[j].first_name));
          if (matches) {
            cluster.push(group[j]);
            visited.add(j);
          }
        }
        if (cluster.length < 2) continue;

        // Filter out dismissed pairs - only show group if at least one non-dismissed pair exists
        let hasUndismissed = false;
        for (let a = 0; a < cluster.length && !hasUndismissed; a++) {
          for (let b = a + 1; b < cluster.length && !hasUndismissed; b++) {
            if (!dismissedSet.has(makePairKey(cluster[a].id, cluster[b].id))) {
              hasUndismissed = true;
            }
          }
        }
        if (!hasUndismissed) continue;

        const key = cluster.map(d => d.id).sort().join("|");
        result.push({
          key,
          drivers: cluster.map(d => ({ ...d, entryCount: entryCounts[d.id] || 0 })),
        });
      }
    }
    return result;
  }, [drivers, dismissedSet, entryCounts]);

  useEffect(() => {
    onGroupCountChange?.(groups.length);
  }, [groups.length, onGroupCountChange]);

  const pickPrimary = (group: DuplicateGroup): string => {
    if (primaryOverrides[group.key]) return primaryOverrides[group.key];
    // Prefer claimed, then most entries, then most data
    const sorted = [...group.drivers].sort((a, b) => {
      if (a.is_claimed !== b.is_claimed) return a.is_claimed ? -1 : 1;
      if (a.entryCount !== b.entryCount) return b.entryCount - a.entryCount;
      const aFields = [a.nationality, a.bio, a.photo_url, a.social_twitter, a.social_instagram].filter(Boolean).length;
      const bFields = [b.nationality, b.bio, b.photo_url, b.social_twitter, b.social_instagram].filter(Boolean).length;
      return bFields - aFields;
    });
    return sorted[0].id;
  };

  const handleMerge = async (group: DuplicateGroup) => {
    const primaryId = pickPrimary(group);
    const secondaryIds = group.drivers.filter(d => d.id !== primaryId).map(d => d.id);
    const primary = group.drivers.find(d => d.id === primaryId)!;

    setMerging(group.key);
    try {
      for (const secId of secondaryIds) {
        // Reassign race_entry_drivers
        await supabase.from("race_entry_drivers").update({ driver_profile_id: primaryId }).eq("driver_profile_id", secId);
        // Reassign race_results
        await supabase.from("race_results").update({ driver_profile_id: primaryId }).eq("driver_profile_id", secId);

        // Copy non-null fields from secondary to primary if primary is null
        const secondary = group.drivers.find(d => d.id === secId)!;
        const fieldsToMerge: (keyof DriverProfile)[] = [
          "nationality", "bio", "photo_url", "date_of_birth",
          "social_twitter", "social_instagram", "social_linkedin", "social_website",
          "license_type", "license_grade", "license_issuing_body",
        ];
        const updates: Record<string, any> = {};
        for (const field of fieldsToMerge) {
          if (!primary[field] && secondary[field]) {
            updates[field] = secondary[field];
          }
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("driver_profiles").update(updates).eq("id", primaryId);
        }

        // Delete secondary
        await supabase.from("driver_profiles").delete().eq("id", secId);
      }

      toast({ title: "Drivers merged", description: `Kept ${primary.first_name} ${primary.last_name}, merged ${secondaryIds.length} duplicate(s).` });
      onRefresh();
      fetchEntryCounts();
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
      for (let i = 0; i < group.drivers.length; i++) {
        for (let j = i + 1; j < group.drivers.length; j++) {
          const [id1, id2] = [group.drivers[i].id, group.drivers[j].id].sort();
          if (!dismissedSet.has(makePairKey(id1, id2))) {
            pairs.push({
              driver_id_1: id1,
              driver_id_2: id2,
              dismissed_by: session?.user?.id || null,
            });
          }
        }
      }
      if (pairs.length > 0) {
        await supabase.from("dismissed_duplicates" as any).insert(pairs);
      }
      toast({ title: "Marked as not duplicates" });
      fetchDismissed();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDismissing(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="h-12 w-12 text-primary mx-auto mb-3" />
        <p className="text-lg font-medium text-foreground">No duplicates detected</p>
        <p className="text-sm text-muted-foreground mt-1">All driver profiles look unique.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{groups.length} potential duplicate group{groups.length !== 1 ? "s" : ""} found.</p>
      {groups.map(group => {
        const primaryId = pickPrimary(group);
        const isMerging = merging === group.key;
        const isDismissing = dismissing === group.key;

        return (
          <div key={group.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-4 mb-4">
              {group.drivers.map(driver => {
                const isPrimary = driver.id === primaryId;
                return (
                  <div
                    key={driver.id}
                    className={`flex-1 min-w-[200px] rounded-lg border p-3 cursor-pointer transition-colors ${
                      isPrimary ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                    }`}
                    onClick={() => setPrimaryOverrides(prev => ({ ...prev, [group.key]: driver.id }))}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isPrimary && <Badge className="text-[10px]">Keep</Badge>}
                      {driver.is_claimed && <Badge variant="secondary" className="text-[10px]">Claimed</Badge>}
                    </div>
                    <p className="font-medium text-foreground">
                      {driver.first_name} {driver.last_name}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {driver.nationality && <FlagImage nationality={driver.nationality} size={16} />}
                      <span className="text-xs text-muted-foreground">{driver.nationality || "No nationality"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {driver.entryCount} race entr{driver.entryCount === 1 ? "y" : "ies"}
                    </p>
                    {driver.bio && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{driver.bio}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleMerge(group)}
                disabled={isMerging || isDismissing}
              >
                {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
                Merge (keep {group.drivers.find(d => d.id === primaryId)?.first_name})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDismiss(group)}
                disabled={isMerging || isDismissing}
              >
                {isDismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                Not Duplicates
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
