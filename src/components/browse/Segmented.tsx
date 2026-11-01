import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/**
 * Compact segmented control used for year / season / class / tab filters
 * on listing pages. Scrolls horizontally inside itself on narrow screens.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  /** Accessible name for the group */
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex max-w-full overflow-x-auto rounded border bg-card p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && <span className="num text-[11px] font-normal tracking-normal opacity-60">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Filter bar row: search box + controls, stacking on mobile. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}

/** "12 results" style counter used in toolbars and section headers. */
export function Count({ n, label, className }: { n: number; label: string; className?: string }) {
  return (
    <span className={cn("label-caps whitespace-nowrap", className)}>
      <span className="num text-foreground">{n.toLocaleString()}</span> {label}
    </span>
  );
}

/** Marker for scheduled events that have not run yet. */
export function UpcomingTag() {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-primary/40 px-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Upcoming
    </span>
  );
}
