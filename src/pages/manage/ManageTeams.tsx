import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ManageTeams() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", short_name: "", nationality: "" });
  const [search, setSearch] = useState("");
  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasTeam, setAliasTeam] = useState<any>(null);
  const [aliasForm, setAliasForm] = useState({ season_id: "", display_name: "" });

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["v2_teams"],
    queryFn: async () => { const { data, error } = await supabase.from("v2_teams").select("*").order("full_name"); if (error) throw error; return data; },
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ["v2_seasons_for_aliases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v2_seasons").select("*, v2_series(name)").order("year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: teamAliases = [] } = useQuery({
    queryKey: ["v2_team_season_names", aliasTeam?.id],
    queryFn: async () => {
      if (!aliasTeam) return [];
      const { data } = await supabase.from("v2_team_season_names" as any).select("*, v2_seasons(year, v2_series(name))").eq("team_id", aliasTeam.id).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!aliasTeam,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter((t: any) =>
      t.full_name.toLowerCase().includes(q) ||
      (t.short_name || "").toLowerCase().includes(q) ||
      (t.nationality || "").toLowerCase().includes(q)
    );
  }, [teams, search]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { full_name: form.full_name, short_name: form.short_name || null, nationality: form.nationality || null };
      if (editing) { const { error } = await supabase.from("v2_teams").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("v2_teams").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_teams"] }); setOpen(false); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("v2_teams").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v2_teams"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAlias = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("v2_team_season_names" as any).upsert({
        team_id: aliasTeam.id,
        season_id: aliasForm.season_id,
        display_name: aliasForm.display_name,
      } as any, { onConflict: "team_id,season_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2_team_season_names", aliasTeam?.id] });
      setAliasForm({ season_id: "", display_name: "" });
      toast.success("Alias saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAlias = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("v2_team_season_names" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2_team_season_names", aliasTeam?.id] });
      toast.success("Alias removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ full_name: "", short_name: "", nationality: "" }); setOpen(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ full_name: t.full_name, short_name: t.short_name || "", nationality: t.nationality || "" }); setOpen(true); };
  const openAliases = (t: any) => { setAliasTeam(t); setAliasForm({ season_id: "", display_name: "" }); setAliasOpen(true); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Teams</h1>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />New Team</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search teams…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Short</TableHead><TableHead>Nationality</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.full_name}</TableCell>
                <TableCell>{t.short_name}</TableCell>
                <TableCell>{t.nationality}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAliases(t)} title="Season aliases"><Tags className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No teams found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      {/* Edit/Create Team Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Team</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))} /></div>
            <div><Label>Nationality</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.full_name.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Season Aliases Dialog */}
      <Dialog open={aliasOpen} onOpenChange={setAliasOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Season Names — {aliasTeam?.full_name}</DialogTitle>
            <p className="text-xs text-muted-foreground">Set different display names for this team in specific seasons.</p>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing aliases */}
            {teamAliases.length > 0 && (
              <div className="space-y-2">
                {teamAliases.map((alias: any) => (
                  <div key={alias.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{alias.v2_seasons?.v2_series?.name} {alias.v2_seasons?.year}</Badge>
                      <span>{alias.display_name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteAlias.mutate(alias.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
            {/* Add new alias */}
            <div className="border-t border-border pt-3 space-y-2">
              <Label className="text-xs">Add Season Name</Label>
              <div className="flex gap-2">
                <select
                  value={aliasForm.season_id}
                  onChange={e => setAliasForm(f => ({ ...f, season_id: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1"
                >
                  <option value="">Select season…</option>
                  {seasons.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.v2_series?.name} {s.year}</option>
                  ))}
                </select>
                <Input
                  value={aliasForm.display_name}
                  onChange={e => setAliasForm(f => ({ ...f, display_name: e.target.value }))}
                  className="flex-1"
                  placeholder="Display name for this season"
                />
                <Button
                  size="sm"
                  onClick={() => saveAlias.mutate()}
                  disabled={!aliasForm.season_id || !aliasForm.display_name.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
