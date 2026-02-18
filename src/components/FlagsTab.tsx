import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users, Hash, Eye } from "lucide-react";

interface Flag {
  type: "duplicate_driver" | "missing_drivers" | "missing_position";
  eventId: string;
  eventName: string;
  seriesName: string;
  entryId: string;
  detail: string;
}

interface FlagsTabProps {
  onNavigateToEvent: (eventId: string) => void;
  onFlagCountChange?: (count: number) => void;
}

const FlagsTab = ({ onNavigateToEvent, onFlagCountChange }: FlagsTabProps) => {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectAnomalies();
  }, []);

  useEffect(() => {
    onFlagCountChange?.(flags.length);
  }, [flags.length, onFlagCountChange]);

  const detectAnomalies = async () => {
    setLoading(true);
    const { data: entries } = await supabase
      .from("race_entries")
      .select("id, race_event_id, finishing_position, race_entry_drivers(driver_profile_id, driver_profiles(first_name, last_name)), race_events(id, event_name, series_name)");

    if (!entries) { setLoading(false); return; }

    const detected: Flag[] = [];

    // Group by event
    const byEvent = new Map<string, typeof entries>();
    for (const entry of entries) {
      const evId = entry.race_event_id;
      if (!byEvent.has(evId)) byEvent.set(evId, []);
      byEvent.get(evId)!.push(entry);
    }

    for (const [eventId, eventEntries] of byEvent) {
      const ev = (eventEntries[0] as any).race_events;
      if (!ev) continue;

      // Check duplicate drivers in same event
      const driverEntryMap = new Map<string, { entryId: string; name: string }[]>();
      for (const entry of eventEntries) {
        const drivers = (entry as any).race_entry_drivers || [];
        for (const red of drivers) {
          const dpId = red.driver_profile_id;
          const name = red.driver_profiles ? `${red.driver_profiles.first_name} ${red.driver_profiles.last_name}` : dpId;
          if (!driverEntryMap.has(dpId)) driverEntryMap.set(dpId, []);
          driverEntryMap.get(dpId)!.push({ entryId: entry.id, name });
        }
      }
      for (const [, appearances] of driverEntryMap) {
        if (appearances.length > 1) {
          for (const app of appearances) {
            detected.push({
              type: "duplicate_driver",
              eventId,
              eventName: ev.event_name,
              seriesName: ev.series_name,
              entryId: app.entryId,
              detail: `${app.name} appears in ${appearances.length} entries`,
            });
          }
        }
      }

      // Check missing drivers & missing positions
      for (const entry of eventEntries) {
        const drivers = (entry as any).race_entry_drivers || [];
        if (drivers.length === 0) {
          detected.push({
            type: "missing_drivers",
            eventId,
            eventName: ev.event_name,
            seriesName: ev.series_name,
            entryId: entry.id,
            detail: "Entry has no linked drivers",
          });
        }
        if (entry.finishing_position == null) {
          detected.push({
            type: "missing_position",
            eventId,
            eventName: ev.event_name,
            seriesName: ev.series_name,
            entryId: entry.id,
            detail: "Entry has no finishing position",
          });
        }
      }
    }

    setFlags(detected);
    setLoading(false);
  };

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Scanning for anomalies…</p>;
  }

  const duplicateFlags = flags.filter(f => f.type === "duplicate_driver");
  const missingDriverFlags = flags.filter(f => f.type === "missing_drivers");
  const missingPosFlags = flags.filter(f => f.type === "missing_position");

  const renderSection = (title: string, icon: React.ReactNode, items: Flag[], variant: "destructive" | "secondary" | "outline") => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-display text-sm font-semibold text-card-foreground">{title}</h3>
          <Badge variant={variant} className="text-xs">{items.length}</Badge>
        </div>
        <div className="space-y-1">
          {items.map((flag, i) => (
            <div key={`${flag.entryId}-${flag.type}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-card-foreground font-medium truncate">{flag.eventName}</p>
                <p className="text-xs text-muted-foreground">{flag.seriesName} — {flag.detail}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigateToEvent(flag.eventId)} className="shrink-0 gap-1">
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Data Anomaly Flags</h2>
          <p className="text-sm text-muted-foreground">Automatically detected data quality issues across all events.</p>
        </div>
        <Button variant="outline" size="sm" onClick={detectAnomalies}>Refresh</Button>
      </div>

      {flags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No anomalies detected. Everything looks good!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {renderSection("Duplicate Driver in Same Event", <Users className="h-4 w-4 text-destructive" />, duplicateFlags, "destructive")}
          {renderSection("Missing Drivers", <AlertTriangle className="h-4 w-4 text-yellow-500" />, missingDriverFlags, "secondary")}
          {renderSection("Missing Position", <Hash className="h-4 w-4 text-muted-foreground" />, missingPosFlags, "outline")}
        </div>
      )}
    </div>
  );
};

export default FlagsTab;
