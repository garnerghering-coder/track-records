import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowLeft, ClipboardList, Globe, GlobeLock } from "lucide-react";

const SESSION_TYPES = [
  { value: "practice", label: "Practice" },
  { value: "qualifying", label: "Qualifying" },
  { value: "sprint_qualifying", label: "Sprint Qualifying" },
  { value: "sprint_race", label: "Sprint Race" },
  { value: "race", label: "Race" },
  { value: "warmup", label: "Warmup" },
  { value: "other", label: "Other" },
];

export default function ManageEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState({ name: "", session_type: "practice" as string, date: "" });

  const { data: event, isLoading } = useQuery({
    queryKey: ["v2_event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_events").select("*, v2_seasons(year, v2_series(name)), v2_circuits(name)").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["v2_sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_sessions").select("*").eq("event_id", id!).order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("v2_sessions").insert({
        event_id: id!,
        name: sessionForm.name,
        session_type: sessionForm.session_type as any,
        date: sessionForm.date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_sessions", id] }); setSessionOpen(false); toast.success("Session added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEventStatus = useMutation({
    mutationFn: async () => {
      const newStatus = event?.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("v2_events").update({ status: newStatus as any }).eq("id", id!);
      if (error) throw error;
      // Also update all sessions to match
      const { error: sessErr } = await supabase.from("v2_sessions").update({ status: newStatus as any }).eq("event_id", id!);
      if (sessErr) throw sessErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2_event", id] });
      qc.invalidateQueries({ queryKey: ["v2_sessions", id] });
      toast.success(event?.status === "published" ? "Event unpublished" : "Event published");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!event) return <div className="p-6 text-muted-foreground">Event not found</div>;

  const isPublished = event.status === "published";

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/manage")}><ArrowLeft className="h-4 w-4 mr-1" />Back to Events</Button>

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <Badge variant={isPublished ? "default" : "secondary"}>{event.status}</Badge>
          <Button
            size="sm"
            variant={isPublished ? "outline" : "default"}
            onClick={() => toggleEventStatus.mutate()}
            disabled={toggleEventStatus.isPending}
          >
            {isPublished ? <><GlobeLock className="h-4 w-4 mr-1" />Unpublish</> : <><Globe className="h-4 w-4 mr-1" />Publish Event</>}
          </Button>
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
          <Button size="sm" onClick={() => { setSessionForm({ name: "", session_type: "practice", date: "" }); setSessionOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Session
          </Button>
        </div>

        {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet. Add one to get started.</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{s.name}</span>
                <Badge variant="outline" className="text-[10px]">{s.session_type.replace("_", " ")}</Badge>
              </div>
              {s.date && <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleString()}</p>}
              <div className="flex items-center justify-between">
                <Badge variant={s.status === "published" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/manage/events/${id}/session/${s.id}`)}>
                  <ClipboardList className="h-3 w-3 mr-1" />Enter Results
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Session</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Session Name *</Label><Input value={sessionForm.name} onChange={e => setSessionForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Free Practice 1" /></div>
            <div><Label>Session Type *</Label>
              <Select value={sessionForm.session_type} onValueChange={v => setSessionForm(f => ({ ...f, session_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SESSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date & Time</Label><Input type="datetime-local" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSessionOpen(false)}>Cancel</Button><Button onClick={() => addSession.mutate()} disabled={!sessionForm.name.trim()}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
