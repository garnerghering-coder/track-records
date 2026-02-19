import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AutocompleteField from "@/components/manage/AutocompleteField";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";

type Ref = { id: string; label: string } | null;

export default function ManageEvents() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<Ref>(null);
  const [season, setSeason] = useState<Ref>(null);
  const [circuit, setCircuit] = useState<Ref>(null);
  const [form, setForm] = useState({ name: "", round_number: "", start_date: "", end_date: "", description: "", status: "draft" as "draft" | "published" });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["v2_events_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_events").select("*, v2_seasons(year, series_id, v2_series(name)), v2_circuits(name)").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      // Delete sessions first (cascade), then event
      const { error: sessErr } = await supabase.from("v2_sessions").delete().eq("event_id", eventId);
      if (sessErr) throw sessErr;
      const { error } = await supabase.from("v2_events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_events_list"] }); toast.success("Event deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("Season is required");
      const payload = {
        season_id: season.id,
        circuit_id: circuit?.id || null,
        name: form.name,
        round_number: form.round_number ? parseInt(form.round_number) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        description: form.description || null,
        status: form.status as any,
      };
      const { error } = await supabase.from("v2_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_events_list"] }); setOpen(false); toast.success("Event created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => {
    setSeries(null); setSeason(null); setCircuit(null);
    setForm({ name: "", round_number: "", start_date: "", end_date: "", description: "", status: "draft" });
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Event</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Rd</TableHead><TableHead>Event</TableHead><TableHead>Circuit</TableHead><TableHead>Series</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((e: any) => (
              <TableRow key={e.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/manage/events/${e.id}`)}>
                <TableCell>{e.round_number}</TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.v2_circuits?.name}</TableCell>
                <TableCell>{e.v2_seasons?.v2_series?.name} {e.v2_seasons?.year}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.start_date}{e.end_date && e.end_date !== e.start_date ? ` – ${e.end_date}` : ""}</TableCell>
                <TableCell><Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={ev => ev.stopPropagation()}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={ev => ev.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Event</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete "{e.name}" and all its sessions and results. This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteEvent.mutate(e.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Series *</Label>
              <AutocompleteField entityType="series" value={series} onChange={v => { setSeries(v); setSeason(null); }} />
            </div>
            <div>
              <Label>Season *</Label>
              <AutocompleteField entityType="season" value={season} onChange={setSeason} filterSeriesId={series?.id} placeholder={series ? "Search or create season year…" : "Select a series first…"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Round #</Label><Input type="number" value={form.round_number} onChange={e => setForm(f => ({ ...f, round_number: e.target.value }))} /></div>
              <div><Label>Event Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Circuit</Label>
              <AutocompleteField entityType="circuit" value={circuit} onChange={setCircuit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name.trim() || !season}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
