import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EntityType = "driver" | "team" | "car" | "series" | "circuit" | "season";

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  initialName?: string;
  filterSeriesId?: string;
  onCreated: (record: { id: string; label: string; extra?: Record<string, any> }) => void;
}

export default function QuickCreateModal({ open, onClose, entityType, initialName = "", filterSeriesId, onCreated }: Props) {
  const [name, setName] = useState(initialName);
  const [extra, setExtra] = useState("");
  const [extra2, setExtra2] = useState("");
  const [extra3, setExtra3] = useState("");
  const [extra4, setExtra4] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (entityType === "driver") {
        const { data, error } = await supabase.from("v2_drivers").insert({
          full_name: name.trim(),
          nationality: extra.trim() || null,
          date_of_birth: extra2.trim() || null,
        }).select("id, full_name, nationality").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.full_name, extra: { nationality: data.nationality } });
      } else if (entityType === "team") {
        const { data, error } = await supabase.from("v2_teams").insert({ full_name: name.trim() }).select("id, full_name").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.full_name });
      } else if (entityType === "car") {
        const { data, error } = await supabase.from("v2_cars").insert({ model_name: name.trim(), manufacturer: extra.trim() || null }).select("id, model_name, manufacturer").single();
        if (error) throw error;
        onCreated({ id: data.id, label: [data.manufacturer, data.model_name].filter(Boolean).join(" ") });
      } else if (entityType === "series") {
        const { data, error } = await supabase.from("v2_series").insert({ name: name.trim(), short_name: extra.trim() || null }).select("id, name").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.name });
      } else if (entityType === "circuit") {
        const { data, error } = await supabase.from("v2_circuits").insert({
          name: name.trim(),
          country: extra.trim() || null,
          location: extra2.trim() || null,
          latitude: extra3.trim() ? parseFloat(extra3) : null,
          longitude: extra4.trim() ? parseFloat(extra4) : null,
        } as any).select("id, name, country").single();
        if (error) throw error;
        onCreated({ id: data.id, label: data.country ? `${data.name}, ${data.country}` : data.name });
      } else if (entityType === "season") {
        const year = parseInt(name.trim());
        if (!year || !filterSeriesId) { toast.error("Enter a valid year"); setSaving(false); return; }
        const { data, error } = await supabase.from("v2_seasons").insert({ series_id: filterSeriesId, year }).select("id, year").single();
        if (error) throw error;
        onCreated({ id: data.id, label: String(data.year) });
      }
      toast.success(`${entityType} created`);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const labels: Record<EntityType, string> = {
    driver: "Full Name", team: "Team Name", car: "Model Name",
    series: "Series Name", circuit: "Circuit Name", season: "Year",
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {entityType}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{labels[entityType]}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} autoFocus type={entityType === "season" ? "number" : "text"} />
          </div>
          {entityType === "driver" && (
            <>
              <div><Label>Nationality</Label><Input value={extra} onChange={e => setExtra(e.target.value)} placeholder="e.g. United States" /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={extra2} onChange={e => setExtra2(e.target.value)} /></div>
            </>
          )}
          {entityType === "car" && (
            <div><Label>Manufacturer</Label><Input value={extra} onChange={e => setExtra(e.target.value)} /></div>
          )}
          {entityType === "series" && (
            <div><Label>Short Name</Label><Input value={extra} onChange={e => setExtra(e.target.value)} /></div>
          )}
          {entityType === "circuit" && (
            <>
              <div><Label>Country</Label><Input value={extra} onChange={e => setExtra(e.target.value)} /></div>
              <div><Label>Location</Label><Input value={extra2} onChange={e => setExtra2(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Latitude</Label><Input type="number" step="0.0001" value={extra3} onChange={e => setExtra3(e.target.value)} placeholder="e.g. 51.5014" /></div>
                <div><Label>Longitude</Label><Input type="number" step="0.0001" value={extra4} onChange={e => setExtra4(e.target.value)} placeholder="e.g. -0.1419" /></div>
              </div>
            </>
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
