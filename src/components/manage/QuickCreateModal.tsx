import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type EntityType = "driver" | "team" | "car";

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  initialName?: string;
  onCreated: (record: { id: string; label: string }) => void;
}

export default function QuickCreateModal({ open, onClose, entityType, initialName = "", onCreated }: Props) {
  const [name, setName] = useState(initialName);
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (entityType === "driver") {
        const { data, error } = await supabase.from("v2_drivers").insert({ full_name: name.trim() }).select("id, full_name").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.full_name });
      } else if (entityType === "team") {
        const { data, error } = await supabase.from("v2_teams").insert({ full_name: name.trim() }).select("id, full_name").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.full_name });
      } else {
        const { data, error } = await supabase.from("v2_cars").insert({ model_name: name.trim(), manufacturer: extra.trim() || null }).select("id, model_name, manufacturer").single();
        if (error) throw error;
        onCreated({ id: data.id, label: [data.manufacturer, data.model_name].filter(Boolean).join(" ") });
      }
      toast.success(`${entityType} created`);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const labels: Record<EntityType, string> = { driver: "Full Name", team: "Team Name", car: "Model Name" };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {entityType}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{labels[entityType]}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          {entityType === "car" && (
            <div>
              <Label>Manufacturer</Label>
              <Input value={extra} onChange={e => setExtra(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
