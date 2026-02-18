import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users, Hash, Eye, XCircle, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

const STORAGE_KEY = "dismissedFlags";

const flagKey = (f: Flag) => `${f.entryId}:${f.type}`;

const FlagsTab = ({ onNavigateToEvent, onFlagCountChange }: FlagsTabProps) => {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const persistDismissed = useCallback((next: Set<string>) => {
    setDismissed(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  }, []);

  const dismissFlag = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    persistDismissed(next);
  };

  const restoreFlag = (key: string) => {
    const next = new Set(dismissed);
    next.delete(key);
    persistDismissed(next);
  };

  useEffect(() => {
    detectAnomalies();
  }, []);

  const activeFlags = flags.filter(f => !dismissed.has(flagKey(f)));
  const dismissedFlags = flags.filter(f => dismissed.has(flagKey(f)));

  useEffect(() => {
    onFlagCountChange?.(activeFlags.length);
  }, [activeFlags.length, onFlagCountChange]);

  const detectAnomalies = async () => {
    setLoading(true);
    const { data: entries } = await supabase
      .from("race_entries")
      .select("id, race_event_id, finishing_position, race_entry_drivers(driver_profile_id, driver_profiles(first_name, last_name)), race_events(id, event_name, series_name)");

    if (!entries) { setLoading(false); return; }

    const detected: Flag[] = [];
    const byEvent = new Map<string, typeof entries>();
    for (const entry of entries) {
      const evId = entry.race_event_id;
      if (!byEvent.has(evId)) byEvent.set(evId, []);
      byEvent.get(evId)!.push(entry);
    }

    for (const [eventId, eventEntries] of byEvent) {
      const ev = (eventEntries[0] as any).race_events;
      if (!ev) continue;

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

  const renderSection = (title: string, icon: React.ReactNode, items: Flag[], variant: "destructive" | "secondary" | "outline", isDismissedSection = false) => {
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
              <div className="flex items-center gap-1 shrink-0">
                {isDismissedSection ? (
                  <Button variant="ghost" size="sm" onClick={() => restoreFlag(flagKey(flag))} className="gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => dismissFlag(flagKey(flag))} className="gap-1 text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onNavigateToEvent(flag.eventId)} className="gap-1">
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFlags = (list: Flag[], isDismissedSection = false) => {
    const dupes = list.filter(f => f.type === "duplicate_driver");
    const missingD = list.filter(f => f.type === "missing_drivers");
    const missingP = list.filter(f => f.type === "missing_position");
    return (
      <>
        {renderSection("Duplicate Driver in Same Event", <Users className="h-4 w-4 text-destructive" />, dupes, "destructive", isDismissedSection)}
        {renderSection("Missing Drivers", <AlertTriangle className="h-4 w-4 text-yellow-500" />, missingD, "secondary", isDismissedSection)}
        {renderSection("Missing Position", <Hash className="h-4 w-4 text-muted-foreground" />, missingP, "outline", isDismissedSection)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Data Anomaly Flags</h2>
          <p className="text-sm text-muted-foreground">Automatically detected data quality issues across all events.</p>
        </div>
        <div className="flex items-center gap-4">
          {dismissedFlags.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Switch checked={showDismissed} onCheckedChange={setShowDismissed} />
              Dismissed ({dismissedFlags.length})
            </label>
          )}
          <Button variant="outline" size="sm" onClick={detectAnomalies}>Refresh</Button>
        </div>
      </div>

      {activeFlags.length === 0 && !showDismissed ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No anomalies detected. Everything looks good!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {renderFlags(activeFlags)}
          {showDismissed && dismissedFlags.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="font-display text-sm font-semibold text-muted-foreground">Dismissed Flags</h3>
              {renderFlags(dismissedFlags, true)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FlagsTab;
