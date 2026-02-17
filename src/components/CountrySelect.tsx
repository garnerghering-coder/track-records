import { useState, useMemo } from "react";
import { COUNTRIES } from "@/lib/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronsUpDown, X } from "lucide-react";

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const CountrySelect = ({ value, onChange, placeholder = "Select country…" }: CountrySelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => COUNTRIES.find(c => c.name === value), [value]);

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES;
    const lower = search.toLowerCase();
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(lower));
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="text-lg leading-none">{selected.flag}</span>
              <span>{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                role="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover border border-border z-50" align="start">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollArea className="h-[240px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No countries found.</p>
            ) : (
              filtered.map((country) => (
                <button
                  key={country.code}
                  onClick={() => {
                    onChange(country.name);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                    value === country.name ? "bg-accent text-accent-foreground" : "text-popover-foreground"
                  }`}
                >
                  <span className="text-lg leading-none">{country.flag}</span>
                  <span>{country.name}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default CountrySelect;
