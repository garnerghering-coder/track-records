import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import AutocompleteField from "@/components/manage/AutocompleteField";
import FlagImage from "@/components/FlagImage";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, ChevronDown, Upload, FileText, Loader2, Columns, GripVertical } from "lucide-react";
import { parseTime, formatLapTime, formatGap } from "@/lib/time-calc";

type Ref = { id: string; label: string } | null;

interface CustomColumn {
  key: string;
  name: string;
  type: "text" | "number";
}

interface ResultRow {
  _key: string;
  position: string;
  car_number: string;
  driver: Ref;
  team: Ref;
  car: Ref;
  _driverNationality?: string | null;
  [key: string]: any;
}

const RACE_STATUSES = ["finished", "dnf", "dns", "dsq", "classified"];

const makeKey = () => Math.random().toString(36).slice(2, 10);

const blankRow = (pos: number, type: string, customCols: CustomColumn[] = []): ResultRow => {
  const base: ResultRow = { _key: makeKey(), position: String(pos), car_number: "", driver: null, team: null, car: null, _driverNationality: null };
  if (type === "practice") { base.best_lap_time = ""; base.gap_to_p1 = ""; base.gap_int = ""; base.laps_run = ""; base.notes = ""; }
  else if (type === "qualifying" || type === "sprint_qualifying") { base.q1_time = ""; base.q2_time = ""; base.q3_time = ""; base.best_time = ""; base.gap_to_pole = ""; base.gap_int = ""; base.laps_run = ""; }
  else if (type === "race" || type === "sprint_race") { base.laps_completed = ""; base.total_time = ""; base.fastest_lap_time = ""; base.average_lap_time = ""; base.pit_stops = ""; base.points = ""; base.status = "finished"; base.dnf_reason = ""; base.gap_int = ""; }
  else { base.notes = ""; }
  for (const col of customCols) {
    base[`_custom_${col.key}`] = "";
  }
  return base;
};

function fuzzyMatch(needle: string, haystack: { id: string; label: string }[]): { id: string; label: string } | null {
  const n = needle.toLowerCase().trim();
  if (!n) return null;
  const exact = haystack.find(h => h.label.toLowerCase() === n);
  if (exact) return exact;
  const partial = haystack.find(h => h.label.toLowerCase().includes(n) || n.includes(h.label.toLowerCase()));
  return partial || null;
}

// --- Time auto-calculation helpers ---

function getBestLapField(type: string): string {
  if (type === "practice" || type === "warmup" || type === "other") return "best_lap_time";
  if (type === "qualifying" || type === "sprint_qualifying") return "best_time";
  return "fastest_lap_time";
}

function getGapField(type: string): string {
  if (type === "practice" || type === "warmup" || type === "other") return "gap_to_p1";
  if (type === "qualifying" || type === "sprint_qualifying") return "gap_to_pole";
  return "total_time"; // for race, gap to leader is stored in total_time or gap_to_leader
}

function recalcFromBestLap(rows: ResultRow[], type: string): ResultRow[] {
  const bestField = getBestLapField(type);
  const gapField = getGapField(type);
  const p1Time = parseTime(rows[0]?.[bestField] || "");

  return rows.map((row, i) => {
    const myTime = parseTime(row[bestField] || "");
    const newRow = { ...row };

    if (i === 0) {
      newRow[gapField] = "";
      newRow.gap_int = "";
    } else {
      if (myTime !== null && p1Time !== null) {
        newRow[gapField] = formatGap(myTime - p1Time);
      }
      const prevTime = parseTime(rows[i - 1]?.[bestField] || "");
      if (myTime !== null && prevTime !== null) {
        newRow.gap_int = formatGap(myTime - prevTime);
      }
    }
    return newRow;
  });
}

export default function ManageSessionResults() {
  const { id: eventId, sessionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const editingFieldRef = useRef<string | null>(null);

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
  const [importing, setImporting] = useState(false);
  const [qualSegments, setQualSegments] = useState(3);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "number">("text");

  // Drag state for rows
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  // Drag state for columns
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);

  // Column order management
  const getDefaultColumns = useCallback(() => {
    const cols: string[] = ["position", "car_number", "driver", "nat", "team", "car"];
    if (type === "practice") cols.push("best_lap_time", "gap_to_p1", "gap_int", "laps_run", "notes");
    else if (type === "qualifying" || type === "sprint_qualifying") cols.push("q1_time", "q2_time", "q3_time", "best_time", "gap_to_pole", "gap_int", "laps_run");
    else if (type === "race" || type === "sprint_race") cols.push("laps_completed", "total_time", "fastest_lap_time", "gap_int", "average_lap_time", "pit_stops", "points", "status");
    else cols.push("notes");
    return cols;
  }, [type]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // Initialize column order from session data or defaults
  useEffect(() => {
    if (!session) return;
    const savedOrder = (session as any).column_order as string[] | null;
    if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
      // Use saved order, but add any new default columns that may have been added
      const defaults = getDefaultColumns();
      const customKeys = customColumns.map(c => `_custom_${c.key}`);
      const allKeys = [...defaults, ...customKeys];
      const existing = savedOrder.filter(k => allKeys.includes(k));
      const newKeys = allKeys.filter(k => !existing.includes(k));
      setColumnOrder([...existing, ...newKeys]);
    } else {
      setColumnOrder(prev => {
        const defaults = getDefaultColumns();
        const customKeys = customColumns.map(c => `_custom_${c.key}`);
        const allKeys = [...defaults, ...customKeys];
        const existing = prev.filter(k => allKeys.includes(k));
        const newKeys = allKeys.filter(k => !existing.includes(k));
        return existing.length > 0 ? [...existing, ...newKeys] : allKeys;
      });
    }
  }, [session, type, customColumns, getDefaultColumns]);

  // Load existing data
  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const t = session.session_type;
      let table = "v2_practice_results";
      if (t === "qualifying" || t === "sprint_qualifying") table = "v2_qualifying_results";
      else if (t === "race" || t === "sprint_race") table = "v2_race_results";

      const { data } = await supabase.from(table as any).select("*, v2_drivers(id, full_name, nationality), v2_teams(id, full_name), v2_cars(id, model_name, manufacturer)").eq("session_id", sessionId!).order("position");

      if (data && data.length > 0) {
        // Extract custom columns from extra_data (excluding "Int" which is built-in)
        const foundCustomCols: CustomColumn[] = [];
        const seenKeys = new Set<string>();
        for (const r of data) {
          const ed = (r as any).extra_data;
          if (ed && typeof ed === "object") {
            for (const k of Object.keys(ed)) {
              if (k === "Int") continue; // built-in
              if (!seenKeys.has(k)) {
                seenKeys.add(k);
                foundCustomCols.push({ key: k, name: k, type: typeof ed[k] === "number" ? "number" : "text" });
              }
            }
          }
        }
        if (foundCustomCols.length > 0) setCustomColumns(foundCustomCols);

        setRows(data.map((r: any) => {
          const row: ResultRow = {
            _key: r.id,
            position: String(r.position || ""),
            car_number: r.car_number || "",
            driver: r.v2_drivers ? { id: r.v2_drivers.id, label: r.v2_drivers.full_name } : null,
            team: r.v2_teams ? { id: r.v2_teams.id, label: r.v2_teams.full_name } : null,
            car: r.v2_cars ? { id: r.v2_cars.id, label: [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") } : null,
            _driverNationality: r.v2_drivers?.nationality || null,
          };
          if (t === "practice") { row.best_lap_time = r.best_lap_time || ""; row.gap_to_p1 = r.gap_to_p1 || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; row.notes = ""; row.gap_int = (r.extra_data as any)?.Int || ""; }
          else if (t === "qualifying" || t === "sprint_qualifying") { row.q1_time = r.q1_time || ""; row.q2_time = r.q2_time || ""; row.q3_time = r.q3_time || ""; row.best_time = r.best_time || ""; row.gap_to_pole = r.gap_to_pole || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; row.gap_int = (r.extra_data as any)?.Int || ""; }
          else if (t === "race" || t === "sprint_race") { row.laps_completed = r.laps_completed != null ? String(r.laps_completed) : ""; row.total_time = r.total_time || ""; row.fastest_lap_time = r.fastest_lap_time || ""; row.average_lap_time = r.average_lap_time || ""; row.pit_stops = r.pit_stops != null ? String(r.pit_stops) : ""; row.points = r.points != null ? String(r.points) : ""; row.status = r.status || "finished"; row.dnf_reason = r.dnf_reason || ""; row.gap_int = (r.extra_data as any)?.Int || ""; }
          else { row.notes = ""; }
          // Load custom column data from extra_data
          const ed = (r as any).extra_data;
          if (ed && typeof ed === "object") {
            for (const k of Object.keys(ed)) {
              if (k === "Int") continue;
              row[`_custom_${k}`] = String(ed[k] ?? "");
            }
          }
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

  const addRow = () => setRows(r => [...r, blankRow(r.length + 1, type, customColumns)]);
  const removeRow = (key: string) => setRows(r => r.filter(row => row._key !== key));

  const updateRow = (key: string, field: string, value: any) => {
    setRows(prevRows => {
      let newRows = prevRows.map(row => row._key === key ? { ...row, [field]: value } : row);

      // Auto-calculation for time fields
      const bestField = getBestLapField(type);
      const gapField = getGapField(type);
      const isTimeField = field === bestField || field === gapField || field === "gap_int";

      if (isTimeField && editingFieldRef.current !== field) {
        editingFieldRef.current = field;
        const rowIdx = newRows.findIndex(r => r._key === key);

        if (field === bestField) {
          // Recalculate gap and int from best lap times
          newRows = recalcFromBestLap(newRows, type);
        } else if (field === gapField && rowIdx > 0) {
          // Recalculate best lap from gap
          const p1Time = parseTime(newRows[0]?.[bestField] || "");
          const gapMs = parseTime(value || "");
          if (p1Time !== null && gapMs !== null) {
            newRows[rowIdx] = { ...newRows[rowIdx], [bestField]: formatLapTime(p1Time + gapMs) };
            // Recalculate int
            const prevTime = parseTime(newRows[rowIdx - 1]?.[bestField] || "");
            const myTime = p1Time + gapMs;
            if (prevTime !== null) {
              newRows[rowIdx] = { ...newRows[rowIdx], gap_int: formatGap(myTime - prevTime) };
            }
          }
        } else if (field === "gap_int" && rowIdx > 0) {
          // Recalculate best lap from interval
          const prevTime = parseTime(newRows[rowIdx - 1]?.[bestField] || "");
          const intMs = parseTime(value || "");
          if (prevTime !== null && intMs !== null) {
            const myTime = prevTime + intMs;
            newRows[rowIdx] = { ...newRows[rowIdx], [bestField]: formatLapTime(myTime) };
            // Recalculate gap
            const p1Time = parseTime(newRows[0]?.[bestField] || "");
            if (p1Time !== null) {
              newRows[rowIdx] = { ...newRows[rowIdx], [gapField]: formatGap(myTime - p1Time) };
            }
          }
        }

        // Reset editing flag after a tick
        setTimeout(() => { editingFieldRef.current = null; }, 0);
      }

      return newRows;
    });
  };

  // When driver is selected, also fetch nationality
  const handleDriverChange = async (key: string, driverRef: Ref) => {
    updateRow(key, "driver", driverRef);
    if (driverRef) {
      const { data } = await supabase.from("v2_drivers").select("nationality").eq("id", driverRef.id).single();
      if (data) {
        setRows(prev => prev.map(r => r._key === key ? { ...r, _driverNationality: data.nationality } : r));
      }
    } else {
      setRows(prev => prev.map(r => r._key === key ? { ...r, _driverNationality: null } : r));
    }
  };

  const addCustomColumn = () => {
    if (!newColName.trim()) return;
    const key = makeKey();
    const col: CustomColumn = { key, name: newColName.trim(), type: newColType };
    setCustomColumns(prev => [...prev, col]);
    setRows(prev => prev.map(row => ({ ...row, [`_custom_${key}`]: "" })));
    setNewColName("");
    setNewColType("text");
    setAddColOpen(false);
    toast.success(`Column "${col.name}" added`);
  };

  const removeCustomColumn = (key: string) => {
    setCustomColumns(prev => prev.filter(c => c.key !== key));
    setRows(prev => prev.map(row => {
      const newRow = { ...row };
      delete newRow[`_custom_${key}`];
      return newRow;
    }));
  };

  // Row drag handlers
  const handleRowDragStart = (idx: number) => setDragRowIdx(idx);
  const handleRowDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleRowDrop = (targetIdx: number) => {
    if (dragRowIdx === null || dragRowIdx === targetIdx) return;
    setRows(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragRowIdx, 1);
      arr.splice(targetIdx, 0, moved);
      return arr.map((r, i) => ({ ...r, position: String(i + 1) }));
    });
    setDragRowIdx(null);
  };

  // Column drag handlers
  const handleColDragStart = (idx: number) => setDragColIdx(idx);
  const handleColDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleColDrop = (targetIdx: number) => {
    if (dragColIdx === null || dragColIdx === targetIdx) return;
    setColumnOrder(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragColIdx, 1);
      arr.splice(targetIdx, 0, moved);
      return arr;
    });
    setDragColIdx(null);
  };

  const handlePdfImport = async (file: File) => {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-session-pdf", {
        body: { session_id: sessionId, session_type: type, pdf_base64: base64, file_name: file.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const results = data?.results || [];
      if (results.length === 0) { toast.warning("No results found in PDF"); return; }

      const { data: existingDrivers } = await supabase.from("v2_drivers").select("id, full_name, nationality");
      const { data: existingTeams } = await supabase.from("v2_teams").select("id, full_name");
      const driverList = (existingDrivers || []).map(d => ({ id: d.id, label: d.full_name, nationality: d.nationality }));
      const teamList = (existingTeams || []).map(t => ({ id: t.id, label: t.full_name }));

      const newRows: ResultRow[] = [];
      for (const r of results) {
        const row = blankRow(r.position || newRows.length + 1, type, customColumns);
        row.position = String(r.position || "");
        row.car_number = String(r.car_number || "");

        if (r.driver_name) {
          let match = fuzzyMatch(r.driver_name, driverList);
          if (!match) {
            const { data: newDriver } = await supabase.from("v2_drivers").insert({ full_name: r.driver_name }).select("id, full_name, nationality").single();
            if (newDriver) {
              match = { id: newDriver.id, label: newDriver.full_name };
              driverList.push({ ...match, nationality: newDriver.nationality });
            }
          }
          row.driver = match;
          const driverData = driverList.find(d => d.id === match?.id);
          row._driverNationality = driverData?.nationality || null;
        }

        if (r.team_name) {
          let match = fuzzyMatch(r.team_name, teamList);
          if (!match) {
            const { data: newTeam } = await supabase.from("v2_teams").insert({ full_name: r.team_name }).select("id, full_name").single();
            if (newTeam) {
              match = { id: newTeam.id, label: newTeam.full_name };
              teamList.push(match);
            }
          }
          row.team = match;
        }

        if (type === "practice") {
          row.best_lap_time = r.best_lap_time || "";
          row.gap_to_p1 = r.gap || "";
          row.laps_run = r.laps != null ? String(r.laps) : "";
        } else if (type === "qualifying" || type === "sprint_qualifying") {
          row.q1_time = r.q1_time || "";
          row.q2_time = r.q2_time || "";
          row.q3_time = r.q3_time || "";
          row.best_time = r.best_time || "";
          row.gap_to_pole = r.gap || "";
          row.laps_run = r.laps != null ? String(r.laps) : "";
        } else if (type === "race" || type === "sprint_race") {
          row.laps_completed = r.laps_completed != null ? String(r.laps_completed) : "";
          row.total_time = r.total_time || "";
          row.fastest_lap_time = r.fastest_lap_time || "";
          row.pit_stops = r.pit_stops != null ? String(r.pit_stops) : "";
          row.points = r.points != null ? String(r.points) : "";
          row.status = r.status || "finished";
          row.dnf_reason = r.dnf_reason || "";
        }

        newRows.push(row);
      }

      setRows(newRows);
      qc.invalidateQueries({ queryKey: ["v2_session", sessionId] });
      toast.success(`Imported ${newRows.length} results from PDF`);
    } catch (e: any) {
      console.error("PDF import error:", e);
      toast.error(e.message || "PDF import failed");
    } finally {
      setImporting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  // Build extra_data from custom columns + gap_int for a row
  const buildExtraData = (row: ResultRow): Record<string, any> => {
    const ed: Record<string, any> = {};
    // Store Int in extra_data
    if (row.gap_int) {
      ed["Int"] = row.gap_int;
    }
    for (const col of customColumns) {
      const val = row[`_custom_${col.key}`];
      if (val !== undefined && val !== "") {
        ed[col.name] = col.type === "number" ? parseFloat(val) || 0 : val;
      }
    }
    return ed;
  };

  const handleSave = useCallback(async (publish: boolean) => {
    if (!session) return;
    setSaving(true);
    try {
      const t = session.session_type;
      if (t === "practice" || t === "warmup" || t === "other") {
        await supabase.from("v2_practice_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, best_lap_time: r.best_lap_time || null, gap_to_p1: r.gap_to_p1 || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null, extra_data: buildExtraData(r) }));
        if (inserts.length) { const { error } = await supabase.from("v2_practice_results").insert(inserts as any); if (error) throw error; }
      } else if (t === "qualifying" || t === "sprint_qualifying") {
        await supabase.from("v2_qualifying_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, q1_time: r.q1_time || null, q2_time: r.q2_time || null, q3_time: r.q3_time || null, best_time: r.best_time || null, gap_to_pole: r.gap_to_pole || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null, extra_data: buildExtraData(r) }));
        if (inserts.length) { const { error } = await supabase.from("v2_qualifying_results").insert(inserts as any); if (error) throw error; }
      } else {
        await supabase.from("v2_race_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => ({ session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, laps_completed: r.laps_completed ? parseInt(r.laps_completed) : null, total_time: r.total_time || null, gap_to_leader: r.total_time || null, fastest_lap_time: r.fastest_lap_time || null, average_lap_time: r.average_lap_time || null, pit_stops: r.pit_stops ? parseInt(r.pit_stops) : null, points: r.points ? parseFloat(r.points) : null, status: (r.status || "finished") as any, dnf_reason: r.dnf_reason || null, extra_data: buildExtraData(r) }));
        if (inserts.length) { const { error } = await supabase.from("v2_race_results").insert(inserts as any); if (error) throw error; }

        await supabase.from("v2_pit_stops").delete().eq("session_id", sessionId!);
        const psInserts = pitStops.filter(p => p.driver).map(p => ({ session_id: sessionId!, driver_id: p.driver?.id || null, lap_number: p.lap_number ? parseInt(p.lap_number) : null, stop_duration: p.stop_duration || null, total_pit_time: p.total_pit_time || null }));
        if (psInserts.length) { const { error } = await supabase.from("v2_pit_stops").insert(psInserts); if (error) throw error; }

        await supabase.from("v2_incidents").delete().eq("session_id", sessionId!);
        const incInserts = incidents.filter(i => i.description).map(i => ({ session_id: sessionId!, lap_number: i.lap_number ? parseInt(i.lap_number) : null, description: i.description || null, penalty_type: i.penalty_type || null, outcome: i.outcome || null, driver_ids: [] as string[] }));
        if (incInserts.length) { const { error } = await supabase.from("v2_incidents").insert(incInserts); if (error) throw error; }
      }

      // Persist column order and optionally publish
      const sessionUpdate: any = { column_order: columnOrder };
      if (publish) {
        sessionUpdate.status = "published";
      }
      await supabase.from("v2_sessions").update(sessionUpdate).eq("id", sessionId!);

      qc.invalidateQueries({ queryKey: ["v2_sessions"] });
      toast.success(publish ? "Published!" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }, [session, sessionId, rows, pitStops, incidents, customColumns, columnOrder, qc]);

  if (!session) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const isRace = type === "race" || type === "sprint_race";
  const isQual = type === "qualifying" || type === "sprint_qualifying";
  const sourceDoc = (session as any).source_document_url;

  // Column label map
  const colLabels: Record<string, string> = {
    position: "Pos", car_number: "No.", driver: "Driver", nat: "Nat", team: "Team", car: "Car",
    best_lap_time: "Best Lap", gap_to_p1: "Gap", gap_int: "Int", laps_run: "Laps", notes: "Notes",
    q1_time: "Q1", q2_time: "Q2", q3_time: "Q3", best_time: "Best", gap_to_pole: "Gap",
    laps_completed: "Laps", total_time: "Time/Gap", fastest_lap_time: "FL", average_lap_time: "Avg",
    pit_stops: "Pits", points: "Pts", status: "Status",
  };
  for (const col of customColumns) {
    colLabels[`_custom_${col.key}`] = col.name;
  }

  // Filter columns based on qual segments
  const visibleColumns = columnOrder.filter(col => {
    if (isQual && col === "q2_time" && qualSegments < 2) return false;
    if (isQual && col === "q3_time" && qualSegments < 3) return false;
    return true;
  });

  // Render cell for a column
  const renderCell = (row: ResultRow, col: string) => {
    if (col === "position") return <Input value={row.position} onChange={e => updateRow(row._key, "position", e.target.value)} className="h-7 w-12 text-xs text-center" />;
    if (col === "car_number") return <Input value={row.car_number} onChange={e => updateRow(row._key, "car_number", e.target.value)} className="h-7 w-14 text-xs text-center" placeholder="#" />;
    if (col === "driver") return <AutocompleteField entityType="driver" value={row.driver} onChange={v => handleDriverChange(row._key, v)} />;
    if (col === "nat") return <FlagImage nationality={row._driverNationality} size={18} />;
    if (col === "team") return <AutocompleteField entityType="team" value={row.team} onChange={v => updateRow(row._key, "team", v)} />;
    if (col === "car") return <AutocompleteField entityType="car" value={row.car} onChange={v => updateRow(row._key, "car", v)} />;
    if (col === "status") return (
      <div>
        <Select value={row.status} onValueChange={v => updateRow(row._key, "status", v)}>
          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{RACE_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s.toUpperCase()}</SelectItem>)}</SelectContent>
        </Select>
        {row.status === "dnf" && <Input value={row.dnf_reason} onChange={e => updateRow(row._key, "dnf_reason", e.target.value)} className="h-6 text-xs mt-1" placeholder="DNF reason" />}
      </div>
    );
    if (col.startsWith("_custom_")) {
      const customCol = customColumns.find(c => `_custom_${c.key}` === col);
      return <Input type={customCol?.type === "number" ? "number" : "text"} value={row[col] || ""} onChange={e => updateRow(row._key, col, e.target.value)} className="h-7 text-xs" />;
    }
    // Generic text/number fields
    const placeholder = col.includes("time") || col.includes("lap") || col === "gap_to_p1" || col === "gap_to_pole" || col === "gap_int" ? "1:23.456" : "";
    const isSmall = ["laps_run", "laps_completed", "pit_stops", "points"].includes(col);
    return <Input value={row[col] || ""} onChange={e => updateRow(row._key, col, e.target.value)} className={`h-7 text-xs ${isSmall ? "w-14" : ""}`} placeholder={placeholder} />;
  };

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
        <div className="flex gap-2 items-center">
          {sourceDoc && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
              supabase.storage.from("session-documents").createSignedUrl(sourceDoc, 3600).then(({ data }) => {
                if (data?.signedUrl) window.open(data.signedUrl, "_blank");
              });
            }}>
              <FileText className="h-4 w-4 mr-1" />View PDF
            </Button>
          )}
          <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) handlePdfImport(e.target.files[0]); }} />
          <Button variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            {importing ? "Importing…" : "Import PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)}>
            <Columns className="h-4 w-4 mr-1" />Add Column
          </Button>
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

      {customColumns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Custom columns:</span>
          {customColumns.map(col => (
            <Badge key={col.key} variant="secondary" className="text-xs gap-1">
              {col.name} ({col.type})
              <button onClick={() => removeCustomColumn(col.key)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-1 py-2 w-6" /> {/* drag handle column */}
              {visibleColumns.map((col, colIdx) => (
                <th
                  key={col}
                  className="px-2 py-2 text-left cursor-grab select-none"
                  draggable
                  onDragStart={() => handleColDragStart(colIdx)}
                  onDragOver={handleColDragOver}
                  onDrop={() => handleColDrop(colIdx)}
                >
                  <span className="inline-flex items-center gap-1">
                    <GripVertical className="h-3 w-3 text-muted-foreground/50 rotate-90" />
                    {colLabels[col] || col}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={row._key}
                className={`border-t border-border hover:bg-muted/20 ${dragRowIdx === rowIdx ? "opacity-50" : ""}`}
                draggable
                onDragStart={() => handleRowDragStart(rowIdx)}
                onDragOver={e => handleRowDragOver(e, rowIdx)}
                onDrop={() => handleRowDrop(rowIdx)}
              >
                <td className="px-1 py-1 cursor-grab"><GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" /></td>
                {visibleColumns.map(col => (
                  <td key={col} className="px-1 py-1">{renderCell(row, col)}</td>
                ))}
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

      {/* Add Column Dialog */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Custom Column</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Column Name *</Label>
              <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="e.g. Sector 1, Class" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newColType} onValueChange={v => setNewColType(v as "text" | "number")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColOpen(false)}>Cancel</Button>
            <Button onClick={addCustomColumn} disabled={!newColName.trim()}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
