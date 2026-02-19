import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import QuickCreateModal from "./QuickCreateModal";

type EntityType = "driver" | "team" | "car";

interface Props {
  entityType: EntityType;
  value: { id: string; label: string } | null;
  onChange: (val: { id: string; label: string } | null) => void;
  className?: string;
}

export default function AutocompleteField({ entityType, value, onChange, className }: Props) {
  const [query, setQuery] = useState(value?.label || "");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value?.label || ""); }, [value]);

  useEffect(() => {
    if (!query.trim() || !open) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const q = `%${query}%`;
      let data: any[] = [];
      if (entityType === "driver") {
        const res = await supabase.from("v2_drivers").select("id, full_name").ilike("full_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: d.full_name }));
      } else if (entityType === "team") {
        const res = await supabase.from("v2_teams").select("id, full_name").ilike("full_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: d.full_name }));
      } else {
        const res = await supabase.from("v2_cars").select("id, model_name, manufacturer").ilike("model_name", q).limit(8);
        data = (res.data || []).map(d => ({ id: d.id, label: [d.manufacturer, d.model_name].filter(Boolean).join(" ") }));
      }
      setResults(data);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, entityType]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={`Search ${entityType}…`}
        className="h-8 text-xs"
      />
      {open && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors" onClick={() => { onChange(r); setQuery(r.label); setOpen(false); }}>
              {r.label}
            </button>
          ))}
          <button className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-accent transition-colors" onClick={() => { setCreating(true); setOpen(false); }}>
            + Create new {entityType}
          </button>
        </div>
      )}
      {creating && (
        <QuickCreateModal
          open={creating}
          onClose={() => setCreating(false)}
          entityType={entityType}
          initialName={query}
          onCreated={rec => { onChange(rec); setQuery(rec.label); }}
        />
      )}
    </div>
  );
}
