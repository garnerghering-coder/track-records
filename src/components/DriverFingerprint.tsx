import { ReactNode } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { DriverStandingsResult } from "@/hooks/useDriverStandings";

export interface DriverFingerprintData {
  dps: number | null;
  dps_band: string | null;
  dcs: number | null;
  dcs_band: string | null;
  das: number | null;
  das_band: string | null;
  dws: number | null;
  dws_band: string | null;
  events_included: number;
  adps?: number | null;
  adps_band?: string | null;
}

/**
 * Bands map onto the fixed timing semantics so colour means the same thing
 * everywhere: purple = best tier, green = good, yellow = caution, red = weak.
 * Values are CSS colours built from theme tokens, so they adapt to light/dark.
 */
const TONE = {
  best: "hsl(var(--fastest))",
  good: "hsl(var(--pb))",
  warn: "hsl(var(--flag))",
  bad: "hsl(var(--dnf))",
  neutral: "hsl(var(--foreground))",
  muted: "hsl(var(--muted-foreground))",
} as const;

const BAND_TONE: Record<string, string> = {
  // DCS
  "Rock Solid": TONE.best,
  Consistent: TONE.good,
  Variable: TONE.warn,
  Unpredictable: TONE.bad,
  // DAS
  "All-Rounder": TONE.best,
  Versatile: TONE.good,
  Specialist: TONE.warn,
  "Type-Dependent": TONE.bad,
  // DWS
  "Wet Weather Specialist": TONE.best,
  "Wet-Favoured": TONE.good,
  "Weather Neutral": TONE.neutral,
  "Dry-Favoured": TONE.warn,
  "Dry Weather Dependent": TONE.bad,
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  Consistency: "How reliably a driver performs at their own level — low variance means dependable, high variance means unpredictable swings.",
  Adaptability: "Whether a driver performs equally across different circuit types (power vs technical, flat vs hilly, low vs high braking).",
  Weather: "Compares performance in wet or damp conditions versus dry. Above 50 means the driver gains in the rain.",
  Standings: "Championship position computed from points scored in race, qualifying and practice sessions. Pick a season, series and class.",
};

const BAND_EXPLANATIONS: Record<string, string> = {
  "Rock Solid": "Extremely reliable. Rarely has a bad session relative to their ability.",
  Consistent: "Generally dependable with occasional dips.",
  Variable: "Noticeable swings between strong and weak sessions.",
  Unpredictable: "Wide variance. Results are difficult to forecast.",
  "All-Rounder": "Equally effective across all circuit types.",
  Versatile: "Performs well in most circuit types with minor gaps.",
  Specialist: "Clear strengths and weaknesses by circuit character.",
  "Type-Dependent": "Performance strongly tied to specific circuit characteristics.",
  "Wet Weather Specialist": "Significantly faster in wet conditions.",
  "Wet-Favoured": "Tends to gain performance when it rains.",
  "Weather Neutral": "No meaningful difference between wet and dry results.",
  "Dry-Favoured": "Tends to lose performance in wet conditions.",
  "Dry Weather Dependent": "Significantly slower in wet conditions.",
};

/* ── Shared cell chrome ───────────────────────────────────────── */
function Cell({ title, help, children, dim }: { title: string; help?: ReactNode; children: ReactNode; dim?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps truncate">{title}</span>
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`About ${title}`} className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] space-y-1.5 p-3 text-xs">
              {help}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={cn("mt-1.5 flex flex-1 flex-col", dim && "opacity-70")}>{children}</div>
    </div>
  );
}

/** Horizontal 0–100 meter with optional centre tick (used for Weather, where 50 = neutral). */
function Meter({ value, color, mid }: { value: number | null; color: string; mid?: boolean }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative mt-2.5 h-1 w-full bg-muted" aria-hidden>
      {value != null && <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: color }} />}
      {mid && <div className="absolute -inset-y-1 left-1/2 w-px bg-foreground/60" />}
      {/* quarter ticks */}
      {[25, 50, 75].map((t) => (
        <div key={t} className="absolute inset-y-0 w-px bg-card" style={{ left: `${t}%` }} />
      ))}
    </div>
  );
}

function MetricCell({ value, band, title }: { value: number | null; band: string | null; title: string }) {
  const has = value != null && !!band;
  const color = has ? BAND_TONE[band!] || TONE.neutral : TONE.muted;
  return (
    <Cell
      title={title}
      dim={!has}
      help={
        <>
          <p className="font-medium text-foreground">{METRIC_DESCRIPTIONS[title]}</p>
          {has && BAND_EXPLANATIONS[band!] && <p className="text-muted-foreground">{BAND_EXPLANATIONS[band!]}</p>}
          {!has && <p className="text-muted-foreground">Not enough data to calculate this metric yet.</p>}
        </>
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-accent text-3xl leading-none", has ? "text-foreground" : "text-muted-foreground")}>{has ? Math.round(value!) : "—"}</span>
        {has && <span className="num text-[11px] text-muted-foreground">/100</span>}
      </div>
      <Meter value={has ? value : null} color={color} mid={title === "Weather"} />
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className={cn("truncate font-display text-xs font-semibold uppercase tracking-wide", has ? "text-foreground" : "text-muted-foreground")}>
          {has ? band : "Insufficient data"}
        </span>
      </div>
    </Cell>
  );
}

/** Dropdown picker rendered as compact underlined text */
function InlinePicker({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  if (options.length <= 1) {
    return <span className="text-foreground">{label}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-0.5 text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-primary">
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[120px] rounded p-1" align="start">
        <div className="flex flex-col">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                opt.value === value ? "bg-accent font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Championship standings cell (replaces the old DPS gauge) */
function StandingsCell({ standingsData }: { standingsData?: DriverStandingsResult }) {
  const help = <p className="font-medium text-foreground">{METRIC_DESCRIPTIONS.Standings}</p>;

  if (!standingsData || (standingsData.seasons.length === 0 && standingsData.driverPosition == null)) {
    return (
      <Cell title="Championship" help={help} dim>
        <span className="font-accent text-3xl leading-none text-muted-foreground">—</span>
        <Meter value={null} color={TONE.muted} />
        <div className="mt-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">No points data</div>
      </Cell>
    );
  }

  const { seasons, selectedSeason, selectedClass, driverPosition, driverPoints, totalEntries, setSelectedSeasonId, setSelectedClass } = standingsData;
  const hasData = driverPosition != null && !!selectedSeason;
  const progress = hasData && totalEntries > 0 ? Math.max(5, (1 - (driverPosition! - 1) / totalEntries) * 100) : null;

  const yearOptions = [...new Set(seasons.map((s) => s.year))].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }));
  const seriesForYear = selectedSeason ? seasons.filter((s) => s.year === selectedSeason.year) : [];
  const seriesOptions = [...new Map(seriesForYear.map((s) => [s.seriesId, { value: s.seasonId, label: s.seriesAlias }])).values()];
  const classOptions =
    selectedSeason?.isMulticlass && selectedSeason.classes.length > 1 ? selectedSeason.classes.map((c) => ({ value: c.name, label: c.name })) : [];

  const handleYearChange = (yearStr: string) => {
    const year = Number(yearStr);
    const match =
      seasons.find((s) => s.year === year && (selectedSeason ? s.seriesId === selectedSeason.seriesId : true)) || seasons.find((s) => s.year === year);
    if (match) setSelectedSeasonId(match.seasonId);
  };

  const leader = driverPosition === 1;
  const podium = driverPosition != null && driverPosition <= 3;

  return (
    <Cell title="Championship" help={help}>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-accent text-3xl leading-none", leader || podium ? "text-primary" : "text-foreground")}>
          {hasData ? `P${driverPosition}` : "—"}
        </span>
        {hasData && (
          <span className="num text-[11px] text-muted-foreground">
            /{totalEntries} · {driverPoints} pts
          </span>
        )}
      </div>
      <Meter value={progress} color={podium ? "hsl(var(--primary))" : TONE.neutral} />
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-display text-xs font-semibold uppercase tracking-wide">
        <InlinePicker
          label={selectedSeason ? String(selectedSeason.year) : "—"}
          options={yearOptions}
          value={selectedSeason ? String(selectedSeason.year) : ""}
          onChange={handleYearChange}
        />
        <InlinePicker label={selectedSeason?.seriesAlias || "—"} options={seriesOptions} value={selectedSeason?.seasonId || ""} onChange={setSelectedSeasonId} />
        {classOptions.length > 0 && selectedClass && (
          <InlinePicker label={selectedClass} options={classOptions} value={selectedClass || ""} onChange={(v) => setSelectedClass(v)} />
        )}
      </div>
    </Cell>
  );
}

interface DriverFingerprintProps {
  data: DriverFingerprintData | null;
  standingsData?: DriverStandingsResult;
}

export default function DriverFingerprint({ data, standingsData }: DriverFingerprintProps) {
  const d = data;
  const gauges: { key: string; value: number | null; band: string | null; title: string }[] = [
    { key: "dcs", value: d?.dcs ?? null, band: d?.dcs_band ?? null, title: "Consistency" },
    { key: "das", value: d?.das ?? null, band: d?.das_band ?? null, title: "Adaptability" },
    { key: "dws", value: d?.dws ?? null, band: d?.dws_band ?? null, title: "Weather" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border bg-border lg:grid-cols-4">
        <StandingsCell standingsData={standingsData} />
        {gauges.map((g) => (
          <MetricCell key={g.key} value={g.value} band={g.band} title={g.title} />
        ))}
      </div>
    </TooltipProvider>
  );
}
