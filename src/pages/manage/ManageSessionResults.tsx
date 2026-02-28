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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, X, ChevronDown, Upload, FileText, Loader2, Columns, GripVertical, Braces, Copy, Check } from "lucide-react";
import { parseTime, formatLapTime, formatGap } from "@/lib/time-calc";

type Ref = { id: string; label: string } | null;

interface CustomColumn {
  key: string;
  name: string;
  type: "text" | "number" | "points";
}

interface ResultRow {
  _key: string;
  position: string;
  car_number: string;
  driver: Ref;
  additionalDrivers: Ref[];
  team: Ref;
  car: Ref;
  _driverNationality?: string | null;
  _additionalDriverNationalities?: (string | null)[];
  [key: string]: any;
}

const RACE_STATUSES = ["finished", "dnf", "dns", "dsq", "classified"];

const makeKey = () => Math.random().toString(36).slice(2, 10);

const blankRow = (pos: number, type: string, customCols: CustomColumn[] = []): ResultRow => {
  const base: ResultRow = { _key: makeKey(), position: String(pos), car_number: "", driver: null, additionalDrivers: [], team: null, car: null, _driverNationality: null, _additionalDriverNationalities: [] };
  if (type === "practice") { base.best_lap_time = ""; base.gap_to_p1 = ""; base.gap_int = ""; base.laps_run = ""; base.notes = ""; }
  else if (type === "qualifying" || type === "sprint_qualifying") { base.q1_time = ""; base.q2_time = ""; base.q3_time = ""; base.best_time = ""; base.gap_to_pole = ""; base.gap_int = ""; base.laps_run = ""; base.points = ""; }
  else if (type === "race" || type === "sprint_race" || type === "endurance_race") { base.laps_completed = ""; base.total_time = ""; base.gap_to_leader = ""; base.fastest_lap_time = ""; base.average_lap_time = ""; base.pit_stops = ""; base.points = ""; base.status = "finished"; base.dnf_reason = ""; base.dnf_explanation = ""; base.gap_int = ""; }
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
  return "gap_to_leader";
}

function recalcFromBestLap(rows: ResultRow[], _type: string): ResultRow[] {
  // No auto-calculation — Gap and Int are manually filled
  return rows;
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
      const { data, error } = await supabase.from("v2_sessions").select("*, v2_events(name, circuit_id, season_id)").eq("id", sessionId!).single();
      if (error) throw error;
      return data;
    },
  });

  const seasonId = (session as any)?.v2_events?.season_id;

  const { data: seasonData } = useQuery({
    queryKey: ["v2_season_for_session", seasonId],
    queryFn: async () => {
      const { data } = await supabase.from("v2_seasons").select("id, is_multiclass, cdm").eq("id", seasonId).single();
      return data;
    },
    enabled: !!seasonId,
  });

  const isMulticlass = !!(seasonData as any)?.is_multiclass;

  const { data: seasonClasses = [] } = useQuery({
    queryKey: ["v2_season_classes_for_session", seasonId],
    queryFn: async () => {
      const { data } = await supabase.from("v2_season_classes" as any).select("*").eq("season_id", seasonId).order("sort_order");
      return (data || []) as any[];
    },
    enabled: !!seasonId && isMulticlass,
  });


  const type = session?.session_type || "other";
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [pitStops, setPitStops] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [flagSegments, setFlagSegments] = useState<{ _key: string; flag_state: string; start_elapsed: string; end_elapsed: string }[]>([]);
  const [annotations, setAnnotations] = useState<{ _key: string; title: string; items: { _key: string; description: string; color: string }[] }[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [qualSegments, setQualSegments] = useState(3);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "number" | "points">("text");
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonApplying, setJsonApplying] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  // Drag state for rows
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  // Drag state for columns
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);

  // Column order management
  const getDefaultColumns = useCallback(() => {
    const cols: string[] = ["position"];
    if (isMulticlass) cols.push("_pic", "_class");
    cols.push("car_number", "driver", "nat", "team", "car");
    if (type === "practice") cols.push("best_lap_time", "gap_to_p1", "gap_int", "laps_run", "notes");
    else if (type === "qualifying" || type === "sprint_qualifying") cols.push("q1_time", "q2_time", "q3_time", "best_time", "gap_to_pole", "gap_int", "laps_run", "points");
    else if (type === "race" || type === "sprint_race" || type === "endurance_race") cols.push("laps_completed", "total_time", "gap_to_leader", "gap_int", "fastest_lap_time", "average_lap_time", "pit_stops", "points", "status");
    else cols.push("notes");
    return cols;
  }, [type, isMulticlass]);

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
      // No saved order — always use the fresh defaults (ensures multiclass columns appear in correct position)
      const defaults = getDefaultColumns();
      const customKeys = customColumns.map(c => `_custom_${c.key}`);
      setColumnOrder([...defaults, ...customKeys]);
    }
  }, [session, type, customColumns, getDefaultColumns]);

  // Load existing data
  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const t = session.session_type;
      let table = "v2_practice_results";
      if (t === "qualifying" || t === "sprint_qualifying") table = "v2_qualifying_results";
      else if (t === "race" || t === "sprint_race" || t === "endurance_race") table = "v2_race_results";

      const { data } = await supabase.from(table as any).select("*, v2_drivers(id, full_name, nationality), v2_teams(id, full_name), v2_cars(id, model_name, manufacturer)").eq("session_id", sessionId!).order("position");

      if (data && data.length > 0) {
        // Extract custom columns from extra_data (excluding "Int" which is built-in)
        const foundCustomCols: CustomColumn[] = [];
        const seenKeys = new Set<string>();
        // Detect which columns are "points" type from _points_columns metadata
        const pointsColumnNames = new Set<string>();
        for (const r of data) {
          const ed = (r as any).extra_data;
          if (ed?._points_columns && Array.isArray(ed._points_columns)) {
            for (const p of ed._points_columns) pointsColumnNames.add(p);
          }
        }
        for (const r of data) {
          const ed = (r as any).extra_data;
          if (ed && typeof ed === "object") {
            for (const k of Object.keys(ed)) {
              if (k === "Int" || k === "Class" || k === "PIC" || k === "_points_columns") continue; // built-in / metadata
              if (!seenKeys.has(k)) {
                seenKeys.add(k);
                const colType = pointsColumnNames.has(k) ? "points" : (typeof ed[k] === "number" ? "number" : "text");
                foundCustomCols.push({ key: k, name: k, type: colType });
              }
            }
          }
        }
        if (foundCustomCols.length > 0) setCustomColumns(foundCustomCols);

        // Group rows by car_number to find additional drivers for same car
        const rowsByCarNumber = new Map<string, any[]>();
        for (const r of data) {
          const cn = (r as any).car_number;
          if (cn) {
            if (!rowsByCarNumber.has(cn)) rowsByCarNumber.set(cn, []);
            rowsByCarNumber.get(cn)!.push(r);
          }
        }

        // Deduplicate: keep only one row per car_number (lowest position), store extra drivers
        const seenCarNumbers = new Set<string>();
        const mappedRows: ResultRow[] = [];
        
        for (const r of data as any[]) {
          const cn = r.car_number || "";
          // If we've already created a row for this car_number, skip
          if (cn && seenCarNumbers.has(cn)) continue;
          if (cn) seenCarNumbers.add(cn);

          // Find additional drivers for this car_number
          const sameCarRows = cn ? (rowsByCarNumber.get(cn) || []) : [];
          const otherDrivers = sameCarRows
            .filter((o: any) => o.id !== r.id && o.v2_drivers)
            .map((o: any) => ({ id: o.v2_drivers.id, label: o.v2_drivers.full_name }));
          const otherNationalities = sameCarRows
            .filter((o: any) => o.id !== r.id && o.v2_drivers)
            .map((o: any) => o.v2_drivers?.nationality || null);

          const row: ResultRow = {
            _key: r.id,
            position: String(r.position || ""),
            car_number: cn,
            driver: r.v2_drivers ? { id: r.v2_drivers.id, label: r.v2_drivers.full_name } : null,
            additionalDrivers: otherDrivers,
            team: r.v2_teams ? { id: r.v2_teams.id, label: r.v2_teams.full_name } : null,
            car: r.v2_cars ? { id: r.v2_cars.id, label: [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") } : null,
            _driverNationality: r.v2_drivers?.nationality || null,
            _additionalDriverNationalities: otherNationalities,
          };
          if (t === "practice") { row.best_lap_time = r.best_lap_time || ""; row.gap_to_p1 = r.gap_to_p1 || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; row.notes = ""; row.gap_int = (r.extra_data as any)?.Int || ""; }
          else if (t === "qualifying" || t === "sprint_qualifying") { row.q1_time = r.q1_time || ""; row.q2_time = r.q2_time || ""; row.q3_time = r.q3_time || ""; row.best_time = r.best_time || ""; row.gap_to_pole = r.gap_to_pole || ""; row.laps_run = r.laps_run != null ? String(r.laps_run) : ""; row.gap_int = (r.extra_data as any)?.Int || ""; row.points = r.points != null ? String(r.points) : ""; }
          else if (t === "race" || t === "sprint_race" || t === "endurance_race") { row.laps_completed = r.laps_completed != null ? String(r.laps_completed) : ""; row.total_time = r.total_time || ""; row.gap_to_leader = r.gap_to_leader || ""; row.fastest_lap_time = r.fastest_lap_time || ""; row.average_lap_time = r.average_lap_time || ""; row.pit_stops = r.pit_stops != null ? String(r.pit_stops) : ""; row.points = r.points != null ? String(r.points) : ""; row.status = r.status || "finished"; row.dnf_reason = r.dnf_reason || ""; row.dnf_explanation = (r as any).dnf_explanation || ""; row.gap_int = (r.extra_data as any)?.Int || ""; }
          else { row.notes = ""; }
          // Load class/PIC and custom column data from extra_data
          const ed = (r as any).extra_data;
          if (ed && typeof ed === "object") {
            if (ed.Class) row._class = String(ed.Class);
            if (ed.PIC) row._pic = String(ed.PIC);
            for (const k of Object.keys(ed)) {
              if (k === "Int" || k === "Class" || k === "PIC") continue;
              row[`_custom_${k}`] = String(ed[k] ?? "");
            }
          }
          mappedRows.push(row);
        }
        setRows(mappedRows);
      } else {
        setRows([blankRow(1, t)]);
      }

      if (t === "race" || t === "sprint_race" || t === "endurance_race") {
        const { data: ps } = await supabase.from("v2_pit_stops").select("*, v2_drivers(id, full_name)").eq("session_id", sessionId!).order("lap_number");
        setPitStops((ps || []).map((p: any) => ({ _key: p.id, driver: p.v2_drivers ? { id: p.v2_drivers.id, label: p.v2_drivers.full_name } : null, lap_number: String(p.lap_number || ""), stop_duration: p.stop_duration || "", total_pit_time: p.total_pit_time || "" })));
        const { data: inc } = await supabase.from("v2_incidents").select("*").eq("session_id", sessionId!).order("lap_number");
        setIncidents((inc || []).map((i: any) => ({ _key: i.id, lap_number: String(i.lap_number || ""), description: i.description || "", penalty_type: i.penalty_type || "", outcome: i.outcome || "" })));
      }

      // Load annotation sections for ALL session types
      const { data: sections } = await supabase.from("v2_annotation_sections" as any).select("*, v2_annotation_items(*)").eq("session_id", sessionId!).order("sort_order");
      if (sections && (sections as any[]).length > 0) {
        setAnnotations((sections as any[]).map((s: any) => ({
          _key: s.id,
          title: s.title,
          items: (s.v2_annotation_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((item: any) => ({
            _key: item.id,
            description: item.description || "",
            color: item.color || "#ef4444",
          })),
        })));
      }

      // Load flag segments
      const { data: flags } = await supabase.from("v2_flag_segments" as any).select("*").eq("session_id", sessionId!).order("start_elapsed", { ascending: true });
      if (flags && (flags as any[]).length > 0) {
        setFlagSegments((flags as any[]).map((f: any) => ({
          _key: f.id,
          flag_state: f.flag_state || "GREEN",
          start_elapsed: String(f.start_elapsed ?? ""),
          end_elapsed: String(f.end_elapsed ?? ""),
        })));
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
            const myTime = p1Time + gapMs;
            newRows[rowIdx] = { ...newRows[rowIdx], [bestField]: formatLapTime(myTime) };
            // Recalculate int
            const prevTime = parseTime(newRows[rowIdx - 1]?.[bestField] || "");
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
    toast.success(`Column "${col.name}" added${col.type === "points" ? " (counts toward standings)" : ""}`);
  };

  // --- JSON Template Import ---
  const generateTemplate = () => {
    const example: Record<string, any> = { position: 1, car_number: "44", driver_name: "Driver Name", team_name: "Team Name", car_name: "Car Model" };
    if (type === "practice" || type === "warmup" || type === "other") {
      example.best_lap_time = "1:23.456";
      example.gap_to_p1 = "+0.123";
      example.gap_int = "+0.123";
      example.laps_run = 15;
    } else if (type === "qualifying" || type === "sprint_qualifying") {
      example.q1_time = "1:24.000";
      example.q2_time = "1:23.500";
      if (qualSegments >= 3) example.q3_time = "1:23.000";
      example.best_time = "1:23.000";
      example.gap_to_pole = "+0.123";
      example.gap_int = "+0.123";
      example.laps_run = 12;
    } else if (type === "race" || type === "sprint_race" || type === "endurance_race") {
      example.laps_completed = 50;
      example.total_time = "1:32:45.123";
      example.gap_to_leader = "+0.914";
      example.gap_int = "+0.914";
      example.fastest_lap_time = "1:23.456";
      example.pit_stops = 2;
      example.points = 25;
      example.status = "finished";
    }
    for (const col of customColumns) {
      example[col.name] = col.type === "number" ? 0 : "";
    }
    return JSON.stringify([example], null, 2);
  };

  const handleOpenJsonDialog = () => {
    setJsonText(generateTemplate());
    setJsonCopied(false);
    setJsonDialogOpen(true);
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(generateTemplate());
      setJsonCopied(true);
      toast.success("Template copied to clipboard");
      setTimeout(() => setJsonCopied(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  const handleApplyJson = async () => {
    setJsonApplying(true);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array of objects");
      if (parsed.length === 0) throw new Error("Array is empty");
      if (typeof parsed[0] !== "object" || parsed[0] === null) throw new Error("Each entry must be an object");

      const { data: existingDrivers } = await supabase.from("v2_drivers").select("id, full_name, nationality");
      const { data: existingTeams } = await supabase.from("v2_teams").select("id, full_name");
      const { data: existingCars } = await supabase.from("v2_cars").select("id, model_name, manufacturer");
      const driverList = (existingDrivers || []).map(d => ({ id: d.id, label: d.full_name, nationality: d.nationality }));
      const teamList = (existingTeams || []).map(t => ({ id: t.id, label: t.full_name }));
      const carList = (existingCars || []).map(c => ({ id: c.id, label: [c.manufacturer, c.model_name].filter(Boolean).join(" ") }));

      // Detect any new custom columns from the JSON keys
      const knownKeys = new Set(["position", "car_number", "driver_name", "team_name", "car_name",
        "best_lap_time", "gap_to_p1", "gap_int", "laps_run", "notes",
        "q1_time", "q2_time", "q3_time", "best_time", "gap_to_pole",
        "laps_completed", "total_time", "gap_to_leader", "fastest_lap_time", "average_lap_time", "pit_stops", "points", "status", "dnf_reason"]);
      const existingCustomNames = new Set(customColumns.map(c => c.name));
      const newCustomCols: CustomColumn[] = [];
      for (const entry of parsed) {
        for (const k of Object.keys(entry)) {
          if (!knownKeys.has(k) && !existingCustomNames.has(k) && !newCustomCols.find(c => c.name === k)) {
            newCustomCols.push({ key: makeKey(), name: k, type: typeof entry[k] === "number" ? "number" : "text" });
          }
        }
      }
      const allCustom = [...customColumns, ...newCustomCols];
      if (newCustomCols.length > 0) setCustomColumns(allCustom);

      const newRows: ResultRow[] = [];
      for (const entry of parsed) {
        const row = blankRow(entry.position || newRows.length + 1, type, allCustom);
        row.position = String(entry.position ?? newRows.length + 1);
        row.car_number = String(entry.car_number ?? "");

        if (entry.driver_name) {
          let match = fuzzyMatch(entry.driver_name, driverList);
          if (!match) {
            const { data: newDriver } = await supabase.from("v2_drivers").insert({ full_name: entry.driver_name }).select("id, full_name, nationality").single();
            if (newDriver) {
              match = { id: newDriver.id, label: newDriver.full_name };
              driverList.push({ ...match, nationality: newDriver.nationality });
            }
          }
          row.driver = match;
          const driverData = driverList.find(d => d.id === match?.id);
          row._driverNationality = driverData?.nationality || null;
        }

        if (entry.team_name) {
          let match = fuzzyMatch(entry.team_name, teamList);
          if (!match) {
            const { data: newTeam } = await supabase.from("v2_teams").insert({ full_name: entry.team_name }).select("id, full_name").single();
            if (newTeam) {
              match = { id: newTeam.id, label: newTeam.full_name };
              teamList.push(match);
            }
          }
          row.team = match;
        }

        if (entry.car_name) {
          let match = fuzzyMatch(entry.car_name, carList);
          if (!match) {
            const { data: newCar } = await supabase.from("v2_cars").insert({ model_name: entry.car_name }).select("id, model_name, manufacturer").single();
            if (newCar) {
              match = { id: newCar.id, label: [newCar.manufacturer, newCar.model_name].filter(Boolean).join(" ") };
              carList.push(match);
            }
          }
          row.car = match;
        }

        // Map type-specific fields
        if (type === "practice" || type === "warmup" || type === "other") {
          row.best_lap_time = entry.best_lap_time ?? "";
          row.gap_to_p1 = entry.gap_to_p1 ?? "";
          row.gap_int = entry.gap_int ?? "";
          row.laps_run = entry.laps_run != null ? String(entry.laps_run) : "";
        } else if (type === "qualifying" || type === "sprint_qualifying") {
          row.q1_time = entry.q1_time ?? "";
          row.q2_time = entry.q2_time ?? "";
          row.q3_time = entry.q3_time ?? "";
          row.best_time = entry.best_time ?? "";
          row.gap_to_pole = entry.gap_to_pole ?? "";
          row.gap_int = entry.gap_int ?? "";
          row.laps_run = entry.laps_run != null ? String(entry.laps_run) : "";
        } else if (type === "race" || type === "sprint_race" || type === "endurance_race") {
          row.laps_completed = entry.laps_completed != null ? String(entry.laps_completed) : "";
          row.total_time = entry.total_time ?? "";
          row.gap_to_leader = entry.gap_to_leader ?? "";
          row.gap_int = entry.gap_int ?? "";
          row.fastest_lap_time = entry.fastest_lap_time ?? "";
          row.average_lap_time = entry.average_lap_time ?? "";
          row.pit_stops = entry.pit_stops != null ? String(entry.pit_stops) : "";
          row.points = entry.points != null ? String(entry.points) : "";
          row.status = entry.status ?? "finished";
          row.dnf_reason = entry.dnf_reason ?? "";
        }

        // Map custom columns
        for (const col of allCustom) {
          if (entry[col.name] !== undefined) {
            row[`_custom_${col.key}`] = String(entry[col.name]);
          }
        }

        newRows.push(row);
      }

      // Auto-calculate Gap, Int
      const recalced = recalcFromBestLap(newRows, type);
      setRows(recalced);
      setJsonDialogOpen(false);
      toast.success(`Applied ${recalced.length} rows from JSON`);
    } catch (e: any) {
      toast.error(e.message || "Invalid JSON");
    } finally {
      setJsonApplying(false);
    }
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

  const handleDocUpload = async (file: File) => {
    setImporting(true);
    try {
      const storagePath = `${sessionId}/${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("session-documents").upload(storagePath, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;

      // Update session with document URL
      await supabase.from("v2_sessions").update({ source_document_url: storagePath } as any).eq("id", sessionId!);
      qc.invalidateQueries({ queryKey: ["v2_session", sessionId] });
      toast.success("Document uploaded successfully");
    } catch (e: any) {
      console.error("Upload error:", e);
      toast.error(e.message || "Upload failed");
    } finally {
      setImporting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  // Auto-calculate PIC (Position in Class) based on position and class assignment
  const recalcPIC = useCallback((currentRows: ResultRow[]): ResultRow[] => {
    if (!isMulticlass) return currentRows;
    const sorted = [...currentRows].sort((a, b) => (parseInt(a.position) || 999) - (parseInt(b.position) || 999));
    const classCounters: Record<string, number> = {};
    const picMap: Record<string, string> = {};
    for (const r of sorted) {
      const cls = r._class;
      if (cls) {
        classCounters[cls] = (classCounters[cls] || 0) + 1;
        picMap[r._key] = String(classCounters[cls]);
      } else {
        picMap[r._key] = "";
      }
    }
    return currentRows.map(r => ({ ...r, _pic: picMap[r._key] || "" }));
  }, [isMulticlass]);

  // Recalculate PIC when class or position changes - triggered via updateRow
  const picKeyRef = useRef("");
  useEffect(() => {
    if (!isMulticlass || rows.length === 0) return;
    const key = rows.map(r => `${r.position}:${r._class}`).join(",");
    if (key === picKeyRef.current) return;
    picKeyRef.current = key;
    const updated = recalcPIC(rows);
    // Only update if PIC values actually changed
    const changed = updated.some((r, i) => r._pic !== rows[i]._pic);
    if (changed) setRows(updated);
  }, [rows, isMulticlass, recalcPIC]);

  // Compute points total from custom "points" columns for a row
  const computeCustomPoints = (row: ResultRow): number => {
    let total = 0;
    for (const col of customColumns) {
      if (col.type === "points") {
        const val = row[`_custom_${col.key}`];
        if (val !== undefined && val !== "") total += parseFloat(val) || 0;
      }
    }
    return total;
  };

  // Build extra_data from custom columns + gap_int for a row
  const buildExtraData = (row: ResultRow): Record<string, any> => {
    const ed: Record<string, any> = {};
    // Store Int in extra_data
    if (row.gap_int) {
      ed["Int"] = row.gap_int;
    }
    // Store Class and PIC in extra_data for multiclass seasons
    if (row._class) ed["Class"] = row._class;
    if (row._pic) ed["PIC"] = row._pic;
    for (const col of customColumns) {
      const val = row[`_custom_${col.key}`];
      if (val !== undefined && val !== "") {
        ed[col.name] = (col.type === "number" || col.type === "points") ? parseFloat(val) || 0 : val;
      }
    }
    // Store column type metadata so "points" columns are restored correctly on reload
    const pointsCols = customColumns.filter(c => c.type === "points").map(c => c.name);
    if (pointsCols.length > 0) ed["_points_columns"] = pointsCols;
    return ed;
  };

  const handleSave = useCallback(async (publish: boolean) => {
    if (!session) return;
    setSaving(true);
    try {
      const t = session.session_type;
      if (t === "practice" || t === "warmup" || t === "other") {
        await supabase.from("v2_practice_results").delete().eq("session_id", sessionId!);
        const inserts = rows.filter(r => r.driver).map(r => {
          const customPts = computeCustomPoints(r);
          return { session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, driver_id: r.driver?.id || null, team_id: r.team?.id || null, car_id: r.car?.id || null, best_lap_time: r.best_lap_time || null, gap_to_p1: r.gap_to_p1 || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null, points: customPts || null, extra_data: buildExtraData(r) };
        });
        // Duplicate rows for additional drivers (same car gets same points)
        const allInserts: any[] = [];
        for (const r of rows.filter(r => r.driver)) {
          const customPts = computeCustomPoints(r);
          const basePts = r.points ? parseFloat(r.points) : 0;
          const totalPts = basePts + customPts;
          const base = { session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, team_id: r.team?.id || null, car_id: r.car?.id || null, best_lap_time: r.best_lap_time || null, gap_to_p1: r.gap_to_p1 || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null, points: totalPts || null, extra_data: buildExtraData(r) };
          allInserts.push({ ...base, driver_id: r.driver?.id || null });
          for (const ad of (r.additionalDrivers || [])) {
            if (ad) allInserts.push({ ...base, driver_id: ad.id });
          }
        }
        if (allInserts.length) { const { error } = await supabase.from("v2_practice_results").insert(allInserts as any); if (error) throw error; }
      } else if (t === "qualifying" || t === "sprint_qualifying") {
        await supabase.from("v2_qualifying_results").delete().eq("session_id", sessionId!);
        const qualInserts: any[] = [];
        for (const r of rows.filter(r => r.driver)) {
          const customPts = computeCustomPoints(r);
          const basePts = r.points ? parseFloat(r.points) : 0;
          const totalPts = basePts + customPts;
          const base = { session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, team_id: r.team?.id || null, car_id: r.car?.id || null, q1_time: r.q1_time || null, q2_time: r.q2_time || null, q3_time: r.q3_time || null, best_time: r.best_time || null, gap_to_pole: r.gap_to_pole || null, laps_run: r.laps_run ? parseInt(r.laps_run) : null, points: totalPts || null, extra_data: buildExtraData(r) };
          qualInserts.push({ ...base, driver_id: r.driver?.id || null });
          for (const ad of (r.additionalDrivers || [])) {
            if (ad) qualInserts.push({ ...base, driver_id: ad.id });
          }
        }
        if (qualInserts.length) { const { error } = await supabase.from("v2_qualifying_results").insert(qualInserts as any); if (error) throw error; }
      } else {
        await supabase.from("v2_race_results").delete().eq("session_id", sessionId!);
        const inserts: any[] = [];
        for (const r of rows.filter(r => r.driver)) {
          const customPts = computeCustomPoints(r);
          const basePts = r.points ? parseFloat(r.points) : 0;
          const totalPts = basePts + customPts;
          const base = { session_id: sessionId!, position: parseInt(r.position) || null, car_number: r.car_number || null, team_id: r.team?.id || null, car_id: r.car?.id || null, laps_completed: r.laps_completed ? parseInt(r.laps_completed) : null, total_time: r.total_time || null, gap_to_leader: r.gap_to_leader || null, fastest_lap_time: r.fastest_lap_time || null, average_lap_time: r.average_lap_time || null, pit_stops: r.pit_stops ? parseInt(r.pit_stops) : null, points: totalPts || null, status: (r.status || "finished") as any, dnf_reason: r.dnf_reason || null, dnf_explanation: r.dnf_explanation || null, extra_data: buildExtraData(r) };
          inserts.push({ ...base, driver_id: r.driver?.id || null });
          // Insert additional drivers with same car data
          for (const ad of (r.additionalDrivers || [])) {
            if (ad) inserts.push({ ...base, driver_id: ad.id });
          }
        }
        if (inserts.length) { const { error } = await supabase.from("v2_race_results").insert(inserts as any); if (error) throw error; }

        await supabase.from("v2_pit_stops").delete().eq("session_id", sessionId!);
        const psInserts = pitStops.filter(p => p.driver).map(p => ({ session_id: sessionId!, driver_id: p.driver?.id || null, lap_number: p.lap_number ? parseInt(p.lap_number) : null, stop_duration: p.stop_duration || null, total_pit_time: p.total_pit_time || null }));
        if (psInserts.length) { const { error } = await supabase.from("v2_pit_stops").insert(psInserts); if (error) throw error; }

        await supabase.from("v2_incidents").delete().eq("session_id", sessionId!);
        const incInserts = incidents.filter(i => i.description).map(i => ({ session_id: sessionId!, lap_number: i.lap_number ? parseInt(i.lap_number) : null, description: i.description || null, penalty_type: i.penalty_type || null, outcome: i.outcome || null, driver_ids: [] as string[] }));
        if (incInserts.length) { const { error } = await supabase.from("v2_incidents").insert(incInserts); if (error) throw error; }
      }

      // Save annotation sections for ALL session types
      // Delete existing sections (cascade deletes items)
      await supabase.from("v2_annotation_sections" as any).delete().eq("session_id", sessionId!);
      for (let si = 0; si < annotations.length; si++) {
        const section = annotations[si];
        const { data: newSection, error: secErr } = await supabase.from("v2_annotation_sections" as any).insert({ session_id: sessionId!, title: section.title, sort_order: si }).select("id").single();
        if (secErr) throw secErr;
        if (newSection && section.items.length > 0) {
          const itemInserts = section.items.filter(it => it.description).map((it, ii) => ({ section_id: (newSection as any).id, description: it.description, color: it.color, sort_order: ii }));
          if (itemInserts.length) {
            const { error: itemErr } = await supabase.from("v2_annotation_items" as any).insert(itemInserts);
            if (itemErr) throw itemErr;
          }
        }
      }

      // Save flag segments
      await supabase.from("v2_flag_segments" as any).delete().eq("session_id", sessionId!);
      const flagInserts = flagSegments
        .filter(f => f.start_elapsed !== "" && f.end_elapsed !== "")
        .map(f => ({
          session_id: sessionId!,
          flag_state: f.flag_state || "GREEN",
          start_elapsed: parseFloat(f.start_elapsed) || 0,
          end_elapsed: parseFloat(f.end_elapsed) || 0,
        }));
      if (flagInserts.length > 0) {
        const { error: flagErr } = await supabase.from("v2_flag_segments" as any).insert(flagInserts);
        if (flagErr) throw flagErr;
      }

      // Persist column order and optionally publish
      const sessionUpdate: any = { column_order: columnOrder };
      if (publish) {
        sessionUpdate.status = "published";
      }
      await supabase.from("v2_sessions").update(sessionUpdate).eq("id", sessionId!);

      // Trigger driver fingerprint recalculation for all drivers in this session
      const driverIdsInSession = [...new Set(rows.flatMap(r => [r.driver?.id, ...r.additionalDrivers.map(d => d?.id)]).filter(Boolean))] as string[];
      if (driverIdsInSession.length > 0) {
        supabase.functions.invoke("recalculate-driver-fingerprint", {
          body: { driver_ids: driverIdsInSession },
        }).catch(err => console.warn("Fingerprint recalc:", err));
      }

      qc.invalidateQueries({ queryKey: ["v2_sessions"] });
      toast.success(publish ? "Published!" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }, [session, sessionId, rows, pitStops, incidents, annotations, flagSegments, customColumns, columnOrder, qc]);

  if (!session) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const isRace = type === "race" || type === "sprint_race" || type === "endurance_race";
  const isQual = type === "qualifying" || type === "sprint_qualifying";
  const sourceDoc = (session as any).source_document_url;

  // Column label map
  const colLabels: Record<string, string> = {
    position: "Pos", _pic: "PIC", _class: "Class", car_number: "No.", driver: "Driver", nat: "Nat", team: "Team", car: "Car",
    best_lap_time: "Best Lap", gap_to_p1: "Gap", gap_int: "Int", laps_run: "Laps", notes: "Notes",
    q1_time: "Q1", q2_time: "Q2", q3_time: "Q3", best_time: "Best", gap_to_pole: "Gap",
    laps_completed: "Laps", total_time: "Time", gap_to_leader: "Gap", fastest_lap_time: "Best Lap", average_lap_time: "Avg Lap",
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
    if (col === "_class") {
      if (seasonClasses.length > 0) {
        return (
          <Select value={row._class || ""} onValueChange={v => updateRow(row._key, "_class", v)}>
            <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="Class…" /></SelectTrigger>
            <SelectContent>{seasonClasses.map((sc: any) => <SelectItem key={sc.id} value={sc.class_name} className="text-xs">{sc.class_name}</SelectItem>)}</SelectContent>
          </Select>
        );
      }
      return <Input value={row._class || ""} onChange={e => updateRow(row._key, "_class", e.target.value)} className="h-7 w-20 text-xs" placeholder="Class" />;
    }
    if (col === "_pic") {
      // PIC is auto-calculated, show read-only
      return <span className="text-xs text-muted-foreground px-1">{row._pic || "—"}</span>;
    }
    if (col === "car_number") return <Input value={row.car_number} onChange={e => updateRow(row._key, "car_number", e.target.value)} className="h-7 w-14 text-xs text-center" placeholder="#" />;
    if (col === "driver") return (
      <div className="space-y-1">
        <AutocompleteField entityType="driver" value={row.driver} onChange={v => handleDriverChange(row._key, v)} />
        {(row.additionalDrivers || []).map((ad: Ref, idx: number) => (
          <div key={idx} className="flex items-center gap-1">
            <AutocompleteField entityType="driver" value={ad} onChange={v => {
              setRows(prev => prev.map(r => {
                if (r._key !== row._key) return r;
                const newAd = [...(r.additionalDrivers || [])];
                const newNats = [...(r._additionalDriverNationalities || [])];
                if (v) { newAd[idx] = v; } else { newAd.splice(idx, 1); newNats.splice(idx, 1); }
                return { ...r, additionalDrivers: newAd, _additionalDriverNationalities: newNats };
              }));
              if (v) {
                supabase.from("v2_drivers").select("nationality").eq("id", v.id).single().then(({ data }) => {
                  if (data) setRows(prev => prev.map(r => {
                    if (r._key !== row._key) return r;
                    const newNats = [...(r._additionalDriverNationalities || [])];
                    newNats[idx] = data.nationality;
                    return { ...r, _additionalDriverNationalities: newNats };
                  }));
                });
              }
            }} />
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive shrink-0" onClick={() => {
              setRows(prev => prev.map(r => {
                if (r._key !== row._key) return r;
                const newAd = [...(r.additionalDrivers || [])]; newAd.splice(idx, 1);
                const newNats = [...(r._additionalDriverNationalities || [])]; newNats.splice(idx, 1);
                return { ...r, additionalDrivers: newAd, _additionalDriverNationalities: newNats };
              }));
            }}><X className="h-3 w-3" /></Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1 text-muted-foreground" onClick={() => {
          setRows(prev => prev.map(r => r._key === row._key ? { ...r, additionalDrivers: [...(r.additionalDrivers || []), null], _additionalDriverNationalities: [...(r._additionalDriverNationalities || []), null] } : r));
        }}>+ driver</Button>
      </div>
    );
    if (col === "nat") return (
      <div className="space-y-1">
        <FlagImage nationality={row._driverNationality} size={18} />
        {(row._additionalDriverNationalities || []).map((nat: string | null, idx: number) => (
          <FlagImage key={idx} nationality={nat} size={18} />
        ))}
      </div>
    );
    if (col === "team") return <AutocompleteField entityType="team" value={row.team} onChange={v => updateRow(row._key, "team", v)} />;
    if (col === "car") return <AutocompleteField entityType="car" value={row.car} onChange={v => updateRow(row._key, "car", v)} />;
    if (col === "status") {
      const DNF_REASONS = ["Mechanical Failure", "Technical Failure (Non-Contact)", "Not At Fault – Contact", "At Fault – Penalized", "At Fault – Self-Inflicted (No Penalty)", "Other"];
      const DSQ_REASONS = ["Technical", "Driving Conduct"];
      const showReason = row.status === "dnf" || row.status === "dsq";
      const reasonOptions = row.status === "dnf" ? DNF_REASONS : DSQ_REASONS;
      return (
        <div>
          <Select value={row.status} onValueChange={v => { updateRow(row._key, "status", v); if (v !== "dnf" && v !== "dsq") { updateRow(row._key, "dnf_reason", ""); updateRow(row._key, "dnf_explanation", ""); } }}>
            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{RACE_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s.toUpperCase()}</SelectItem>)}</SelectContent>
          </Select>
          {showReason && (
            <>
              <Select value={row.dnf_reason || ""} onValueChange={v => updateRow(row._key, "dnf_reason", v)}>
                <SelectTrigger className="h-6 text-xs mt-1 w-28"><SelectValue placeholder="Reason…" /></SelectTrigger>
                <SelectContent>{reasonOptions.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={row.dnf_explanation || ""} onChange={e => updateRow(row._key, "dnf_explanation", e.target.value)} className="h-6 text-xs mt-1 w-40" placeholder="Brief explanation…" />
            </>
          )}
        </div>
      );
    }
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
              <FileText className="h-4 w-4 mr-1" />View Document
            </Button>
          )}
          <input ref={pdfInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff" className="hidden" onChange={e => { if (e.target.files?.[0]) handleDocUpload(e.target.files[0]); }} />
          <Button variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            {importing ? "Uploading…" : "Upload Document"}
           </Button>
          <Button variant="outline" size="sm" onClick={handleOpenJsonDialog}>
            <Braces className="h-4 w-4 mr-1" />JSON
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
          <span className="text-muted-foreground">Qualifying format:</span>
          <Select value={String(qualSegments)} onValueChange={v => setQualSegments(Number(v))}>
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">F1 Style (Q1 / Q2 / Q3)</SelectItem>
              <SelectItem value="2">Two Segments (Q1 / Q2)</SelectItem>
              <SelectItem value="1">Single Session / Hyperpole</SelectItem>
            </SelectContent>
          </Select>
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

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium"><ChevronDown className="h-4 w-4" />Flag Segments</CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Add flag periods (GREEN, YELLOW, RED, FCY, SC). Times in seconds from race start.</p>
              {flagSegments.map((f, i) => (
                <div key={f._key} className="flex items-center gap-2">
                  <Select value={f.flag_state} onValueChange={v => setFlagSegments(fs => fs.map((ff, j) => j === i ? { ...ff, flag_state: v } : ff))}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GREEN", "YELLOW", "RED", "FCY", "SC"].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={f.start_elapsed} onChange={e => setFlagSegments(fs => fs.map((ff, j) => j === i ? { ...ff, start_elapsed: e.target.value } : ff))} className="h-7 w-24 text-xs" placeholder="Start (sec)" type="number" />
                  <Input value={f.end_elapsed} onChange={e => setFlagSegments(fs => fs.map((ff, j) => j === i ? { ...ff, end_elapsed: e.target.value } : ff))} className="h-7 w-24 text-xs" placeholder="End (sec)" type="number" />
                  <span className="text-[10px] text-muted-foreground w-20">
                    {f.start_elapsed && f.end_elapsed ? `${Math.round((parseFloat(f.end_elapsed) - parseFloat(f.start_elapsed)) / 60)}m` : ""}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setFlagSegments(fs => fs.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFlagSegments(fs => [...fs, { _key: makeKey(), flag_state: "GREEN", start_elapsed: "", end_elapsed: "" }])}><Plus className="h-3 w-3 mr-1" />Add Flag Segment</Button>
                {flagSegments.length === 0 && (
                  <Button variant="outline" size="sm" onClick={() => {
                    // Quick-fill: single green flag for entire race duration
                    const maxLaps = Math.max(...rows.map(r => parseInt(r.laps_completed) || 0), 0);
                    const totalTime = rows[0]?.total_time;
                    let endSec = 0;
                    if (totalTime) {
                      // Parse time like "1:32:45.123" or "23:45:12.456"
                      const parts = totalTime.split(":");
                      if (parts.length === 3) endSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
                      else if (parts.length === 2) endSec = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
                    }
                    if (endSec > 0) {
                      setFlagSegments([{ _key: makeKey(), flag_state: "GREEN", start_elapsed: "0", end_elapsed: String(Math.ceil(endSec)) }]);
                      toast.success("Added full-race green flag segment");
                    } else {
                      toast.error("Enter race results first to auto-fill");
                    }
                  }}>Quick Fill (All Green)</Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Custom Annotation Sections — available for ALL session types */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Custom Sections</h3>
        {annotations.map((section, si) => (
          <Collapsible key={section._key} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
              <ChevronDown className="h-4 w-4" />{section.title || "Untitled Section"}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Input
                  value={section.title}
                  onChange={e => setAnnotations(prev => prev.map((s, i) => i === si ? { ...s, title: e.target.value } : s))}
                  className="h-7 w-48 text-xs"
                  placeholder="Section title"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setAnnotations(prev => prev.filter((_, i) => i !== si))}><X className="h-3 w-3" /></Button>
              </div>
              {section.items.map((item, ii) => (
                <div key={item._key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={item.color}
                    onChange={e => setAnnotations(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, color: e.target.value } : it) } : s))}
                    className="h-7 w-8 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={item.description}
                    onChange={e => setAnnotations(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, description: e.target.value } : it) } : s))}
                    className="h-7 flex-1 text-xs"
                    placeholder="Description"
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setAnnotations(prev => prev.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s))}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAnnotations(prev => prev.map((s, i) => i === si ? { ...s, items: [...s.items, { _key: makeKey(), description: "", color: "#ef4444" }] } : s))}>
                <Plus className="h-3 w-3 mr-1" />Add Item
              </Button>
            </CollapsibleContent>
          </Collapsible>
        ))}
        <Button variant="outline" size="sm" onClick={() => setAnnotations(prev => [...prev, { _key: makeKey(), title: "", items: [] }])}>
          <Plus className="h-3 w-3 mr-1" />Add Section
        </Button>
      </div>

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
              <Select value={newColType} onValueChange={v => setNewColType(v as "text" | "number" | "points")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="points">Points</SelectItem>
                </SelectContent>
              </Select>
              {newColType === "points" && (
                <p className="text-xs text-muted-foreground mt-1">Values in this column will count toward championship standings for the car number (all drivers sharing the car get the same points).</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColOpen(false)}>Cancel</Button>
            <Button onClick={addCustomColumn} disabled={!newColName.trim()}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON Import Dialog */}
      <Dialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>JSON Import</DialogTitle>
            <p className="text-xs text-muted-foreground">Paste a JSON array of result objects. Unknown keys become custom columns automatically.</p>
          </DialogHeader>
          <div className="flex-1 min-h-0 space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyTemplate}>
                {jsonCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {jsonCopied ? "Copied!" : "Copy Template"}
              </Button>
            </div>
            <Textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              className="font-mono text-xs min-h-[350px] flex-1"
              placeholder='[{"position": 1, "driver_name": "...", ...}]'
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyJson} disabled={jsonApplying || !jsonText.trim()}>
              {jsonApplying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {jsonApplying ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
