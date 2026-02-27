import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Sparkles, RefreshCw, Calculator } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface Driver { id: string; full_name: string; short_name: string | null; nationality: string | null; date_of_birth: string | null; }

export default function ManageDrivers() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Driver | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", nationality: "", date_of_birth: "" });
  const [search, setSearch] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcSingle, setRecalcSingle] = useState<string | null>(null);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["v2_drivers"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_drivers").select("*").order("full_name"); if (error) throw error; return data as Driver[]; },
  });

  const { data: usedDriverIds } = useQuery({
    queryKey: ["used_driver_ids"],
    queryFn: async () => {
      const ids = new Set<string>();
      const tables = ["v2_race_results", "v2_qualifying_results", "v2_practice_results"] as const;
      for (const table of tables) {
        const { data } = await supabase.from(table).select("driver_id").not("driver_id", "is", null);
        data?.forEach((r: any) => ids.add(r.driver_id));
      }
      return ids;
    },
    enabled: unusedOnly,
  });

  const filtered = useMemo(() => {
    let list = drivers;
    if (unusedOnly && usedDriverIds) {
      list = list.filter(d => !usedDriverIds.has(d.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.full_name.toLowerCase().includes(q) ||
        (d.nationality || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [drivers, search, unusedOnly, usedDriverIds]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { full_name: form.full_name, nationality: form.nationality || null, date_of_birth: form.date_of_birth || null };
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

  const openNew = () => { setEditing(null); setForm({ full_name: "", nationality: "", date_of_birth: "" }); setOpen(true); };
  const openEdit = (d: Driver) => { setEditing(d); setForm({ full_name: d.full_name, nationality: d.nationality || "", date_of_birth: d.date_of_birth || "" }); setOpen(true); };

  const missingCount = useMemo(() => drivers.filter(d => !d.nationality || !d.date_of_birth || (d.nationality && !d.nationality.includes(","))).length, [drivers]);

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-v2-drivers");
      if (error) throw error;
      const parts: string[] = [`Enriched ${data.enriched} of ${data.total} drivers`];
      if (data.continuing) parts.push("— continuing in background…");
      toast.success(parts.join(" "));
      qc.invalidateQueries({ queryKey: ["v2_drivers"] });
    } catch (e: any) {
      toast.error(e.message || "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  const handleRecalcAll = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.functions.invoke("recalculate-driver-fingerprint", {
        body: { all: true, offset: 0, limit: 15 },
      });
      if (error) throw error;
      toast.success("Fingerprint recalculation started for all drivers. It will continue in the background.");
    } catch (e: any) {
      toast.error(e.message || "Recalculation failed");
    } finally {
      setRecalculating(false);
    }
  };

  const handleRecalcSingle = async (driverId: string) => {
    setRecalcSingle(driverId);
    try {
      const { data, error } = await supabase.functions.invoke("recalculate-driver-fingerprint", {
        body: { driver_id: driverId },
      });
      if (error) throw error;
      toast.success("Fingerprint recalculated");
    } catch (e: any) {
      toast.error(e.message || "Recalculation failed");
    } finally {
      setRecalcSingle(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drivers</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleRecalcAll} size="sm" variant="outline" disabled={recalculating}>
            <RefreshCw className={`h-4 w-4 mr-1 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Starting…" : "Recalculate All"}
          </Button>
          {missingCount > 0 && (
            <Button onClick={handleEnrich} size="sm" variant="outline" disabled={enriching}>
              <Sparkles className="h-4 w-4 mr-1" />
              {enriching ? "Enriching…" : `Enrich Missing (${missingCount})`}
            </Button>
          )}
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Driver</Button>
        </div>
      </div>
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
          <Checkbox checked={unusedOnly} onCheckedChange={(c) => setUnusedOnly(!!c)} />
          Unused only
        </label>
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Hometown</TableHead><TableHead>DOB</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.full_name}</TableCell>
                <TableCell>{d.nationality}</TableCell>
                <TableCell>{d.date_of_birth}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRecalcSingle(d.id)} disabled={recalcSingle === d.id}>
                    <Calculator className={`h-3 w-3 ${recalcSingle === d.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(d.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No drivers found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Driver</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div><Label>Hometown</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Filksov, Denmark" /></div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.full_name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
