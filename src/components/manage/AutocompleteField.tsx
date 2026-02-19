import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import QuickCreateModal from "./QuickCreateModal";

export type EntityType = "driver" | "team" | "car" | "series" | "circuit" | "season";

interface Props {
  entityType: EntityType;
  value: { id: string; label: string } | null;
  onChange: (val: { id: string; label: string } | null) => void;
  className?: string;
  /** For season autocomplete — filters by this series */
  filterSeriesId?: string;
  placeholder?: string;
}

export default function AutocompleteField({ entityType, value, onChange, className, filterSeriesId, placeholder }: Props) {
  const [query, setQuery] = useState(value?.label || "");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value?.label || ""); }, [value]);

  useEffect(() => {
    if (!open) { setResults([]); return; }
    const timer = setTimeout(async () => {
      let data: any[] = [];
      const q = query.trim() ? `%${query}%` : "%";

      if (entityType === "driver") {
        const res = await supabase.from("v2_drivers").select("id, full_name").ilike("full_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: d.full_name }));
      } else if (entityType === "team") {
        const res = await supabase.from("v2_teams").select("id, full_name").ilike("full_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: d.full_name }));
      } else if (entityType === "car") {
        const res = await supabase.from("v2_cars").select("id, model_name, manufacturer").ilike("model_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: [d.manufacturer, d.model_name].filter(Boolean).join(" ") }));
      } else if (entityType === "series") {
        const res = await supabase.from("v2_series").select("id, name").ilike("name", q).order("name").limit(10);
        data = (res.data || []).map(s => ({ id: s.id, label: s.name }));
      } else if (entityType === "circuit") {
        const res = await supabase.from("v2_circuits").select("id, name, country").ilike("name", q).order("name").limit(10);
        data = (res.data || []).map(c => ({ id: c.id, label: c.country ? `${c.name}, ${c.country}` : c.name }));
      } else if (entityType === "season") {
        if (!filterSeriesId) { setResults([]); return; }
        let qb = supabase.from("v2_seasons").select("id, year").eq("series_id", filterSeriesId).order("year", { ascending: false }).limit(10);
        if (query.trim()) qb = qb.ilike("year::text", q);
        const res = await qb;
        data = (res.data || []).map(s => ({ id: s.id, label: String(s.year) }));
      }
      setResults(data);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, entityType, filterSeriesId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const entityLabel = entityType === "season" ? "season (year)" : entityType;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || `Search ${entityLabel}…`}
        className="h-8 text-xs"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors" onClick={() => { onChange(r); setQuery(r.label); setOpen(false); }}>
              {r.label}
            </button>
          ))}
          {results.length === 0 && query.trim() && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground">No matches</p>
          )}
          <button className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-accent transition-colors border-t border-border" onClick={() => { setCreating(true); setOpen(false); }}>
            + Create new {entityLabel}
          </button>
        </div>
      )}
      {creating && (
        <QuickCreateModal
          open={creating}
          onClose={() => setCreating(false)}
          entityType={entityType}
          initialName={query}
          filterSeriesId={filterSeriesId}
          onCreated={rec => { onChange(rec); setQuery(rec.label); }}
        />
      )}
    </div>
  );
}
