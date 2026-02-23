import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Merge, XCircle, Check, AlertTriangle, ExternalLink, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import FlagImage from "@/components/FlagImage";

// ─── Duplicate Detection Helpers ───

function makePairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ─── Data Quality Issue Types ───

interface DataIssue {
  id: string;
  type: "missing_reason" | "missing_driver" | "missing_team" | "missing_car" | "missing_nationality" | "missing_position";
  severity: "warning" | "error";
  title: string;
  description: string;
  linkTo?: string;
  linkLabel?: string;
  autoFixable?: boolean;
  autoFixLabel?: string;
  sessionId?: string;
  resultId?: string;
}

// ─── Duplicate Group Types ───

interface DuplicateGroup {
  key: string;
  entityType: "driver" | "team" | "circuit" | "car";
  items: { id: string; label: string; detail?: string; usageCount: number }[];
}

export default function ManagePotentialIssues() {
  const [activeTab, setActiveTab] = useState("quality");

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Potential Issues</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
        </TabsList>
        <TabsContent value="quality"><DataQualitySection /></TabsContent>
        <TabsContent value="duplicates"><DuplicatesSection /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Data Quality Section ───

function DataQualitySection() {
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);
  const [bulkFixing, setBulkFixing] = useState(false);
  const [aiResolving, setAiResolving] = useState(false);
  useEffect(() => { scanForIssues(); }, []);

  const scanForIssues = async () => {
    setLoading(true);
    const found: DataIssue[] = [];

    // 1. Race results with DNF/DSQ but no reason — exclude endurance hourly sub-sessions
    const { data: badResults } = await supabase
      .from("v2_race_results" as any)
      .select("id, status, dnf_reason, session_id, car_number, position, v2_sessions(id, name, event_id, parent_session_id, v2_events(id, name))")
      .in("status", ["dnf", "dsq"])
      .or("dnf_reason.is.null,dnf_reason.eq.");

    for (const r of (badResults || []) as any[]) {
      const sess = r.v2_sessions;
      if (sess?.parent_session_id) continue;
      const evt = sess?.v2_events;
      found.push({
        id: `reason-${r.id}`,
        type: "missing_reason",
        severity: "warning",
        title: `${(r.status as string).toUpperCase()} without reason — P${r.position || "?"} #${r.car_number || "?"}`,
        description: `${evt?.name || "Unknown event"} → ${sess?.name || "Unknown session"}`,
        linkTo: evt && sess ? `/manage/events/${evt.id}/session/${sess.id}` : undefined,
        linkLabel: "Edit Session",
      });
    }

    // 2. Drivers missing nationality
    const { data: driversNoNat } = await supabase
      .from("v2_drivers")
      .select("id, full_name")
      .is("nationality", null)
      .limit(50);

    for (const d of (driversNoNat || [])) {
      found.push({
        id: `nat-${d.id}`,
        type: "missing_nationality",
        severity: "warning",
        title: `Driver missing nationality: ${d.full_name}`,
        description: "Consider using Enrich Missing on the Drivers page.",
        linkTo: "/manage/drivers",
        linkLabel: "Manage Drivers",
      });
    }

    // 3. Race results with no driver
    const { data: noDriverResults } = await supabase
      .from("v2_race_results" as any)
      .select("id, position, car_number, session_id, v2_sessions(id, name, event_id, parent_session_id, v2_events(id, name))")
      .is("driver_id", null)
      .limit(50);

    for (const r of (noDriverResults || []) as any[]) {
      const sess = r.v2_sessions;
      const evt = sess?.v2_events;
      found.push({
        id: `nodriver-${r.id}`,
        type: "missing_driver",
        severity: "error",
        title: `Race result missing driver — P${r.position || "?"} #${r.car_number || "?"}`,
        description: `${evt?.name || "Unknown event"} → ${sess?.name || "Unknown session"}`,
        linkTo: evt && sess ? `/manage/events/${evt.id}/session/${sess.id}` : undefined,
        linkLabel: "Edit Session",
      });
    }

    // 4. Race results with no position — exclude hourly sub-sessions, auto-fixable
    const { data: noPosResults } = await supabase
      .from("v2_race_results" as any)
      .select("id, car_number, session_id, driver_id, status, v2_sessions(id, name, event_id, parent_session_id, v2_events(id, name))")
      .is("position", null)
      .limit(200);

    for (const r of (noPosResults || []) as any[]) {
      const sess = r.v2_sessions;
      if (sess?.parent_session_id) continue;
      const evt = sess?.v2_events;
      found.push({
        id: `nopos-${r.id}`,
        type: "missing_position",
        severity: "warning",
        title: `Race result missing position — #${r.car_number || "?"}`,
        description: `${evt?.name || "Unknown event"} → ${sess?.name || "Unknown session"}`,
        linkTo: evt && sess ? `/manage/events/${evt.id}/session/${sess.id}` : undefined,
        linkLabel: "Edit Session",
        autoFixable: true,
        autoFixLabel: "Auto-assign position",
        sessionId: sess?.id,
        resultId: r.id,
      });
    }

    setIssues(found);
    setLoading(false);
  };

  // Auto-fix: for a session, order all results by existing position (nulls last),
  // then assign sequential positions to the ones missing them.
  const fixPositionsForSession = async (sessionId: string): Promise<number> => {
    const { data: allResults } = await supabase
      .from("v2_race_results" as any)
      .select("id, position")
      .eq("session_id", sessionId)
      .order("position", { ascending: true, nullsFirst: false });

    if (!allResults || allResults.length === 0) return 0;

    // Build ordered list: positioned first (sorted), then unpositioned in their existing order
    const positioned = (allResults as any[]).filter(r => r.position != null).sort((a, b) => a.position - b.position);
    const unpositioned = (allResults as any[]).filter(r => r.position == null);
    if (unpositioned.length === 0) return 0;

    // Find the max existing position, assign sequentially after it
    const maxPos = positioned.length > 0 ? Math.max(...positioned.map(r => r.position)) : 0;
    let nextPos = maxPos + 1;
    let fixed = 0;

    for (const r of unpositioned) {
      await supabase.from("v2_race_results" as any).update({ position: nextPos }).eq("id", (r as any).id);
      nextPos++;
      fixed++;
    }
    return fixed;
  };

  const handleFixOne = async (issue: DataIssue) => {
    if (!issue.sessionId) return;
    setFixing(issue.id);
    try {
      const count = await fixPositionsForSession(issue.sessionId);
      toast.success(`Assigned ${count} position${count !== 1 ? "s" : ""}`);
      scanForIssues();
    } catch (e: any) {
      toast.error(e.message);
    }
    setFixing(null);
  };

  const handleAiResolveReasons = async () => {
    setAiResolving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-dnf-reasons`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed");
      const parts: string[] = [];
      if (result.resolved > 0) parts.push(`${result.resolved} resolved`);
      if (result.skippedLow > 0) parts.push(`${result.skippedLow} skipped (low confidence)`);
      toast.success(`AI Resolve: ${parts.join(", ") || "Nothing to resolve"}`);
      scanForIssues();
    } catch (e: any) {
      toast.error(`AI resolve failed: ${e.message}`);
    }
    setAiResolving(false);
  };

  const handleFixAll = async () => {
    const fixable = issues.filter(i => i.autoFixable && i.sessionId);
    if (fixable.length === 0) return;
    setBulkFixing(true);
    try {
      // Deduplicate by session
      const sessionIds = [...new Set(fixable.map(i => i.sessionId!))];
      let totalFixed = 0;
      for (const sid of sessionIds) {
        totalFixed += await fixPositionsForSession(sid);
      }
      toast.success(`Auto-fixed ${totalFixed} position${totalFixed !== 1 ? "s" : ""} across ${sessionIds.length} session${sessionIds.length !== 1 ? "s" : ""}`);
      scanForIssues();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBulkFixing(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (issues.length === 0) return (
    <div className="text-center py-12">
      <Check className="h-12 w-12 text-primary mx-auto mb-3" />
      <p className="text-lg font-medium text-foreground">No data quality issues found</p>
      <p className="text-sm text-muted-foreground mt-1">Everything looks good!</p>
    </div>
  );

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const fixableCount = issues.filter(i => i.autoFixable).length;
  const missingReasonCount = issues.filter(i => i.type === "missing_reason").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          {errors.length > 0 && <Badge variant="destructive">{errors.length} error{errors.length !== 1 ? "s" : ""}</Badge>}
          {warnings.length > 0 && <Badge variant="secondary">{warnings.length} warning{warnings.length !== 1 ? "s" : ""}</Badge>}
        </div>
        <div className="flex gap-2">
          {missingReasonCount > 0 && (
            <Button size="sm" variant="secondary" onClick={handleAiResolveReasons} disabled={aiResolving || bulkFixing}>
              {aiResolving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              AI Resolve Reasons ({missingReasonCount})
            </Button>
          )}
          {fixableCount > 0 && (
            <Button size="sm" onClick={handleFixAll} disabled={bulkFixing || aiResolving}>
              {bulkFixing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Fix All Suggested ({fixableCount})
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {issues.map(issue => (
          <div key={issue.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle className={`h-4 w-4 shrink-0 ${issue.severity === "error" ? "text-destructive" : "text-yellow-500"}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{issue.title}</p>
                <p className="text-xs text-muted-foreground truncate">{issue.description}</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {issue.autoFixable && (
                <Button variant="default" size="sm" onClick={() => handleFixOne(issue)} disabled={fixing === issue.id || bulkFixing} className="gap-1">
                  {fixing === issue.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Fix
                </Button>
              )}
              {issue.linkTo && (
                <Link to={issue.linkTo}>
                  <Button variant="outline" size="sm" className="gap-1">
                    <ExternalLink className="h-3 w-3" />{issue.linkLabel || "View"}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Duplicates Section ───

function DuplicatesSection() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [dismissed, setDismissed] = useState<{drivers: Set<string>; teams: Set<string>; circuits: Set<string>; cars: Set<string>}>({ drivers: new Set(), teams: new Set(), circuits: new Set(), cars: new Set() });
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [primaryOverrides, setPrimaryOverrides] = useState<Record<string, string>>({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);

    // Load dismissed pairs
    const [driverDismissed, teamDismissed, circuitDismissed, carDismissed] = await Promise.all([
      supabase.from("dismissed_duplicates" as any).select("driver_id_1, driver_id_2"),
      supabase.from("dismissed_team_duplicates" as any).select("team_id_1, team_id_2"),
      supabase.from("dismissed_circuit_duplicates" as any).select("circuit_id_1, circuit_id_2"),
      supabase.from("dismissed_car_duplicates" as any).select("car_id_1, car_id_2"),
    ]);

    const dSet = new Set<string>();
    for (const d of (driverDismissed.data || []) as any[]) dSet.add(makePairKey(d.driver_id_1, d.driver_id_2));
    const tSet = new Set<string>();
    for (const t of (teamDismissed.data || []) as any[]) tSet.add(makePairKey(t.team_id_1, t.team_id_2));
    const cSet = new Set<string>();
    for (const c of (circuitDismissed.data || []) as any[]) cSet.add(makePairKey(c.circuit_id_1, c.circuit_id_2));
    const carSet = new Set<string>();
    for (const c of (carDismissed.data || []) as any[]) carSet.add(makePairKey(c.car_id_1, c.car_id_2));
    setDismissed({ drivers: dSet, teams: tSet, circuits: cSet, cars: carSet });

    // Load entities
    const [driversRes, teamsRes, circuitsRes, carsRes] = await Promise.all([
      supabase.from("v2_drivers").select("id, full_name, nationality").order("full_name"),
      supabase.from("v2_teams").select("id, full_name, nationality").order("full_name"),
      supabase.from("v2_circuits").select("id, name, country").order("name"),
      supabase.from("v2_cars").select("id, model_name, manufacturer").order("model_name"),
    ]);

    // Usage counts
    const [raceResults, qualResults, pracResults] = await Promise.all([
      supabase.from("v2_race_results" as any).select("driver_id, team_id, car_id"),
      supabase.from("v2_qualifying_results" as any).select("driver_id, team_id, car_id"),
      supabase.from("v2_practice_results" as any).select("driver_id, team_id, car_id"),
    ]);
    const allResults = [...(raceResults.data || []), ...(qualResults.data || []), ...(pracResults.data || [])] as any[];
    const driverCounts: Record<string, number> = {};
    const teamCounts: Record<string, number> = {};
    const carCounts: Record<string, number> = {};
    for (const r of allResults) {
      if (r.driver_id) driverCounts[r.driver_id] = (driverCounts[r.driver_id] || 0) + 1;
      if (r.team_id) teamCounts[r.team_id] = (teamCounts[r.team_id] || 0) + 1;
      if (r.car_id) carCounts[r.car_id] = (carCounts[r.car_id] || 0) + 1;
    }

    const allGroups: DuplicateGroup[] = [];

    // Driver duplicates
    const drivers = (driversRes.data || []);
    findDuplicates(drivers.map(d => ({ id: d.id, label: d.full_name, detail: d.nationality || undefined, usageCount: driverCounts[d.id] || 0 })), dSet, "driver", allGroups);

    // Team duplicates
    const teams = (teamsRes.data || []);
    findDuplicates(teams.map(t => ({ id: t.id, label: t.full_name, detail: t.nationality || undefined, usageCount: teamCounts[t.id] || 0 })), tSet, "team", allGroups);

    // Circuit duplicates
    const circuits = (circuitsRes.data || []);
    findDuplicates(circuits.map(c => ({ id: c.id, label: c.name, detail: c.country || undefined, usageCount: 0 })), cSet, "circuit", allGroups);

    // Car duplicates
    const cars = (carsRes.data || []);
    findDuplicates(cars.map(c => ({ id: c.id, label: [c.manufacturer, c.model_name].filter(Boolean).join(" "), detail: undefined, usageCount: carCounts[c.id] || 0 })), carSet, "car", allGroups);

    setGroups(allGroups);
    setLoading(false);
  };

  function findDuplicates(items: DuplicateGroup["items"], dismissedSet: Set<string>, entityType: DuplicateGroup["entityType"], out: DuplicateGroup[]) {
    const used = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const cluster = [items[i]];
      used.add(i);
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue;
        if (cluster.some(c => namesAreSimilar(c.label, items[j].label))) {
          cluster.push(items[j]);
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
      out.push({ key: cluster.map(c => c.id).sort().join("|"), entityType, items: cluster });
    }
  }

  const pickPrimary = (group: DuplicateGroup): string => {
    if (primaryOverrides[group.key]) return primaryOverrides[group.key];
    const sorted = [...group.items].sort((a, b) => b.usageCount - a.usageCount);
    return sorted[0].id;
  };

  const handleMerge = async (group: DuplicateGroup) => {
    const primaryId = pickPrimary(group);
    const secondaryIds = group.items.filter(i => i.id !== primaryId).map(i => i.id);
    setMerging(group.key);
    try {
      for (const secId of secondaryIds) {
        if (group.entityType === "driver") {
          await supabase.from("v2_race_results" as any).update({ driver_id: primaryId }).eq("driver_id", secId);
          await supabase.from("v2_qualifying_results" as any).update({ driver_id: primaryId }).eq("driver_id", secId);
          await supabase.from("v2_practice_results" as any).update({ driver_id: primaryId }).eq("driver_id", secId);
          await supabase.from("v2_fastest_laps" as any).update({ driver_id: primaryId }).eq("driver_id", secId);
          await supabase.from("v2_pit_stops" as any).update({ driver_id: primaryId }).eq("driver_id", secId);
          await supabase.from("v2_drivers").delete().eq("id", secId);
        } else if (group.entityType === "team") {
          await supabase.from("v2_race_results" as any).update({ team_id: primaryId }).eq("team_id", secId);
          await supabase.from("v2_qualifying_results" as any).update({ team_id: primaryId }).eq("team_id", secId);
          await supabase.from("v2_practice_results" as any).update({ team_id: primaryId }).eq("team_id", secId);
          await supabase.from("v2_teams").delete().eq("id", secId);
        } else if (group.entityType === "circuit") {
          await supabase.from("v2_events").update({ circuit_id: primaryId }).eq("circuit_id", secId);
          await supabase.from("v2_circuits").delete().eq("id", secId);
        } else if (group.entityType === "car") {
          await supabase.from("v2_race_results" as any).update({ car_id: primaryId }).eq("car_id", secId);
          await supabase.from("v2_qualifying_results" as any).update({ car_id: primaryId }).eq("car_id", secId);
          await supabase.from("v2_practice_results" as any).update({ car_id: primaryId }).eq("car_id", secId);
          await supabase.from("v2_cars").delete().eq("id", secId);
        }
      }
      toast.success(`Merged ${secondaryIds.length + 1} ${group.entityType}s`);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    }
    setMerging(null);
  };

  const handleDismiss = async (group: DuplicateGroup) => {
    setDismissing(group.key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const pairs: any[] = [];
      const dismissedSet = group.entityType === "driver" ? dismissed.drivers : group.entityType === "team" ? dismissed.teams : group.entityType === "circuit" ? dismissed.circuits : dismissed.cars;
      for (let i = 0; i < group.items.length; i++) {
        for (let j = i + 1; j < group.items.length; j++) {
          const [id1, id2] = [group.items[i].id, group.items[j].id].sort();
          if (!dismissedSet.has(makePairKey(id1, id2))) {
            if (group.entityType === "driver") pairs.push({ driver_id_1: id1, driver_id_2: id2, dismissed_by: session?.user?.id });
            else if (group.entityType === "team") pairs.push({ team_id_1: id1, team_id_2: id2, dismissed_by: session?.user?.id });
            else if (group.entityType === "circuit") pairs.push({ circuit_id_1: id1, circuit_id_2: id2, dismissed_by: session?.user?.id });
            else if (group.entityType === "car") pairs.push({ car_id_1: id1, car_id_2: id2, dismissed_by: session?.user?.id });
          }
        }
      }
      if (pairs.length > 0) {
        const table = group.entityType === "driver" ? "dismissed_duplicates" : group.entityType === "team" ? "dismissed_team_duplicates" : group.entityType === "circuit" ? "dismissed_circuit_duplicates" : "dismissed_car_duplicates";
        await supabase.from(table as any).insert(pairs);
      }
      toast.success("Marked as not duplicates");
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    }
    setDismissing(null);
  };

  const entityLabels: Record<string, string> = { driver: "Drivers", team: "Teams", circuit: "Circuits", car: "Cars" };
  const entityColors: Record<string, string> = { driver: "bg-blue-500/10 text-blue-500", team: "bg-green-500/10 text-green-500", circuit: "bg-orange-500/10 text-orange-500", car: "bg-purple-500/10 text-purple-500" };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (groups.length === 0) return (
    <div className="text-center py-12">
      <Check className="h-12 w-12 text-primary mx-auto mb-3" />
      <p className="text-lg font-medium text-foreground">No duplicates detected</p>
      <p className="text-sm text-muted-foreground mt-1">All entities look unique.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{groups.length} potential duplicate group{groups.length !== 1 ? "s" : ""} found.</p>
      {groups.map(group => {
        const primaryId = pickPrimary(group);
        const isMerging = merging === group.key;
        const isDismissing = dismissing === group.key;

        return (
          <div key={group.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`text-[10px] ${entityColors[group.entityType]}`}>{entityLabels[group.entityType]}</Badge>
            </div>
            <div className="flex flex-wrap gap-3 mb-4">
              {group.items.map(item => {
                const isPrimary = item.id === primaryId;
                return (
                  <div
                    key={item.id}
                    className={`flex-1 min-w-[180px] rounded-lg border p-3 cursor-pointer transition-colors ${isPrimary ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                    onClick={() => setPrimaryOverrides(prev => ({ ...prev, [group.key]: item.id }))}
                  >
                    {isPrimary && <Badge className="text-[10px] mb-1">Keep</Badge>}
                    <p className="font-medium text-foreground text-sm">{item.label}</p>
                    {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                    <p className="text-xs text-muted-foreground">{item.usageCount} result{item.usageCount !== 1 ? "s" : ""}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleMerge(group)} disabled={isMerging || isDismissing}>
                {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
                Merge
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
