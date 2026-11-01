import { useState, useMemo } from "react";
import { COUNTRIES } from "@/lib/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const CountrySelect = ({ value, onChange, placeholder = "Select country…" }: CountrySelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => COUNTRIES.find((c) => c.name === value), [value]);

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES;
    const lower = search.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(lower));
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded border border-input bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <FlagImage nationality={selected.code} size={18} className="shrink-0 rounded-[1px]" />
              <span className="truncate text-foreground">{selected.name}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{value || placeholder}</span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            {value && (
              <span
                role="button"
                aria-label="Clear country"
                className="hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-50 w-[--radix-popover-trigger-width] min-w-[240px] rounded border bg-popover p-0 shadow-none" align="start">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
        </div>
        <ScrollArea className="h-[260px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No countries found.</p>
            ) : (
              filtered.map((country) => {
                const active = value === country.name;
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => {
                      onChange(country.name);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      active ? "bg-accent text-accent-foreground" : "text-popover-foreground",
                    )}
                  >
                    <FlagImage nationality={country.code} size={18} className="shrink-0 rounded-[1px]" />
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    <span className="num text-[11px] text-muted-foreground">{country.code}</span>
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default CountrySelect;
