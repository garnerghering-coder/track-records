import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AutocompleteField from "@/components/manage/AutocompleteField";
import { Plus, ArrowLeft, ClipboardList, Globe, GlobeLock, Trash2, GripVertical, Pencil, CloudSun, Loader2, Download, FileText, Play } from "lucide-react";
import ImportDataDialog from "@/components/manage/ImportDataDialog";
import { Progress } from "@/components/ui/progress";

const SESSION_TYPES = [
  { value: "practice", label: "Practice" },
  { value: "qualifying", label: "Qualifying" },
  { value: "sprint_qualifying", label: "Sprint Qualifying" },
  { value: "sprint_race", label: "Sprint Race" },
  { value: "race", label: "Race" },
  { value: "endurance_race", label: "Endurance Race" },
  { value: "warmup", label: "Warmup" },
  { value: "other", label: "Other" },
];

export default function ManageEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sessionOpen, setSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [sessionForm, setSessionForm] = useState({ name: "", session_type: "practice" as string, date: "", start_time: "", end_time: "", layout_id: "", qualifying_session_id: "" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [highlightsSessionId, setHighlightsSessionId] = useState("");
  const [highlightsUrl, setHighlightsUrl] = useState("");
  const [savingHighlights, setSavingHighlights] = useState(false);

  // Unified import dialog state
  const [importOpen, setImportOpen] = useState(false);

  // Legacy F1 import state (used by ImportDataDialog routing)
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Resolution state for duplicate detection
  const [resolveOpen, setResolveOpen] = useState(false);
  const [unresolvedDrivers, setUnresolvedDrivers] = useState<Record<string, Array<{ id: string; full_name: string }>>>({});
  const [unresolvedTeams, setUnresolvedTeams] = useState<Record<string, Array<{ id: string; full_name: string }>>>({});
  const [driverResolutions, setDriverResolutions] = useState<Record<string, string>>({});
  const [teamResolutions, setTeamResolutions] = useState<Record<string, string>>({});
  const [rememberDrivers, setRememberDrivers] = useState<Record<string, boolean>>({});
  const [rememberTeams, setRememberTeams] = useState<Record<string, boolean>>({});

  // Event edit state
  const [editEventOpen, setEditEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ name: "", short_name: "", round_number: "", start_date: "", end_date: "", description: "" });
  const [editCircuit, setEditCircuit] = useState<{ id: string; label: string } | null>(null);

  const [fetchingWeather, setFetchingWeather] = useState<string | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ["v2_event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_events").select("*, v2_seasons(year, series_id, v2_series(id, name)), v2_circuits(id, name)").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const seriesId = (event?.v2_seasons as any)?.series_id || (event?.v2_seasons as any)?.v2_series?.id;

  const { data: seriesAliases = [] } = useQuery({
    queryKey: ["v2_series_aliases", seriesId],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_series_aliases" as any).select("alias").eq("series_id", seriesId!);
      if (error) throw error;
      return (data as any[]).map((a: any) => a.alias.toUpperCase());
    },
    enabled: !!seriesId,
  });

  const hasAlias = (alias: string) => seriesAliases.includes(alias.toUpperCase());

  const { data: sessions = [] } = useQuery({
    queryKey: ["v2_sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_sessions").select("*, v2_circuit_layouts(id, name, length_km)").eq("event_id", id!).order("sort_order", { ascending: true }).order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch layouts for the event's circuit
  const eventCircuitId = event?.circuit_id;
  const { data: circuitLayouts = [] } = useQuery({
    queryKey: ["v2_circuit_layouts", eventCircuitId],
    queryFn: async () => {
      if (!eventCircuitId) return [];
      const { data, error } = await supabase.from("v2_circuit_layouts").select("*").eq("circuit_id", eventCircuitId).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!eventCircuitId,
  });

  const addSession = useMutation({
    mutationFn: async () => {
      const maxOrder = sessions.reduce((max: number, s: any) => Math.max(max, s.sort_order || 0), 0);
      const { error } = await supabase.from("v2_sessions").insert({
        event_id: id!,
        name: sessionForm.name,
        session_type: sessionForm.session_type as any,
        date: sessionForm.date || null,
        start_time: sessionForm.start_time || null,
        end_time: sessionForm.end_time || null,
        sort_order: maxOrder + 1,
        layout_id: sessionForm.layout_id || null,
        qualifying_session_id: sessionForm.qualifying_session_id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); setSessionOpen(false); toast.success("Session added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSession = useMutation({
    mutationFn: async () => {
      if (!editingSession) return;
      const { error } = await supabase.from("v2_sessions").update({
        name: sessionForm.name,
        session_type: sessionForm.session_type as any,
        date: sessionForm.date || null,
        start_time: sessionForm.start_time || null,
        end_time: sessionForm.end_time || null,
        layout_id: sessionForm.layout_id || null,
        qualifying_session_id: sessionForm.qualifying_session_id || null,
      } as any).eq("id", editingSession.id);
      if (error) throw error;

      // Auto-cascade hour times/dates when an endurance_race session is updated
      if (editingSession.session_type === "endurance_race" && sessionForm.date) {
        await cascadeHourTimes(editingSession.id, sessionForm.date, sessionForm.start_time);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); setSessionOpen(false); setEditingSession(null); toast.success("Session updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  /** Auto-populate hour sub-session dates and start/end times from parent race */
  const cascadeHourTimes = async (parentSessionId: string, baseDate: string, startTime: string) => {
    // Fetch child hour sessions
    const { data: children } = await (supabase
      .from("v2_sessions") as any)
      .select("id, name, sort_order")
      .eq("parent_session_id", parentSessionId)
      .order("sort_order", { ascending: true });
    if (!children || children.length === 0) return;

    // Parse base date parts (avoid Date object timezone issues)
    const dateParts = baseDate.split("-").map(Number); // [YYYY, MM, DD]
    if (dateParts.length !== 3 || dateParts.some(isNaN)) return;
    let [baseYear, baseMonth, baseDay] = dateParts;

    // Helper to add days and return YYYY-MM-DD string without timezone issues
    const addDaysToDate = (y: number, m: number, d: number, offset: number): string => {
      // Use UTC to avoid timezone shifts
      const dt = new Date(Date.UTC(y, m - 1, d + offset));
      return dt.toISOString().slice(0, 10);
    };

    // If no start_time, just update dates without touching times
    if (!startTime) {
      for (const child of children) {
        await supabase.from("v2_sessions").update({
          date: baseDate,
        } as any).eq("id", child.id);
      }
      toast.success(`Updated dates for ${children.length} hour sessions`);
      return;
    }

    // Parse base start time
    const [startH, startM] = startTime.split(":").map(Number);
    if (isNaN(startH) || isNaN(startM)) return;

    let currentMinutes = startH * 60 + startM;
    let dayOffset = 0;

    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    for (const child of children) {
      const hourStart = currentMinutes % 1440;
      const hourEndAbsolute = currentMinutes + 60;
      const hourEnd = hourEndAbsolute % 1440;
      const crossesMidnight = hourStart > hourEnd; // wraps past 1440

      const dateStr = addDaysToDate(baseYear, baseMonth, baseDay, dayOffset);

      let endTimeStr: string;
      if (crossesMidnight) {
        endTimeStr = "23:59";
      } else {
        endTimeStr = formatTime(hourEnd);
      }

      await supabase.from("v2_sessions").update({
        date: dateStr,
        start_time: formatTime(hourStart),
        end_time: endTimeStr,
      } as any).eq("id", child.id);

      currentMinutes += 60;
      if (crossesMidnight) {
        dayOffset++;
      }
    }
    toast.success(`Updated times for ${children.length} hour sessions`);
  };

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      for (const table of ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_incidents", "v2_fastest_laps", "v2_pit_stops", "v2_annotation_sections"] as const) {
        const { error } = await supabase.from(table).delete().eq("session_id", sessionId);
        if (error) throw error;
      }
      const { error } = await supabase.from("v2_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); toast.success("Session deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      for (const s of sessions) {
        for (const table of ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_incidents", "v2_fastest_laps", "v2_pit_stops", "v2_annotation_sections"] as const) {
          await supabase.from(table).delete().eq("session_id", (s as any).id);
        }
      }
      await supabase.from("v2_sessions").delete().eq("event_id", id!);
      const { error } = await supabase.from("v2_events").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Event deleted"); navigate("/manage"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEventStatus = useMutation({
    mutationFn: async () => {
      const newStatus = event?.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("v2_events").update({ status: newStatus as any }).eq("id", id!);
      if (error) throw error;
      const { error: sessErr } = await supabase.from("v2_sessions").update({ status: newStatus as any }).eq("event_id", id!);
      if (sessErr) throw sessErr;

      // If publishing, fetch weather for all sessions
      if (newStatus === "published") {
        for (const s of sessions) {
          try {
            await supabase.functions.invoke("fetch-session-weather", { body: { session_id: (s as any).id } });
          } catch { /* weather fetch is best-effort */ }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2_event", id] });
      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
      toast.success(event?.status === "published" ? "Event unpublished" : "Event published");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("v2_events").update({
        name: eventForm.name,
        short_name: (eventForm.short_name || null) as any,
        round_number: eventForm.round_number || null,
        start_date: eventForm.start_date || null,
        end_date: eventForm.end_date || null,
        description: eventForm.description || null,
        circuit_id: editCircuit?.id || null,
      }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_event", id] }); setEditEventOpen(false); toast.success("Event updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSessionDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const arr = [...sessions];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(targetIdx, 0, moved);
    setDragIdx(null);
    qc.setQueryData(["v2_sessions", id], arr);
    try {
      for (let i = 0; i < arr.length; i++) {
        await supabase.from("v2_sessions").update({ sort_order: i } as any).eq("id", (arr[i] as any).id);
      }
      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
    } catch { toast.error("Failed to save order"); qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); }
  };

  const openEditSession = (s: any) => {
    setEditingSession(s);
    setSessionForm({
      name: s.name,
      session_type: s.session_type,
      date: s.date ? s.date.split("T")[0] : "",
      start_time: s.start_time || "",
      end_time: s.end_time || "",
      layout_id: s.layout_id || "",
      qualifying_session_id: (s as any).qualifying_session_id || "",
    });
    setSessionOpen(true);
  };

  const openNewSession = () => {
    setEditingSession(null);
    setSessionForm({ name: "", session_type: "practice", date: "", start_time: "", end_time: "", layout_id: "", qualifying_session_id: "" });
    setSessionOpen(true);
  };

  const openEditEvent = () => {
    if (!event) return;
    setEventForm({
      name: event.name,
      short_name: (event as any).short_name || "",
      round_number: event.round_number ? String(event.round_number) : "",
      start_date: event.start_date || "",
      end_date: event.end_date || "",
      description: event.description || "",
    });
    setEditCircuit(event.v2_circuits ? { id: event.v2_circuits.id, label: event.v2_circuits.name } : null);
    setEditEventOpen(true);
  };

  const fetchWeatherForSession = async (sessionId: string) => {
    setFetchingWeather(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-session-weather", { body: { session_id: sessionId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Weather data fetched!");
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch weather");
    } finally {
      setFetchingWeather(null);
    }
  };

  const handleF1Import = async (resolutions?: { drivers: Record<string, string>; teams: Record<string, string> }, saveAliases?: { drivers: string[]; teams: string[] }) => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      // Step 1: Preview mode — detect potential duplicates
      if (!resolutions) {
        const { data, error } = await supabase.functions.invoke("import-f1-sessions", {
          body: { url: importUrl.trim(), event_id: id, mode: "preview" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // If there are unresolved entities, show the resolution dialog
        if (data.has_unresolved) {
          setUnresolvedDrivers(data.unresolved_drivers || {});
          setUnresolvedTeams(data.unresolved_teams || {});
          // Pre-set resolutions to "create" by default
          const dr: Record<string, string> = {};
          for (const name of Object.keys(data.unresolved_drivers || {})) dr[name] = "create";
          const tr: Record<string, string> = {};
          for (const name of Object.keys(data.unresolved_teams || {})) tr[name] = "create";
          setDriverResolutions(dr);
          setTeamResolutions(tr);
          setRememberDrivers({});
          setRememberTeams({});
          setResolveOpen(true);
          setImportLoading(false);
          return;
        }
      }

      // Step 2: Commit mode — actually create sessions and results
      const { data, error } = await supabase.functions.invoke("import-f1-sessions", {
        body: {
          url: importUrl.trim(),
          event_id: id,
          resolutions: resolutions || { drivers: {}, teams: {} },
          save_aliases: saveAliases,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setImportResult(data);
      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
      toast.success(`Imported ${data.sessions_created} session(s) with ${data.total_entries} entries`);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
      setImportResult({ error: e.message });
    } finally {
      setImportLoading(false);
    }
  };

  const handleResolveAndImport = () => {
    // Build save_aliases from "remember" checkboxes
    const saveDrivers = Object.entries(rememberDrivers).filter(([name, checked]) => checked && driverResolutions[name] && driverResolutions[name] !== "create").map(([name]) => name);
    const saveTeams = Object.entries(rememberTeams).filter(([name, checked]) => checked && teamResolutions[name] && teamResolutions[name] !== "create").map(([name]) => name);
    const saveAliases = (saveDrivers.length > 0 || saveTeams.length > 0) ? { drivers: saveDrivers, teams: saveTeams } : undefined;
    
    setResolveOpen(false);
    handleF1Import({ drivers: driverResolutions, teams: teamResolutions }, saveAliases);
  };

  // Trigger F1 import when URL is set from ImportDataDialog
  const pendingF1Import = useRef(false);
  useEffect(() => {
    if (importUrl && !importLoading && !importOpen && !resolveOpen && !pendingF1Import.current) {
      pendingF1Import.current = true;
      handleF1Import().finally(() => { pendingF1Import.current = false; });
    }
  }, [importUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // IMSA import is now handled by ImportDataDialog

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!event) return <div className="p-6 text-muted-foreground">Event not found</div>;

  const isPublished = event.status === "published";

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/manage")}><ArrowLeft className="h-4 w-4 mr-1" />Back to Events</Button>

      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <Badge variant={isPublished ? "default" : "secondary"}>{event.status}</Badge>
          <Button size="sm" variant="outline" onClick={openEditEvent}>
            <Pencil className="h-4 w-4 mr-1" />Edit Event
          </Button>
          <Button
            size="sm"
            variant={isPublished ? "outline" : "default"}
            onClick={() => toggleEventStatus.mutate()}
            disabled={toggleEventStatus.isPending}
          >
           {isPublished ? <><GlobeLock className="h-4 w-4 mr-1" />Unpublish</> : <><Globe className="h-4 w-4 mr-1" />Publish Event</>}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 mr-1" />Delete Event
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Event</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete "{event.name}" and all its sessions and results.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteEvent.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <p className="text-muted-foreground text-sm">
          {event.v2_seasons?.v2_series?.name} {event.v2_seasons?.year}
          {event.v2_circuits?.name && ` • ${event.v2_circuits.name}`}
          {event.start_date && ` • ${event.start_date}`}
          {event.end_date && event.end_date !== event.start_date && ` – ${event.end_date}`}
        </p>
        {event.description && <p className="text-sm text-muted-foreground mt-2">{event.description}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setImportUrl(""); setImportResult(null); }}>
              <Download className="h-4 w-4 mr-1" />Import Data
            </Button>
            <Button size="sm" onClick={openNewSession}>
              <Plus className="h-4 w-4 mr-1" />Add Session
            </Button>
          </div>
        </div>

        {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet. Add one to get started.</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s: any, idx: number) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={() => handleSessionDrop(idx)}
              onDragEnd={() => setDragIdx(null)}
              className={`rounded-lg border border-border bg-card p-4 space-y-2 cursor-grab active:cursor-grabbing transition-opacity ${dragIdx === idx ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm">{s.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">{s.session_type.replace("_", " ")}</Badge>
              </div>
              {s.date && <p className="text-xs text-muted-foreground">{s.date.split("T")[0]}</p>}
              {s.v2_circuit_layouts && (
                <p className="text-xs text-muted-foreground">Layout: {s.v2_circuit_layouts.name}{s.v2_circuit_layouts.length_km ? ` (${s.v2_circuit_layouts.length_km} km)` : ""}</p>
              )}
              {(s.start_time || s.end_time) && (
                <p className="text-xs text-muted-foreground">{s.start_time || "?"} – {s.end_time || "?"}</p>
              )}
              <div className="flex items-center justify-between">
                <Badge variant={s.status === "published" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditSession(s)} title="Edit session">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => fetchWeatherForSession(s.id)}
                    disabled={fetchingWeather === s.id}
                    title="Refresh weather"
                  >
                    {fetchingWeather === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudSun className="h-3 w-3" />}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Session</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete "{s.name}" and all its results.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteSession.mutate(s.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/manage/events/${id}/session/${s.id}`)}>
                    <ClipboardList className="h-3 w-3 mr-1" />Enter Results
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary & Highlights */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Summary & Highlights</h2>
        <div className="flex flex-wrap items-end gap-4">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={generatingSummary || sessions.length === 0}
            onClick={async () => {
              setGeneratingSummary(true);
              try {
                const { data, error: fnErr } = await supabase.functions.invoke("generate-session-summary", {
                  body: { event_id: id, force: true },
                });
                if (fnErr) throw fnErr;
                if (data?.error) throw new Error(data.error);
                toast.success(`Generated ${data?.summaries?.length || 0} summaries`);
              } catch (e: any) {
                toast.error(e.message || "Failed to generate summaries");
              } finally {
                setGeneratingSummary(false);
              }
            }}
          >
            {generatingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {generatingSummary ? "Generating…" : "Generate Summary"}
          </Button>

          <div className="flex items-center gap-2">
            <Select value={highlightsSessionId} onValueChange={v => {
              setHighlightsSessionId(v);
              const s = sessions.find((s: any) => s.id === v);
              setHighlightsUrl((s as any)?.highlights_url || "");
            }}>
              <SelectTrigger className="h-8 text-xs w-48">
                <SelectValue placeholder="Select session…" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-1.5">
                      {s.name}
                      {(s as any).highlights_url && <Play className="h-3 w-3 text-primary" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {highlightsSessionId && (
              <>
                <Input
                  value={highlightsUrl}
                  onChange={e => setHighlightsUrl(e.target.value)}
                  placeholder="YouTube highlights URL…"
                  className="h-8 text-xs w-72"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={savingHighlights}
                  onClick={async () => {
                    setSavingHighlights(true);
                    try {
                      const { error } = await supabase.from("v2_sessions").update({ highlights_url: highlightsUrl || null } as any).eq("id", highlightsSessionId);
                      if (error) throw error;
                      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
                      toast.success("Highlights URL saved");
                    } catch (e: any) {
                      toast.error(e.message || "Failed to save");
                    } finally {
                      setSavingHighlights(false);
                    }
                  }}
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Session Dialog */}
      <Dialog open={sessionOpen} onOpenChange={v => { setSessionOpen(v); if (!v) setEditingSession(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSession ? "Edit" : "Add"} Session</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Session Name *</Label><Input value={sessionForm.name} onChange={e => setSessionForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Free Practice 1" /></div>
            <div><Label>Session Type *</Label>
              <Select value={sessionForm.session_type} onValueChange={v => setSessionForm(f => ({ ...f, session_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SESSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time (track)</Label><Input type="text" pattern="[0-2][0-9]:[0-5][0-9]" maxLength={5} value={sessionForm.start_time} onChange={e => setSessionForm(f => ({ ...f, start_time: e.target.value }))} placeholder="14:00" /></div>
              <div><Label>End Time (track)</Label><Input type="text" pattern="[0-2][0-9]:[0-5][0-9]" maxLength={5} value={sessionForm.end_time} onChange={e => setSessionForm(f => ({ ...f, end_time: e.target.value }))} placeholder="15:30" /></div>
            </div>
            {circuitLayouts.length > 0 && (
              <div>
                <Label>Circuit Configuration</Label>
                <Select value={sessionForm.layout_id} onValueChange={v => setSessionForm(f => ({ ...f, layout_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select layout…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {circuitLayouts.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}{l.length_km ? ` (${l.length_km} km)` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(sessionForm.session_type === "race" || sessionForm.session_type === "sprint_race") && sessions.length > 0 && (
              <div>
                <Label>Grid Reference (for +/- display)</Label>
                <Select value={sessionForm.qualifying_session_id || "_auto"} onValueChange={v => setSessionForm(f => ({ ...f, qualifying_session_id: v === "_auto" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Auto-detect qualifying" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_auto">Auto-detect (first qualifying session)</SelectItem>
                    {sessions.filter((s: any) => s.id !== editingSession?.id).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.session_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Override which session's positions are used for +/- gain/loss on the public page.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSessionOpen(false); setEditingSession(null); }}>Cancel</Button>
            <Button onClick={() => editingSession ? updateSession.mutate() : addSession.mutate()} disabled={!sessionForm.name.trim()}>
              {editingSession ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={editEventOpen} onOpenChange={setEditEventOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Event Name *</Label><Input value={eventForm.name} onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Short Name</Label><Input value={eventForm.short_name} onChange={e => setEventForm(f => ({ ...f, short_name: e.target.value.slice(0, 20) }))} placeholder="e.g. Daytona" maxLength={20} /><p className="text-xs text-muted-foreground mt-1">Max 20 chars. Used as label in standings PDF.</p></div>
            <div><Label>Round #</Label><Input type="number" value={eventForm.round_number} onChange={e => setEventForm(f => ({ ...f, round_number: e.target.value }))} /></div>
            <div>
              <Label>Circuit</Label>
              <AutocompleteField entityType="circuit" value={editCircuit} onChange={setEditCircuit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={eventForm.start_date} onChange={e => setEventForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={eventForm.end_date} onChange={e => setEventForm(f => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEventOpen(false)}>Cancel</Button>
            <Button onClick={() => updateEvent.mutate()} disabled={!eventForm.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Import Data Dialog */}
      <ImportDataDialog
        open={importOpen}
        onOpenChange={v => { if (!importLoading) setImportOpen(v); }}
        eventId={id!}
        seriesAliases={seriesAliases}
        onImportComplete={() => qc.invalidateQueries({ queryKey: ["v2_sessions", id] })}
        onF1Import={(f1Url) => { setImportOpen(false); setImportUrl(f1Url); }}
      />

      {/* Duplicate Resolution Dialog */}
      <Dialog open={resolveOpen} onOpenChange={v => { if (!importLoading) setResolveOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resolve Potential Duplicates</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            The following names from the F1 data might match existing records. Choose whether to link them or create new entries.
          </p>

          {Object.keys(unresolvedDrivers).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Drivers</h4>
              {Object.entries(unresolvedDrivers).map(([name, candidates]) => (
                <div key={name} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-medium">"{name}" — could this be:</p>
                  <div className="space-y-1">
                    {candidates.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={`driver-${name}`}
                          checked={driverResolutions[name] === c.id}
                          onChange={() => setDriverResolutions(prev => ({ ...prev, [name]: c.id }))}
                          className="accent-primary"
                        />
                        {c.full_name}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`driver-${name}`}
                        checked={driverResolutions[name] === "create"}
                        onChange={() => setDriverResolutions(prev => ({ ...prev, [name]: "create" }))}
                        className="accent-primary"
                      />
                      <span className="text-muted-foreground">Create new driver "{name}"</span>
                    </label>
                  </div>
                  {driverResolutions[name] && driverResolutions[name] !== "create" && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1 pt-1 border-t border-border/50">
                      <input
                        type="checkbox"
                        checked={rememberDrivers[name] || false}
                        onChange={e => setRememberDrivers(prev => ({ ...prev, [name]: e.target.checked }))}
                        className="accent-primary"
                      />
                      <span className="text-muted-foreground">Don't ask again for "{name}"</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {Object.keys(unresolvedTeams).length > 0 && (
            <div className="space-y-3 mt-4">
              <h4 className="text-sm font-semibold">Teams</h4>
              {Object.entries(unresolvedTeams).map(([name, candidates]) => (
                <div key={name} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-medium">"{name}" — could this be:</p>
                  <div className="space-y-1">
                    {candidates.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={`team-${name}`}
                          checked={teamResolutions[name] === c.id}
                          onChange={() => setTeamResolutions(prev => ({ ...prev, [name]: c.id }))}
                          className="accent-primary"
                        />
                        {c.full_name}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`team-${name}`}
                        checked={teamResolutions[name] === "create"}
                        onChange={() => setTeamResolutions(prev => ({ ...prev, [name]: "create" }))}
                        className="accent-primary"
                      />
                      <span className="text-muted-foreground">Create new team "{name}"</span>
                    </label>
                  </div>
                  {teamResolutions[name] && teamResolutions[name] !== "create" && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1 pt-1 border-t border-border/50">
                      <input
                        type="checkbox"
                        checked={rememberTeams[name] || false}
                        onChange={e => setRememberTeams(prev => ({ ...prev, [name]: e.target.checked }))}
                        className="accent-primary"
                      />
                      <span className="text-muted-foreground">Don't ask again for "{name}"</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolveAndImport}>Confirm & Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
