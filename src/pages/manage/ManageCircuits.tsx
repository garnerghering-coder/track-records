import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

export default function ManageCircuits() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", country: "", layout_image_url: "", length_km: "", latitude: "", longitude: "" });
  const [search, setSearch] = useState("");

  const { data: circuits = [], isLoading } = useQuery({
    queryKey: ["v2_circuits"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_circuits").select("*").order("name"); if (error) throw error; return data; },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return circuits;
    const q = search.toLowerCase();
    return circuits.filter((c: any) =>
      c.name.toLowerCase().includes(q) ||
      (c.location || "").toLowerCase().includes(q) ||
      (c.country || "").toLowerCase().includes(q)
    );
  }, [circuits, search]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        location: form.location || null,
        country: form.country || null,
        layout_image_url: form.layout_image_url || null,
        length_km: form.length_km ? parseFloat(form.length_km) : null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      };
      if (editing) { const { error } = await supabase.from("v2_circuits").update(payload as any).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("v2_circuits").insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_circuits"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_circuits").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_circuits"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", location: "", country: "", layout_image_url: "", length_km: "", latitude: "", longitude: "" }); setOpen(true); };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({
      name: c.name,
      location: c.location || "",
      country: c.country || "",
      layout_image_url: c.layout_image_url || "",
      length_km: c.length_km != null ? String(c.length_km) : "",
      latitude: c.latitude != null ? String(c.latitude) : "",
      longitude: c.longitude != null ? String(c.longitude) : "",
    });
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Circuits</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Circuit</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search circuits…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Location</TableHead><TableHead>Country</TableHead><TableHead>Coords</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.location}</TableCell>
                <TableCell>{c.country}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.latitude && c.longitude ? `${Number(c.latitude).toFixed(2)}, ${Number(c.longitude).toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No circuits found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Circuit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></div>
            <div><Label>Length (km)</Label><Input type="number" step="0.001" value={form.length_km} onChange={e => setForm(f => ({ ...f, length_km: e.target.value }))} placeholder="e.g. 5.412" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Latitude</Label><Input type="number" step="0.0001" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="e.g. 51.5014" /></div>
              <div><Label>Longitude</Label><Input type="number" step="0.0001" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="e.g. -0.1419" /></div>
            </div>
            <div><Label>Layout Image URL</Label><Input value={form.layout_image_url} onChange={e => setForm(f => ({ ...f, layout_image_url: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
