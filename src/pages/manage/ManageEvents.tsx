import { useState, useEffect } from "react";
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
import { Plus, Trash2, Search, Pencil } from "lucide-react";

type Ref = { id: string; label: string } | null;
type LayoutOption = { id: string; name: string };

function useCircuitLayouts(circuitId: string | undefined) {
  return useQuery({
    queryKey: ["v2_circuit_layouts", circuitId],
    queryFn: async () => {
      if (!circuitId) return [];
      const { data, error } = await supabase
        .from("v2_circuit_layouts")
        .select("id, name")
        .eq("circuit_id", circuitId)
        .order("sort_order");
      if (error) throw error;
      return data as LayoutOption[];
    },
    enabled: !!circuitId,
  });
}

export default function ManageEvents() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [series, setSeries] = useState<Ref>(null);
  const [season, setSeason] = useState<Ref>(null);
  const [circuit, setCircuit] = useState<Ref>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", short_name: "", round_number: "", start_date: "", end_date: "", description: "", status: "draft" as "draft" | "published" });

  // Edit event state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", short_name: "", round_number: "", start_date: "", end_date: "", description: "" });
  const [editCircuit, setEditCircuit] = useState<Ref>(null);
  const [editLayoutId, setEditLayoutId] = useState<string | null>(null);

  // Fetch layouts for create and edit dialogs
  const { data: createLayouts = [] } = useCircuitLayouts(circuit?.id);
  const { data: editLayouts = [] } = useCircuitLayouts(editCircuit?.id);

  // Auto-fill layout when there's only one
  useEffect(() => {
    if (createLayouts.length === 1) setLayoutId(createLayouts[0].id);
    else if (createLayouts.length === 0) setLayoutId(null);
  }, [createLayouts]);

  useEffect(() => {
    if (editLayouts.length === 1) setEditLayoutId(editLayouts[0].id);
    else if (editLayouts.length === 0) setEditLayoutId(null);
  }, [editLayouts]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["v2_events_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_events").select("*, v2_seasons(year, series_id, v2_series(name)), v2_circuits(id, name)").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
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
        layout_id: layoutId || null,
        name: form.name,
        short_name: (form.short_name || null) as any,
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

  const updateEvent = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No event selected");
      const { error } = await supabase.from("v2_events").update({
        name: editForm.name,
        short_name: (editForm.short_name || null) as any,
        round_number: editForm.round_number ? parseInt(editForm.round_number) : null,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        description: editForm.description || null,
        circuit_id: editCircuit?.id || null,
        layout_id: editLayoutId || null,
      }).eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_events_list"] }); setEditOpen(false); toast.success("Event updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (e: any) => {
    setEditId(e.id);
    setEditForm({
      name: e.name,
      short_name: e.short_name || "",
      round_number: e.round_number ? String(e.round_number) : "",
      start_date: e.start_date || "",
      end_date: e.end_date || "",
      description: e.description || "",
    });
    setEditCircuit(e.v2_circuits ? { id: e.v2_circuits.id, label: e.v2_circuits.name } : null);
    setEditLayoutId(e.layout_id || null);
    setEditOpen(true);
  };

  const openNew = () => {
    setSeries(null); setSeason(null); setCircuit(null); setLayoutId(null);
    setForm({ name: "", short_name: "", round_number: "", start_date: "", end_date: "", description: "", status: "draft" });
    setOpen(true);
  };

  const filtered = events.filter((e: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.name?.toLowerCase().includes(s) || e.v2_circuits?.name?.toLowerCase().includes(s) || e.v2_seasons?.v2_series?.name?.toLowerCase().includes(s);
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Event</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Rd</TableHead><TableHead>Event</TableHead><TableHead>Circuit</TableHead><TableHead>Series</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((e: any) => (
              <TableRow key={e.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/manage/events/${e.id}`)}>
                <TableCell>{e.round_number}</TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.v2_circuits?.name}</TableCell>
                <TableCell>{e.v2_seasons?.v2_series?.name} {e.v2_seasons?.year}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.start_date}{e.end_date && e.end_date !== e.start_date ? ` – ${e.end_date}` : ""}</TableCell>
                <TableCell><Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={ev => { ev.stopPropagation(); openEdit(e); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* New Event Dialog */}
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
            <div><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value.slice(0, 20) }))} placeholder="e.g. Daytona" maxLength={20} /><p className="text-xs text-muted-foreground mt-1">Max 20 chars. Used in standings PDF.</p></div>
            <div>
              <Label>Circuit</Label>
              <AutocompleteField entityType="circuit" value={circuit} onChange={v => { setCircuit(v); setLayoutId(null); }} />
            </div>
            {circuit && createLayouts.length > 0 && (
              <div>
                <Label>Circuit Configuration</Label>
                <Select value={layoutId || ""} onValueChange={v => setLayoutId(v || null)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select layout…" /></SelectTrigger>
                  <SelectContent>
                    {createLayouts.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createLayouts.length > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Individual sessions can override this layout</p>
                )}
              </div>
            )}
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

      {/* Edit Event Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Round #</Label><Input type="number" value={editForm.round_number} onChange={e => setEditForm(f => ({ ...f, round_number: e.target.value }))} /></div>
              <div><Label>Event Name *</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div><Label>Short Name</Label><Input value={editForm.short_name} onChange={e => setEditForm(f => ({ ...f, short_name: e.target.value.slice(0, 20) }))} placeholder="e.g. Daytona" maxLength={20} /><p className="text-xs text-muted-foreground mt-1">Max 20 chars. Used in standings PDF.</p></div>
            <div>
              <Label>Circuit</Label>
              <AutocompleteField entityType="circuit" value={editCircuit} onChange={v => { setEditCircuit(v); setEditLayoutId(null); }} />
            </div>
            {editCircuit && editLayouts.length > 0 && (
              <div>
                <Label>Circuit Configuration</Label>
                <Select value={editLayoutId || ""} onValueChange={v => setEditLayoutId(v || null)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select layout…" /></SelectTrigger>
                  <SelectContent>
                    {editLayouts.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editLayouts.length > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Individual sessions can override this layout</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateEvent.mutate()} disabled={!editForm.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
