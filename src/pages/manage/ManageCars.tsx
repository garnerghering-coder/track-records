import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function ManageCars() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ model_name: "", manufacturer: "" });

  const { data: cars = [], isLoading } = useQuery({
    queryKey: ["v2_cars"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_cars").select("*").order("model_name"); if (error) throw error; return data; },
  });

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cars</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Car</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Manufacturer</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {cars.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.model_name}</TableCell>
                <TableCell>{c.manufacturer}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
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
