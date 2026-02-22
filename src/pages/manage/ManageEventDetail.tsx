import { useState } from "react";
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
import { Plus, ArrowLeft, ClipboardList, Globe, GlobeLock, Trash2, GripVertical, Pencil, CloudSun, Loader2, Download } from "lucide-react";
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
  const [sessionForm, setSessionForm] = useState({ name: "", session_type: "practice" as string, date: "", start_time: "", end_time: "", layout_id: "" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // F1 import state
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // IMSA import state
  const [imsaImportOpen, setImsaImportOpen] = useState(false);
  const [imsaUrl, setImsaUrl] = useState("");
  const [imsaLoading, setImsaLoading] = useState(false);
  const [imsaResult, setImsaResult] = useState<any>(null);

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
  const [eventForm, setEventForm] = useState({ name: "", round_number: "", start_date: "", end_date: "", description: "" });
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
      } as any).eq("id", editingSession.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); setSessionOpen(false); setEditingSession(null); toast.success("Session updated"); },
    onError: (e: any) => toast.error(e.message),
  });

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
        round_number: eventForm.round_number ? parseInt(eventForm.round_number) : null,
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
    });
    setSessionOpen(true);
  };

  const openNewSession = () => {
    setEditingSession(null);
    setSessionForm({ name: "", session_type: "practice", date: "", start_time: "", end_time: "", layout_id: "" });
    setSessionOpen(true);
  };

  const openEditEvent = () => {
    if (!event) return;
    setEventForm({
      name: event.name,
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

  const handleImsaImport = async () => {
    if (!imsaUrl.trim()) return;
    setImsaLoading(true);
    setImsaResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-imsa-results", {
        body: { url: imsaUrl.trim(), event_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setImsaResult(data);
      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
      toast.success(`Imported ${data.sessions_created} session(s) with ${data.total_entries} entries`);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
      setImsaResult({ error: e.message });
    } finally {
      setImsaLoading(false);
    }
  };

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
            {hasAlias("F1") && (
              <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setImportUrl(""); setImportResult(null); }}>
                <Download className="h-4 w-4 mr-1" />Import from F1.com
              </Button>
            )}
            {hasAlias("IMSA") && (
              <Button size="sm" variant="outline" onClick={() => { setImsaImportOpen(true); setImsaUrl(""); setImsaResult(null); }}>
                <Download className="h-4 w-4 mr-1" />Import from IMSA
              </Button>
            )}
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
                <Label>Track Layout</Label>
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

      {/* F1 Import Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { if (!importLoading) setImportOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import from F1.com</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a Formula 1 race hub URL to automatically create sessions and populate results. Sessions will be created as drafts.
            </p>
            <div>
              <Label>F1.com Race URL</Label>
              <Input
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                placeholder="https://www.formula1.com/en/racing/2025/bahrain"
                disabled={importLoading}
              />
            </div>

            {importLoading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scraping F1.com and parsing results… this may take a minute.
                </div>
                <Progress value={undefined} className="h-2" />
              </div>
            )}

            {importResult && !importResult.error && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                <p className="font-medium text-foreground">✓ Import complete</p>
                <p>{importResult.sessions_created} session(s) created, {importResult.sessions_skipped || 0} skipped (duplicate)</p>
                <p>{importResult.total_entries} total entries imported</p>
                <p>{importResult.drivers_matched} drivers matched, {importResult.drivers_created} new drivers created</p>
                <p>{importResult.teams_matched} teams matched, {importResult.teams_created} new teams created</p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 text-destructive">
                    {importResult.errors.map((err: string, i: number) => <p key={i}>⚠ {err}</p>)}
                  </div>
                )}
              </div>
            )}

            {importResult?.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {importResult.error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importLoading}>
              {importResult && !importResult.error ? "Done" : "Cancel"}
            </Button>
            {(!importResult || importResult.error) && (
              <Button onClick={() => handleF1Import()} disabled={!importUrl.trim() || importLoading}>
                {importLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMSA Import Dialog */}
      <Dialog open={imsaImportOpen} onOpenChange={v => { if (!imsaLoading) setImsaImportOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import from IMSA</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste an IMSA results page URL from alkamelcloud.com. The importer will find classification JSON files and create sessions with results.
            </p>
            <div>
              <Label>IMSA Results URL</Label>
              <Input
                value={imsaUrl}
                onChange={e => setImsaUrl(e.target.value)}
                placeholder="https://results.imsa.com/Results/..."
                disabled={imsaLoading}
              />
            </div>

            {imsaLoading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scraping IMSA results… this may take a minute.
                </div>
                <Progress value={undefined} className="h-2" />
              </div>
            )}

            {imsaResult && !imsaResult.error && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                <p className="font-medium text-foreground">✓ Import complete</p>
                <p>{imsaResult.sessions_created} session(s) created, {imsaResult.sessions_skipped || 0} skipped (duplicate)</p>
                <p>{imsaResult.total_entries} total entries imported</p>
                <p>{imsaResult.drivers_matched} drivers matched, {imsaResult.drivers_created} new drivers created</p>
                <p>{imsaResult.teams_matched} teams matched, {imsaResult.teams_created} new teams created</p>
                {imsaResult.errors?.length > 0 && (
                  <div className="mt-2 text-destructive">
                    {imsaResult.errors.map((err: string, i: number) => <p key={i}>⚠ {err}</p>)}
                  </div>
                )}
              </div>
            )}

            {imsaResult?.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {imsaResult.error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImsaImportOpen(false)} disabled={imsaLoading}>
              {imsaResult && !imsaResult.error ? "Done" : "Cancel"}
            </Button>
            {(!imsaResult || imsaResult.error) && (
              <Button onClick={handleImsaImport} disabled={!imsaUrl.trim() || imsaLoading}>
                {imsaLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
