import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import AutocompleteField from "@/components/manage/AutocompleteField";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, ChevronDown } from "lucide-react";

type Ref = { id: string; label: string } | null;

interface ResultRow {
  _key: string;
  position: string;
  driver: Ref;
  team: Ref;
  car: Ref;
  [key: string]: any;
}

const RACE_STATUSES = ["finished", "dnf", "dns", "dsq", "classified"];

const makeKey = () => Math.random().toString(36).slice(2, 10);

const blankRow = (pos: number, type: string): ResultRow => {
  const base: ResultRow = { _key: makeKey(), position: String(pos), driver: null, team: null, car: null };
  if (type === "practice") { base.best_lap_time = ""; base.gap_to_p1 = ""; base.laps_run = ""; base.notes = ""; }
  else if (type === "qualifying" || type === "sprint_qualifying") { base.q1_time = ""; base.q2_time = ""; base.q3_time = ""; base.best_time = ""; base.gap_to_pole = ""; base.laps_run = ""; }
  else if (type === "race" || type === "sprint_race") { base.laps_completed = ""; base.total_time = ""; base.fastest_lap_time = ""; base.average_lap_time = ""; base.pit_stops = ""; base.points = ""; base.status = "finished"; base.dnf_reason = ""; }
  else { base.notes = ""; }
  return base;
};

export default function ManageSessionResults() {
  const { id: eventId, sessionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["v2_session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_sessions").select("*, v2_events(name)").eq("id", sessionId!).single();
      if (error) throw error;
      return data;
    },
  });

  const type = session?.session_type || "other";
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [pitStops, setPitStops] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [qualSegments, setQualSegments] = useState(3);

  // Load existing data
  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const t = session.session_type;
      let table = "v2_practice_results";
      if (t === "qualifying" || t === "sprint_qualifying") table = "v2_qualifying_results";
      else if (t === "race" || t === "sprint_race") table = "v2_race_results";
      else if (t === "practice") table = "v2_practice_results";
      else table = "v2_practice_results"; // fallback for 'other'

      const { data } = await supabase.from(table as any).select("*, v2_drivers(id, full_name), v2_teams(id, full_name), v2_cars(id, model_name, manufacturer)").eq("session_id", sessionId!).order("position");

      if (data && data.length > 0) {
        setRows(data.map((r: any) => {
          const row: ResultRow = {
            _key: r.id,
            position: String(r.position || ""),
            driver: r.v2_drivers ? { id: r.v2_drivers.id, label: r.v2_drivers.full_name } : null,
            team: r.v2_teams ? { id: r.v2_teams.id, label: r.v2_teams.full_name } : null,
            car: r.v2_cars ? { id: r.v2_cars.id, label: [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") } : null,
          };
          // Copy type-specific fields
          if (t === "practice") { row.best_lap_time = r.best_lap_time || ""; row.gap_to_p1 = r.gap_to_p1 || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; row.notes = ""; }
          else if (t === "qualifying" || t === "sprint_qualifying") { row.q1_time = r.q1_time || ""; row.q2_time = r.q2_time || ""; row.q3_time = r.q3_time || ""; row.best_time = r.best_time || ""; row.gap_to_pole = r.gap_to_pole || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; }
          else if (t === "race" || t === "sprint_race") { row.laps_completed = r.laps_completed != null ? String(r.laps_completed) : ""; row.total_time = r.total_time || ""; row.fastest_lap_time = r.fastest_lap_time || ""; row.average_lap_time = r.average_lap_time || ""; row.pit_stops = r.pit_stops != null ? String(r.pit_stops) : ""; row.points = r.points != null ? String(r.points) : ""; row.status = r.status || "finished"; row.dnf_reason = r.dnf_reason || ""; }
          else { row.notes = ""; }
          return row;
        }));
      } else {
        setRows([blankRow(1, t)]);
      }

      if (t === "race" || t === "sprint_race") {
        const { data: ps } = await supabase.from("v2_pit_stops").select("*, v2_drivers(id, full_name)").eq("session_id", sessionId!).order("lap_number");
        setPitStops((ps || []).map((p: any) => ({ _key: p.id, driver: p.v2_drivers ? { id: p.v2_drivers.id, label: p.v2_drivers.full_name } : null, lap_number: String(p.lap_number || ""), stop_duration: p.stop_duration || "", total_pit_time: p.total_pit_time || "" })));
        const { data: inc } = await supabase.from("v2_incidents").select("*").eq("session_id", sessionId!).order("lap_number");
        setIncidents((inc || []).map((i: any) => ({ _key: i.id, lap_number: String(i.lap_number || ""), description: i.description || "", penalty_type: i.penalty_type || "", outcome: i.outcome || "" })));
      }
    };
    load();
  }, [session, sessionId]);

  const addRow = () => setRows(r => [...r, blankRow(r.length + 1, type)]);
  const removeRow = (key: string) => setRows(r => r.filter(row => row._key !== key));
  const updateRow = (key: string, field: string, value: any) => setRows(r => r.map(row => row._key === key ? { ...row, [field]: value } : row));

  const handleSave = useCallback(async (publish: boolean) => {
    if (!session) return;
    setSaving(true);
    try {
      const t = session.session_type;
      // Delete existing results
      if (t === "practice" || t === "warmup" || t === "other") {
        await supabase.from("v2_practice_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, best_lap_time: r.best_lap_time || null, gap_to_p1: r.gap_to_p1 || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null }));
        if (inserts.length) { const { error } = await supabase.from("v2_practice_results").insert(inserts); if (error) throw error; }
      } else if (t === "qualifying" || t === "sprint_qualifying") {
        await supabase.from("v2_qualifying_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, q1_time: r.q1_time || null, q2_time: r.q2_time || null, q3_time: r.q3_time || null, best_time: r.best_time || null, gap_to_pole: r.gap_to_pole || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null }));
        if (inserts.length) { const { error } = await supabase.from("v2_qualifying_results").insert(inserts); if (error) throw error; }
      } else {
        await supabase.from("v2_race_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, laps_completed: r.laps_completed ? parseInt(r.laps_completed) : null, total_time: r.total_time || null, gap_to_leader: r.total_time || null, fastest_lap_time: r.fastest_lap_time || null, average_lap_time: r.average_lap_time || null, pit_stops: r.pit_stops ? parseInt(r.pit_stops) : null, points: r.points ? parseFloat(r.points) : null, status: (r.status || "finished") as any, dnf_reason: r.dnf_reason || null }));
        if (inserts.length) { const { error } = await supabase.from("v2_race_results").insert(inserts); if (error) throw error; }

        // Pit stops
        await supabase.from("v2_pit_stops").delete().eq("session_id", sessionId!);
        const psInserts = pitStops.filter(p => p.driver).map(p => ({ session_id: sessionId!, driver_id: p.driver?.id || null, lap_number: p.lap_number ? parseInt(p.lap_number) : null, stop_duration: p.stop_duration || null, total_pit_time: p.total_pit_time || null }));
        if (psInserts.length) { const { error } = await supabase.from("v2_pit_stops").insert(psInserts); if (error) throw error; }

        // Incidents
        await supabase.from("v2_incidents").delete().eq("session_id", sessionId!);
        const incInserts = incidents.filter(i => i.description).map(i => ({ session_id: sessionId!, lap_number: i.lap_number ? parseInt(i.lap_number) : null, description: i.description || null, penalty_type: i.penalty_type || null, outcome: i.outcome || null, driver_ids: [] as string[] }));
        if (incInserts.length) { const { error } = await supabase.from("v2_incidents").insert(incInserts); if (error) throw error; }
      }

      if (publish) {
        await supabase.from("v2_sessions").update({ status: "published" as any }).eq("id", sessionId!);
      }

      qc.invalidateQueries({ queryKey: ["v2_sessions"] });
      toast.success(publish ? "Published!" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }, [session, sessionId, rows, pitStops, incidents, qc]);

  if (!session) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const isRace = type === "race" || type === "sprint_race";
  const isQual = type === "qualifying" || type === "sprint_qualifying";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/manage/events/${eventId}`)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <div>
            <h1 className="text-lg font-bold">{session.name}</h1>
            <p className="text-xs text-muted-foreground">{session.v2_events?.name} • <Badge variant="outline" className="text-[10px]">{type.replace("_", " ")}</Badge></p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving}>Save Draft</Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>Publish Session</Button>
        </div>
      </div>

      {isQual && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Qualifying segments:</span>
          {[1, 2, 3].map(n => (
            <Button key={n} size="sm" variant={qualSegments >= n ? "default" : "outline"} className="h-6 text-xs px-2" onClick={() => setQualSegments(n)}>Q{n}</Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-2 text-left w-12">Pos</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Driver</th>
              <th className="px-2 py-2 text-left min-w-[140px]">Team</th>
              <th className="px-2 py-2 text-left min-w-[140px]">Car</th>
              {type === "practice" && <><th className="px-2 py-2">Best Lap</th><th className="px-2 py-2">Gap</th><th className="px-2 py-2">Laps</th><th className="px-2 py-2">Notes</th></>}
              {isQual && <><th className="px-2 py-2">Q1</th>{qualSegments >= 2 && <th className="px-2 py-2">Q2</th>}{qualSegments >= 3 && <th className="px-2 py-2">Q3</th>}<th className="px-2 py-2">Best</th><th className="px-2 py-2">Gap</th><th className="px-2 py-2">Laps</th></>}
              {isRace && <><th className="px-2 py-2">Laps</th><th className="px-2 py-2">Time/Gap</th><th className="px-2 py-2">FL</th><th className="px-2 py-2">Avg</th><th className="px-2 py-2">Pits</th><th className="px-2 py-2">Pts</th><th className="px-2 py-2">Status</th></>}
              {type === "other" && <th className="px-2 py-2">Notes</th>}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row._key} className="border-t border-border hover:bg-muted/20">
                <td className="px-2 py-1"><Input value={row.position} onChange={e => updateRow(row._key, "position", e.target.value)} className="h-7 w-12 text-xs text-center" /></td>
                <td className="px-1 py-1"><AutocompleteField entityType="driver" value={row.driver} onChange={v => updateRow(row._key, "driver", v)} /></td>
                <td className="px-1 py-1"><AutocompleteField entityType="team" value={row.team} onChange={v => updateRow(row._key, "team", v)} /></td>
                <td className="px-1 py-1"><AutocompleteField entityType="car" value={row.car} onChange={v => updateRow(row._key, "car", v)} /></td>
                {type === "practice" && <>
                  <td className="px-1 py-1"><Input value={row.best_lap_time} onChange={e => updateRow(row._key, "best_lap_time", e.target.value)} className="h-7 text-xs" placeholder="1:23.456" /></td>
                  <td className="px-1 py-1"><Input value={row.gap_to_p1} onChange={e => updateRow(row._key, "gap_to_p1", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.laps_run} onChange={e => updateRow(row._key, "laps_run", e.target.value)} className="h-7 w-14 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.notes} onChange={e => updateRow(row._key, "notes", e.target.value)} className="h-7 text-xs" /></td>
                </>}
                {isQual && <>
                  <td className="px-1 py-1"><Input value={row.q1_time} onChange={e => updateRow(row._key, "q1_time", e.target.value)} className="h-7 text-xs" /></td>
                  {qualSegments >= 2 && <td className="px-1 py-1"><Input value={row.q2_time} onChange={e => updateRow(row._key, "q2_time", e.target.value)} className="h-7 text-xs" /></td>}
                  {qualSegments >= 3 && <td className="px-1 py-1"><Input value={row.q3_time} onChange={e => updateRow(row._key, "q3_time", e.target.value)} className="h-7 text-xs" /></td>}
                  <td className="px-1 py-1"><Input value={row.best_time} onChange={e => updateRow(row._key, "best_time", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.gap_to_pole} onChange={e => updateRow(row._key, "gap_to_pole", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.laps_run} onChange={e => updateRow(row._key, "laps_run", e.target.value)} className="h-7 w-14 text-xs" /></td>
                </>}
                {isRace && <>
                  <td className="px-1 py-1"><Input value={row.laps_completed} onChange={e => updateRow(row._key, "laps_completed", e.target.value)} className="h-7 w-14 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.total_time} onChange={e => updateRow(row._key, "total_time", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.fastest_lap_time} onChange={e => updateRow(row._key, "fastest_lap_time", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.average_lap_time} onChange={e => updateRow(row._key, "average_lap_time", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.pit_stops} onChange={e => updateRow(row._key, "pit_stops", e.target.value)} className="h-7 w-14 text-xs" /></td>
                  <td className="px-1 py-1"><Input value={row.points} onChange={e => updateRow(row._key, "points", e.target.value)} className="h-7 w-14 text-xs" /></td>
                  <td className="px-1 py-1">
                    <Select value={row.status} onValueChange={v => updateRow(row._key, "status", v)}>
                      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{RACE_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s.toUpperCase()}</SelectItem>)}</SelectContent>
                    </Select>
                    {row.status === "dnf" && <Input value={row.dnf_reason} onChange={e => updateRow(row._key, "dnf_reason", e.target.value)} className="h-6 text-xs mt-1" placeholder="DNF reason" />}
                  </td>
                </>}
                {type === "other" && <td className="px-1 py-1"><Input value={row.notes} onChange={e => updateRow(row._key, "notes", e.target.value)} className="h-7 text-xs" /></td>}
                <td className="px-1 py-1"><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeRow(row._key)}><X className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-3 w-3 mr-1" />Add Row</Button>

      {isRace && (
        <div className="space-y-3">
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium"><ChevronDown className="h-4 w-4" />Pit Stop Log</CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {pitStops.map((p, i) => (
                <div key={p._key} className="flex items-center gap-2">
                  <AutocompleteField entityType="driver" value={p.driver} onChange={v => setPitStops(ps => ps.map((pp, j) => j === i ? { ...pp, driver: v } : pp))} className="w-40" />
                  <Input value={p.lap_number} onChange={e => setPitStops(ps => ps.map((pp, j) => j === i ? { ...pp, lap_number: e.target.value } : pp))} className="h-7 w-16 text-xs" placeholder="Lap" />
                  <Input value={p.stop_duration} onChange={e => setPitStops(ps => ps.map((pp, j) => j === i ? { ...pp, stop_duration: e.target.value } : pp))} className="h-7 w-24 text-xs" placeholder="Duration" />
                  <Input value={p.total_pit_time} onChange={e => setPitStops(ps => ps.map((pp, j) => j === i ? { ...pp, total_pit_time: e.target.value } : pp))} className="h-7 w-24 text-xs" placeholder="Total" />
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setPitStops(ps => ps.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPitStops(ps => [...ps, { _key: makeKey(), driver: null, lap_number: "", stop_duration: "", total_pit_time: "" }])}><Plus className="h-3 w-3 mr-1" />Add Pit Stop</Button>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium"><ChevronDown className="h-4 w-4" />Incident Log</CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {incidents.map((inc, i) => (
                <div key={inc._key} className="flex items-center gap-2">
                  <Input value={inc.lap_number} onChange={e => setIncidents(is => is.map((ii, j) => j === i ? { ...ii, lap_number: e.target.value } : ii))} className="h-7 w-16 text-xs" placeholder="Lap" />
                  <Input value={inc.description} onChange={e => setIncidents(is => is.map((ii, j) => j === i ? { ...ii, description: e.target.value } : ii))} className="h-7 flex-1 text-xs" placeholder="Description" />
                  <Input value={inc.penalty_type} onChange={e => setIncidents(is => is.map((ii, j) => j === i ? { ...ii, penalty_type: e.target.value } : ii))} className="h-7 w-24 text-xs" placeholder="Penalty" />
                  <Input value={inc.outcome} onChange={e => setIncidents(is => is.map((ii, j) => j === i ? { ...ii, outcome: e.target.value } : ii))} className="h-7 w-24 text-xs" placeholder="Outcome" />
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setIncidents(is => is.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setIncidents(is => [...is, { _key: makeKey(), lap_number: "", description: "", penalty_type: "", outcome: "" }])}><Plus className="h-3 w-3 mr-1" />Add Incident</Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
