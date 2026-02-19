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

interface Driver { id: string; full_name: string; short_name: string | null; nationality: string | null; date_of_birth: string | null; }

export default function ManageDrivers() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Driver | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", short_name: "", nationality: "", date_of_birth: "" });

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["v2_drivers"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_drivers").select("*").order("full_name"); if (error) throw error; return data as Driver[]; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { full_name: form.full_name, short_name: form.short_name || null, nationality: form.nationality || null, date_of_birth: form.date_of_birth || null };
      if (editing) { const { error } = await supabase.from("v2_drivers").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("v2_drivers").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_drivers"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_drivers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_drivers"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ full_name: "", short_name: "", nationality: "", date_of_birth: "" }); setOpen(true); };
  const openEdit = (d: Driver) => { setEditing(d); setForm({ full_name: d.full_name, short_name: d.short_name || "", nationality: d.nationality || "", date_of_birth: d.date_of_birth || "" }); setOpen(true); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drivers</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Driver</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Nationality</TableHead><TableHead>DOB</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {drivers.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.full_name}</TableCell>
                <TableCell>{d.short_name}</TableCell>
                <TableCell>{d.nationality}</TableCell>
                <TableCell>{d.date_of_birth}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(d.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Driver</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div><Label>Short Name (3-letter code)</Label><Input value={form.short_name} maxLength={3} onChange={e => setForm(f => ({ ...f, short_name: e.target.value.toUpperCase() }))} /></div>
            <div><Label>Nationality</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} /></div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.full_name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
