import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT_CLASS_COLORS = [
  "#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#f4a261", "#264653", "#a855f7",
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#ec4899",
];

interface SeasonEditDialogProps {
  season: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function SeasonEditDialog({ season, open, onOpenChange, onSaved }: SeasonEditDialogProps) {
  const [cdm, setCdm] = useState("");
  const [isMulticlass, setIsMulticlass] = useState(false);
  const [classes, setClasses] = useState<{ id?: string; class_name: string; cdm: string; color: string }[]>([]);
  const [newClassName, setNewClassName] = useState("");

  const { data: existingClasses = [] } = useQuery({
    queryKey: ["v2_season_classes", season.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_season_classes")
        .select("*")
        .eq("season_id", season.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    setCdm(season.cdm != null ? String(season.cdm) : "");
    setIsMulticlass(season.is_multiclass || false);
  }, [season]);

  useEffect(() => {
    setClasses(existingClasses.map((c: any, i: number) => ({
      id: c.id,
      class_name: c.class_name,
      cdm: c.cdm != null ? String(c.cdm) : "",
      color: c.color || DEFAULT_CLASS_COLORS[i % DEFAULT_CLASS_COLORS.length],
    })));
  }, [existingClasses]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Update season
      const { error } = await supabase.from("v2_seasons").update({
        cdm: cdm ? parseFloat(cdm) : null,
        is_multiclass: isMulticlass,
      }).eq("id", season.id);
      if (error) throw error;

      if (isMulticlass) {
        // Delete removed classes, upsert existing + new
        const existingIds = classes.filter(c => c.id).map(c => c.id!);
        // Delete any that were removed
        if (existingClasses.length > 0) {
          const toDelete = existingClasses
            .filter((ec: any) => !existingIds.includes(ec.id))
            .map((ec: any) => ec.id);
          if (toDelete.length > 0) {
            const { error: delErr } = await supabase.from("v2_season_classes").delete().in("id", toDelete);
            if (delErr) throw delErr;
          }
        }

        // Upsert classes
        for (let i = 0; i < classes.length; i++) {
          const c = classes[i];
          const payload = {
            season_id: season.id,
            class_name: c.class_name,
            cdm: c.cdm ? parseFloat(c.cdm) : null,
            sort_order: i,
            color: c.color,
          };
          if (c.id) {
            const { error: uErr } = await supabase.from("v2_season_classes").update(payload).eq("id", c.id);
            if (uErr) throw uErr;
          } else {
            const { error: iErr } = await supabase.from("v2_season_classes").insert(payload);
            if (iErr) throw iErr;
          }
        }
      } else {
        // If multiclass turned off, delete all classes
        await supabase.from("v2_season_classes").delete().eq("season_id", season.id);
      }
    },
    onSuccess: () => { toast.success("Season updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const addClass = () => {
    const name = newClassName.trim();
    if (!name) return;
    setClasses(prev => [...prev, { class_name: name, cdm: "", color: DEFAULT_CLASS_COLORS[prev.length % DEFAULT_CLASS_COLORS.length] }]);
    setNewClassName("");
  };

  const removeClass = (idx: number) => {
    setClasses(prev => prev.filter((_, i) => i !== idx));
  };

  const updateClass = (idx: number, field: "class_name" | "cdm" | "color", value: string) => {
    setClasses(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {season.year} Season</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Competitive Difficulty Multiplier (CDM)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 1.5"
              value={cdm}
              onChange={e => setCdm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Overall season difficulty factor</p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Multiclass Season</Label>
            <Switch checked={isMulticlass} onCheckedChange={setIsMulticlass} />
          </div>

          {isMulticlass && (
            <div className="space-y-3 border rounded-md p-3 bg-muted/20">
              <Label className="text-sm font-medium">Classes</Label>
              {classes.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={c.color}
                    onChange={e => updateClass(idx, "color", e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-border shrink-0 p-0"
                    title="Class color"
                  />
                  <Input
                    value={c.class_name}
                    onChange={e => updateClass(idx, "class_name", e.target.value)}
                    placeholder="Class name"
                    className="flex-1 h-8 text-sm"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={c.cdm}
                    onChange={e => updateClass(idx, "cdm", e.target.value)}
                    placeholder="CDM"
                    className="w-20 h-8 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeClass(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addClass(); } }}
                  placeholder="New class name…"
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addClass} disabled={!newClassName.trim()}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
