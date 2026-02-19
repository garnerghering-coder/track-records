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
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function ManageEvents() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ series_id: "", season_id: "", name: "", round_number: "", circuit_id: "", start_date: "", end_date: "", description: "", status: "draft" as "draft" | "published" });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["v2_events_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_events").select("*, v2_seasons(year, series_id, v2_series(name)), v2_circuits(name)").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: seriesList = [] } = useQuery({ queryKey: ["v2_series"], queryFn: async () => { const { data } = await supabase.from("v2_series").select("*").order("name"); return data || []; } });
  const { data: seasons = [] } = useQuery({ queryKey: ["v2_seasons"], queryFn: async () => { const { data } = await supabase.from("v2_seasons").select("*").order("year", { ascending: false }); return data || []; } });
  const { data: circuits = [] } = useQuery({ queryKey: ["v2_circuits"], queryFn: async () => { const { data } = await supabase.from("v2_circuits").select("id, name").order("name"); return data || []; } });

  const filteredSeasons = seasons.filter((s: any) => s.series_id === form.series_id);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        season_id: form.season_id,
        circuit_id: form.circuit_id || null,
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={() => { setForm({ series_id: "", season_id: "", name: "", round_number: "", circuit_id: "", start_date: "", end_date: "", description: "", status: "draft" }); setOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" />New Event
        </Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Rd</TableHead><TableHead>Event</TableHead><TableHead>Circuit</TableHead><TableHead>Series</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((e: any) => (
              <TableRow key={e.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/manage/events/${e.id}`)}>
                <TableCell>{e.round_number}</TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.v2_circuits?.name}</TableCell>
                <TableCell>{e.v2_seasons?.v2_series?.name} {e.v2_seasons?.year}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.start_date}{e.end_date && e.end_date !== e.start_date ? ` – ${e.end_date}` : ""}</TableCell>
                <TableCell><Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Series *</Label>
              <Select value={form.series_id} onValueChange={v => setForm(f => ({ ...f, series_id: v, season_id: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select series" /></SelectTrigger>
                <SelectContent>{seriesList.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Season *</Label>
              <Select value={form.season_id} onValueChange={v => setForm(f => ({ ...f, season_id: v }))} disabled={!form.series_id}>
                <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                <SelectContent>{filteredSeasons.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.year}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Round #</Label><Input type="number" value={form.round_number} onChange={e => setForm(f => ({ ...f, round_number: e.target.value }))} /></div>
              <div><Label>Event Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div><Label>Circuit</Label>
              <Select value={form.circuit_id} onValueChange={v => setForm(f => ({ ...f, circuit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select circuit" /></SelectTrigger>
                <SelectContent>{circuits.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
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
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name.trim() || !form.season_id}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
