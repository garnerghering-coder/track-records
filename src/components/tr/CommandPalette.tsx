import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Car, Flag, MapPin, Search, Trophy, User, Users } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { pgQuote } from "@/lib/utils";

type Hit = { type: string; id: string; label: string; subtitle?: string; url: string };

const ICONS: Record<string, typeof User> = {
  Drivers: User,
  Teams: Users,
  Events: Flag,
  Series: Trophy,
  Circuits: MapPin,
  Cars: Car,
};

const QUICK_LINKS = [
  { label: "Latest results", url: "/results", icon: Flag },
  { label: "Calendar", url: "/calendar", icon: Calendar },
  { label: "All series", url: "/series", icon: Trophy },
  { label: "All drivers", url: "/search?tab=drivers", icon: User },
  { label: "All teams", url: "/teams", icon: Users },
  { label: "All circuits", url: "/search?tab=circuits", icon: MapPin },
  { label: "All cars", url: "/cars", icon: Car },
];

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Record<string, Hit[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const p = pgQuote(`%${term}%`);
      const [drivers, teams, events, series, circuits, cars] = await Promise.all([
        supabase.from("v2_drivers").select("id, full_name, nationality").or(`full_name.ilike.${p},short_name.ilike.${p}`).limit(6),
        supabase.from("v2_teams").select("id, full_name, nationality").or(`full_name.ilike.${p},short_name.ilike.${p}`).limit(5),
        supabase
          .from("v2_events")
          .select("id, name, start_date, v2_seasons(year, v2_series(name))")
          .ilike("name", `%${term}%`)
          .eq("status", "published" as never)
          .limit(5),
        supabase.from("v2_series").select("id, name, short_name").or(`name.ilike.${p},short_name.ilike.${p}`).limit(4),
        supabase.from("v2_circuits").select("id, name, country, location").or(`name.ilike.${p},location.ilike.${p},country.ilike.${p}`).limit(4),
        supabase.from("v2_cars").select("id, model_name, manufacturer").or(`model_name.ilike.${p},manufacturer.ilike.${p}`).limit(4),
      ]);
      if (cancelled) return;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      setHits({
        Drivers: (drivers.data || []).map((d: any) => ({ type: "Drivers", id: d.id, label: d.full_name, subtitle: d.nationality, url: `/driver/${d.id}` })),
        Events: (events.data || []).map((e: any) => ({
          type: "Events",
          id: e.id,
          label: e.name,
          subtitle: e.v2_seasons?.v2_series?.name,
          url: `/events/${e.id}`,
        })),
        Teams: (teams.data || []).map((t: any) => ({ type: "Teams", id: t.id, label: t.full_name, subtitle: t.nationality, url: `/team/${t.id}` })),
        Series: (series.data || []).map((s: any) => ({ type: "Series", id: s.id, label: s.name, subtitle: s.short_name, url: `/series/${s.id}` })),
        Circuits: (circuits.data || []).map((c: any) => ({
          type: "Circuits",
          id: c.id,
          label: c.name,
          subtitle: [c.location, c.country].filter(Boolean).join(", "),
          url: `/circuit/${c.id}`,
        })),
        Cars: (cars.data || []).map((c: any) => ({ type: "Cars", id: c.id, label: c.model_name, subtitle: c.manufacturer, url: `/car/${c.id}` })),
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setLoading(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (url: string) => {
    onOpenChange(false);
    navigate(url);
  };

  const term = q.trim();
  const groups = Object.entries(hits).filter(([, v]) => v.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search drivers, teams, events, circuits…" />
      <CommandList className="max-h-[min(60vh,420px)]">
        {!term && (
          <CommandGroup heading="Jump to">
            {QUICK_LINKS.map((l) => (
              <CommandItem key={l.url} value={l.url} onSelect={() => go(l.url)}>
                <l.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {l.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {term && !loading && groups.length === 0 && <CommandEmpty>No matches for “{term}”.</CommandEmpty>}
        {groups.map(([type, list]) => {
          const Icon = ICONS[type] || Search;
          return (
            <CommandGroup key={type} heading={type}>
              {list.map((h) => (
                <CommandItem key={`${type}-${h.id}`} value={`${type}-${h.id}`} onSelect={() => go(h.url)}>
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.subtitle && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{h.subtitle}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {term && (
          <CommandGroup>
            <CommandItem value="__all" onSelect={() => go(`/search?q=${encodeURIComponent(term)}`)}>
              <Search className="mr-2 h-4 w-4 text-primary" />
              <span>
                See all results for <span className="font-semibold">“{term}”</span>
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
