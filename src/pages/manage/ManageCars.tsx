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
import { Checkbox } from "@/components/ui/checkbox";

export default function ManageCars() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ model_name: "", manufacturer: "" });
  const [search, setSearch] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: cars = [], isLoading } = useQuery({
    queryKey: ["v2_cars"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_cars").select("*").order("model_name"); if (error) throw error; return data; },
  });

  const { data: usedCarIds } = useQuery({
    queryKey: ["used_car_ids"],
    queryFn: async () => {
      const ids = new Set<string>();
      const tables = ["v2_race_results", "v2_qualifying_results", "v2_practice_results"] as const;
      for (const table of tables) {
        const { data } = await supabase.from(table).select("car_id").not("car_id", "is", null);
        data?.forEach((r: any) => ids.add(r.car_id));
      }
      return ids;
    },
    enabled: unusedOnly,
  });

  const filtered = useMemo(() => {
    let list = cars;
    if (unusedOnly && usedCarIds) {
      list = list.filter((c: any) => !usedCarIds.has(c.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        c.model_name.toLowerCase().includes(q) ||
        (c.manufacturer || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [cars, search, unusedOnly, usedCarIds]);

  const filteredIds = useMemo(() => new Set(filtered.map((c: any) => c.id)), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((c: any) => selected.has(c.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach((c: any) => next.delete(c.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach((c: any) => next.add(c.id)); return next; });
    }
  };
  const toggleOne = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const activeSelected = useMemo(() => {
    const s = new Set<string>();
    selected.forEach(id => { if (filteredIds.has(id)) s.add(id); });
    return s;
  }, [selected, filteredIds]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { model_name: form.model_name, manufacturer: form.manufacturer || null };
      if (editing) { const { error } = await supabase.from("v2_cars").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("v2_cars").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_cars"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_cars").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_cars"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ model_name: "", manufacturer: "" }); setOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ model_name: c.model_name, manufacturer: c.manufacturer || "" }); setOpen(true); };

  const handleBulkDelete = async () => {
    const ids = Array.from(activeSelected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} car(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of ids) {
      const { error } = await supabase.from("v2_cars").delete().eq("id", id);
      if (!error) deleted++;
    }
    toast.success(`Deleted ${deleted} car(s)`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["v2_cars"] });
    setBulkDeleting(false);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cars</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Car</Button>
      </div>
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search cars…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
          <Checkbox checked={unusedOnly} onCheckedChange={(c) => setUnusedOnly(!!c)} />
          Unused only
        </label>
      </div>

      {activeSelected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{activeSelected.size} selected</span>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {bulkDeleting ? "Deleting…" : "Delete"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto text-xs">Clear</Button>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={allSelected && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
              <TableHead>Model</TableHead><TableHead>Manufacturer</TableHead><TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: any) => (
              <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} /></TableCell>
                <TableCell className="font-medium">{c.model_name}</TableCell>
                <TableCell>{c.manufacturer}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No cars found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Car</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Model Name *</Label><Input value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} /></div>
            <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.model_name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
