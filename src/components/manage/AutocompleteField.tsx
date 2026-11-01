import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn, pgQuote } from "@/lib/utils";
import QuickCreateModal from "./QuickCreateModal";

export type EntityType = "driver" | "team" | "car" | "series" | "circuit" | "season";

interface Props {
  entityType: EntityType;
  value: { id: string; label: string } | null;
  onChange: (val: { id: string; label: string } | null) => void;
  className?: string;
  filterSeriesId?: string;
  placeholder?: string;
}

export default function AutocompleteField({ entityType, value, onChange, className, filterSeriesId, placeholder }: Props) {
  const [query, setQuery] = useState(value?.label || "");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value?.label || ""); }, [value]);

  // Position the dropdown using a portal
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const dialog = inputRef.current.closest('[role="dialog"]') as HTMLElement | null;
    if (dialog) {
      const dialogRect = dialog.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom - dialogRect.top + 2, left: rect.left - dialogRect.left, width: rect.width });
    } else {
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) { setResults([]); return; }
    const timer = setTimeout(async () => {
      let data: any[] = [];
      const q = query.trim() ? `%${query}%` : "%";

      if (entityType === "driver") {
        const res = await supabase.from("v2_drivers").select("id, full_name, nationality")
          .or(`full_name.ilike.${pgQuote(q)},nationality.ilike.${pgQuote(q)},short_name.ilike.${pgQuote(q)}`).limit(10);
        data = (res.data || []).map(d => ({ id: d.id, label: d.nationality ? `${d.full_name} (${d.nationality})` : d.full_name }));
      } else if (entityType === "team") {
        const res = await supabase.from("v2_teams").select("id, full_name, short_name, nationality")
          .or(`full_name.ilike.${pgQuote(q)},short_name.ilike.${pgQuote(q)},nationality.ilike.${pgQuote(q)}`).limit(10);
        data = (res.data || []).map(d => ({ id: d.id, label: d.full_name }));
      } else if (entityType === "car") {
        // Search by model_name OR manufacturer
        const res = await supabase.from("v2_cars").select("id, model_name, manufacturer")
          .or(`model_name.ilike.${pgQuote(q)},manufacturer.ilike.${pgQuote(q)}`).limit(10);
        data = (res.data || []).map(d => ({ id: d.id, label: [d.manufacturer, d.model_name].filter(Boolean).join(" ") }));
      } else if (entityType === "series") {
        const res = await supabase.from("v2_series").select("id, name, short_name")
          .or(`name.ilike.${pgQuote(q)},short_name.ilike.${pgQuote(q)}`).order("name").limit(10);
        data = (res.data || []).map(s => ({ id: s.id, label: s.name }));
      } else if (entityType === "circuit") {
        const res = await supabase.from("v2_circuits").select("id, name, country, location")
          .or(`name.ilike.${pgQuote(q)},country.ilike.${pgQuote(q)},location.ilike.${pgQuote(q)}`).order("name").limit(10);
        data = (res.data || []).map(c => ({ id: c.id, label: [c.name, c.location, c.country].filter(Boolean).join(", ") }));
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
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Also check if click is inside the portal dropdown
        const dropdown = document.getElementById(`ac-dropdown-${entityType}`);
        if (dropdown && dropdown.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [entityType]);

  const entityLabel = entityType === "season" ? "season (year)" : entityType;

  const portalTarget = containerRef.current?.closest('[role="dialog"]') as HTMLElement | null;
  const posStyle = portalTarget
    ? { position: 'absolute' as const, top: dropdownPos?.top, left: dropdownPos?.left, width: dropdownPos?.width }
    : { position: 'fixed' as const, top: dropdownPos?.top, left: dropdownPos?.left, width: dropdownPos?.width };

  const dropdown = open && dropdownPos && createPortal(
    <div
      id={`ac-dropdown-${entityType}`}
      className="z-[9999] rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto"
      style={posStyle}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {results.map(r => (
        <button key={r.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange(r); setQuery(r.label); setOpen(false); }}>
          {r.label}
        </button>
      ))}
      {results.length === 0 && query.trim() && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">No matches</p>
      )}
      <button className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-accent transition-colors border-t border-border" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setCreating(true); setOpen(false); }}>
        + Create new {entityLabel}
      </button>
    </div>,
    portalTarget || document.body
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || `Search ${entityLabel}…`}
        className="h-8 text-xs"
      />
      {dropdown}
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
