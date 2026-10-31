import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Merge, XCircle, Check } from "lucide-react";

interface CircuitProfile {
  id: string;
  name: string;
  country: string | null;
  location: string | null;
  description: string | null;
  length_km: number | null;
  turns: number | null;
  website: string | null;
  image_url: string | null;
}

interface DuplicateGroup {
  key: string;
  circuits: (CircuitProfile & { eventCount: number })[];
}

interface DismissedPair {
  circuit_id_1: string;
  circuit_id_2: string;
}

interface CircuitDuplicatesTabProps {
  onRefresh: () => void;
  onGroupCountChange?: (count: number) => void;
}

function makePairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizeCircuitName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(street circuit|circuit|raceway|speedway|motorsport park|international|grand prix|park|ring)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeCircuitName(a);
  const nb = normalizeCircuitName(b);
  if (na === nb) return true;
  // One contains the other (handles "Long Beach" vs "Long Beach Street Circuit")
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export default function CircuitDuplicatesTab({ onRefresh, onGroupCountChange }: CircuitDuplicatesTabProps) {
  const { toast } = useToast();
  const [circuits, setCircuits] = useState<CircuitProfile[]>([]);
  const [dismissed, setDismissed] = useState<DismissedPair[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [primaryOverrides, setPrimaryOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchCircuits(), fetchDismissed(), fetchEventCounts()]);
    setLoading(false);
  };

  const fetchCircuits = async () => {
    const { data } = await supabase.from("circuits").select("*").order("name");
    if (data) setCircuits(data as any[]);
  };

  const fetchDismissed = async () => {
    const { data } = await supabase.from("dismissed_circuit_duplicates" as any).select("circuit_id_1, circuit_id_2");
    if (data) setDismissed(data as any[]);
  };

  const fetchEventCounts = async () => {
    const { data } = await supabase.from("race_events").select("circuit_id");
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        if (row.circuit_id) counts[row.circuit_id] = (counts[row.circuit_id] || 0) + 1;
      }
      setEventCounts(counts);
    }
  };

  const dismissedSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of dismissed) s.add(makePairKey(d.circuit_id_1, d.circuit_id_2));
    return s;
  }, [dismissed]);

  const groups = useMemo(() => {
    // Build groups using fuzzy name matching
    const used = new Set<number>();
    const result: DuplicateGroup[] = [];

    for (let i = 0; i < circuits.length; i++) {
      if (used.has(i)) continue;
      const cluster: CircuitProfile[] = [circuits[i]];
      used.add(i);

      for (let j = i + 1; j < circuits.length; j++) {
        if (used.has(j)) continue;
        const matches = cluster.some(c => namesAreSimilar(c.name, circuits[j].name));
        if (matches) {
          cluster.push(circuits[j]);
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

      const key = cluster.map(c => c.id).sort().join("|");
      result.push({ key, circuits: cluster.map(c => ({ ...c, eventCount: eventCounts[c.id] || 0 })) });
    }
    return result;
  }, [circuits, dismissedSet, eventCounts]);

  useEffect(() => {
    onGroupCountChange?.(groups.length);
  }, [groups.length, onGroupCountChange]);

  const pickPrimary = (group: DuplicateGroup): string => {
    if (primaryOverrides[group.key]) return primaryOverrides[group.key];
    const sorted = [...group.circuits].sort((a, b) => {
      if (a.eventCount !== b.eventCount) return b.eventCount - a.eventCount;
      const aFields = [a.country, a.description, a.location, a.website, a.image_url].filter(Boolean).length;
      const bFields = [b.country, b.description, b.location, b.website, b.image_url].filter(Boolean).length;
      return bFields - aFields;
    });
    return sorted[0].id;
  };

  const handleMerge = async (group: DuplicateGroup) => {
    const primaryId = pickPrimary(group);
    const secondaryIds = group.circuits.filter(c => c.id !== primaryId).map(c => c.id);
    const primary = group.circuits.find(c => c.id === primaryId)!;

    setMerging(group.key);
    try {
      for (const secId of secondaryIds) {
        // Reassign race_events
        await supabase.from("race_events").update({ circuit_id: primaryId } as any).eq("circuit_id", secId);

        // Copy non-null fields
        const secondary = group.circuits.find(c => c.id === secId)!;
        const updates: Record<string, any> = {};
        for (const field of ["country", "location", "description", "length_km", "turns", "website", "image_url"] as (keyof CircuitProfile)[]) {
          if (!primary[field] && secondary[field]) updates[field] = secondary[field];
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("circuits").update(updates as any).eq("id", primaryId);
        }

        // Delete secondary
        await supabase.from("circuits").delete().eq("id", secId);
      }

      toast({ title: "Circuits merged", description: `Kept "${primary.name}", merged ${secondaryIds.length} duplicate(s).` });
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
      for (let i = 0; i < group.circuits.length; i++) {
        for (let j = i + 1; j < group.circuits.length; j++) {
          const [id1, id2] = [group.circuits[i].id, group.circuits[j].id].sort();
          if (!dismissedSet.has(makePairKey(id1, id2))) {
            pairs.push({ circuit_id_1: id1, circuit_id_2: id2, dismissed_by: session?.user?.id || null });
          }
        }
      }
      if (pairs.length > 0) await supabase.from("dismissed_circuit_duplicates" as any).insert(pairs);
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
      <div className="text-center py-8">
        <Check className="h-10 w-10 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">No circuit duplicates detected</p>
        <p className="text-xs text-muted-foreground mt-1">All {circuits.length} circuits look unique.</p>
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
              {group.circuits.map(circuit => {
                const isPrimary = circuit.id === primaryId;
                return (
                  <div
                    key={circuit.id}
                    className={`flex-1 min-w-[200px] rounded-lg border p-3 cursor-pointer transition-colors ${isPrimary ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                    onClick={() => setPrimaryOverrides(prev => ({ ...prev, [group.key]: circuit.id }))}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isPrimary && <Badge className="text-[10px]">Keep</Badge>}
                    </div>
                    <p className="font-medium text-foreground">{circuit.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{circuit.eventCount} event{circuit.eventCount === 1 ? "" : "s"} linked</p>
                    {circuit.country && <p className="text-xs text-muted-foreground">{circuit.country}</p>}
                    {circuit.location && <p className="text-xs text-muted-foreground">{circuit.location}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleMerge(group)} disabled={isMerging || isDismissing}>
                {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
                Merge (keep "{group.circuits.find(c => c.id === primaryId)?.name}")
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDismiss(group)} disabled={isMerging || isDismissing}>
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
