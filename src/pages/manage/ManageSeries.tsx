import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";

export default function ManageSeries() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", short_name: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [seasonYear, setSeasonYear] = useState("");

  const { data: seriesList = [], isLoading } = useQuery({
    queryKey: ["v2_series"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_series").select("*").order("name"); if (error) throw error; return data; },
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ["v2_seasons"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_seasons").select("*").order("year", { ascending: false }); if (error) throw error; return data; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, short_name: form.short_name || null };
      if (editing) { const { error } = await supabase.from("v2_series").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("v2_series").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_series"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_series").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_series"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addSeason = useMutation({
    mutationFn: async ({ seriesId, year }: { seriesId: string; year: number }) => {
      const { error } = await supabase.from("v2_seasons").insert({ series_id: seriesId, year });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_seasons"] }); setSeasonYear(""); toast.success("Season added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delSeason = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_seasons").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_seasons"] }); toast.success("Season deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", short_name: "" }); setOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ name: s.name, short_name: s.short_name || "" }); setOpen(true); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Series</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Series</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Short</TableHead><TableHead>Seasons</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {seriesList.map((s: any) => {
              const sSeasons = seasons.filter((se: any) => se.series_id === s.id);
              const isExp = expandedId === s.id;
              return (
                <>
                  <TableRow key={s.id}>
                    <TableCell>
                      <button onClick={() => setExpandedId(isExp ? null : s.id)} className="flex items-center gap-1 font-medium">
                        {isExp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {s.name}
                      </button>
                    </TableCell>
                    <TableCell>{s.short_name}</TableCell>
                    <TableCell className="text-muted-foreground">{sSeasons.length} season{sSeasons.length !== 1 ? "s" : ""}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                  {isExp && (
                    <TableRow key={`${s.id}-seasons`}>
                      <TableCell colSpan={4} className="bg-muted/30 pl-10">
                        <div className="space-y-2 py-2">
                          {sSeasons.map((se: any) => (
                            <div key={se.id} className="flex items-center justify-between">
                              <span className="text-sm">{se.year}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => delSeason.mutate(se.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <Input type="number" placeholder="Year" value={seasonYear} onChange={e => setSeasonYear(e.target.value)} className="h-7 w-24 text-xs" />
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!seasonYear} onClick={() => addSeason.mutate({ seriesId: s.id, year: parseInt(seasonYear) })}>
                              Add Season
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Series</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
