import { useState, useMemo, useCallback, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import SeasonEditDialog from "@/components/manage/SeasonEditDialog";

export default function ManageSeries() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [seasonYear, setSeasonYear] = useState("");
  const [search, setSearch] = useState("");
  const [editingSeason, setEditingSeason] = useState<any>(null);

  const { data: seriesList = [], isLoading } = useQuery({
    queryKey: ["v2_series"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_series").select("*").order("name"); if (error) throw error; return data; },
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ["v2_seasons"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_seasons").select("*").order("year", { ascending: false }); if (error) throw error; return data; },
  });

  const { data: allAliases = [] } = useQuery({
    queryKey: ["v2_series_aliases"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_series_aliases").select("*"); if (error) throw error; return data; },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return seriesList;
    const q = search.toLowerCase();
    return seriesList.filter((s: any) =>
      s.name.toLowerCase().includes(q) ||
      (s.short_name || "").toLowerCase().includes(q)
    );
  }, [seriesList, search]);

  const addAlias = useCallback((value: string) => {
    const v = value.trim().toUpperCase();
    if (v && !aliases.includes(v)) setAliases(prev => [...prev, v]);
    setAliasInput("");
  }, [aliases]);

  const removeAlias = useCallback((alias: string) => {
    setAliases(prev => prev.filter(a => a !== alias));
  }, []);

  const handleAliasKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAlias(aliasInput);
    } else if (e.key === "Backspace" && !aliasInput && aliases.length > 0) {
      setAliases(prev => prev.slice(0, -1));
    }
  }, [aliasInput, aliases, addAlias]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, short_name: aliases[0] || null };
      let seriesId: string;
      if (editing) {
        const { error } = await supabase.from("v2_series").update(payload).eq("id", editing.id);
        if (error) throw error;
        seriesId = editing.id;
      } else {
        const { data, error } = await supabase.from("v2_series").insert(payload).select("id").single();
        if (error) throw error;
        seriesId = data.id;
      }
      await supabase.from("v2_series_aliases").delete().eq("series_id", seriesId);
      if (aliases.length > 0) {
        const rows = aliases.map(a => ({ series_id: seriesId, alias: a }));
        const { error: aErr } = await supabase.from("v2_series_aliases").insert(rows);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_series"] }); qc.invalidateQueries({ queryKey: ["v2_series_aliases"] }); setOpen(false); toast.success("Saved"); },
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

  const openNew = () => { setEditing(null); setForm({ name: "" }); setAliases([]); setAliasInput(""); setOpen(true); };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ name: s.name });
    const existing = allAliases.filter((a: any) => a.series_id === s.id).map((a: any) => a.alias);
    setAliases(existing);
    setAliasInput("");
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Series</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Series</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search series…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Aliases</TableHead><TableHead>Seasons</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((s: any) => {
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
                    <TableCell className="flex gap-1 flex-wrap">{allAliases.filter((a: any) => a.series_id === s.id).map((a: any) => <Badge key={a.id} variant="secondary" className="text-xs">{a.alias}</Badge>)}</TableCell>
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
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{se.year}</span>
                                {se.is_multiclass && <Badge variant="outline" className="text-xs">Multiclass</Badge>}
                                {se.cdm != null && <span className="text-xs text-muted-foreground">CDM: {se.cdm}</span>}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingSeason(se)}><Pencil className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => delSeason.mutate(se.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
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
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No series found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      {/* Series edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Series</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label>Aliases</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 min-h-[40px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                {aliases.map(a => (
                  <Badge key={a} variant="secondary" className="gap-1 text-xs">
                    {a}
                    <button type="button" onClick={() => removeAlias(a)} className="ml-0.5 rounded-full hover:bg-muted-foreground/20">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  value={aliasInput}
                  onChange={e => setAliasInput(e.target.value)}
                  onKeyDown={handleAliasKeyDown}
                  onBlur={() => { if (aliasInput.trim()) addAlias(aliasInput); }}
                  placeholder={aliases.length === 0 ? "Type alias and press Enter…" : ""}
                  className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Press Enter or comma to add. Used for import matching.</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Season edit dialog */}
      {editingSeason && (
        <SeasonEditDialog
          season={editingSeason}
          open={!!editingSeason}
          onOpenChange={(v) => { if (!v) setEditingSeason(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["v2_seasons"] });
            qc.invalidateQueries({ queryKey: ["v2_season_classes"] });
            setEditingSeason(null);
          }}
        />
      )}
    </div>
  );
}
