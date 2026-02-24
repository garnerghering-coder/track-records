import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const BAND_COLORS: Record<string, string> = {
  // DCS
  "Rock Solid": "#60a5fa",
  Consistent: "#4ade80",
  Variable: "#facc15",
  Unpredictable: "#f87171",
  // DAS
  "All-Rounder": "#60a5fa",
  Versatile: "#4ade80",
  Specialist: "#facc15",
  "Type-Dependent": "#f87171",
  // DWS
  "Wet Weather Specialist": "#60a5fa",
  "Wet-Favoured": "#38bdf8",
  "Weather Neutral": "#4ade80",
  "Dry-Favoured": "#facc15",
  "Dry Weather Dependent": "#fb923c",
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Consistency": "How reliably a driver performs at their own level — low variance means dependable, high variance means unpredictable swings.",
  "Adaptability": "Whether a driver performs equally across different circuit types (power vs technical, flat vs hilly, low vs high braking).",
  "Weather": "Compares performance in wet or damp conditions versus dry. Above 50 means the driver gains in the rain.",
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

function SemiCircleGauge({ value, band, title, large, tooltipExtra }: { value: number; band: string; title: string; large?: boolean; tooltipExtra?: string }) {
  const color = BAND_COLORS[band] || "#8b8b9a";
  const size = large ? 140 : 110;
  const strokeWidth = large ? 9 : 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const dashOffset = circumference * (1 - progress);
  const rounded = Math.round(value);
  const metricDesc = METRIC_DESCRIPTIONS[title];
  const bandDesc = BAND_EXPLANATIONS[band];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center cursor-default">
            <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
              <path
                d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                fill="none"
                stroke="currentColor"
                className="text-border"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
              <path
                d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ opacity: 0.9 }}
              />
              <text
                x={size / 2}
                y={size / 2 - (large ? 6 : 2)}
                textAnchor="middle"
                fill={color}
                fontSize={large ? 38 : 28}
                fontFamily="'ModernAge', sans-serif"
              >
                {rounded}
              </text>
            </svg>
            <span
              className="font-display font-bold tracking-wide uppercase mt-1 text-center leading-tight"
              style={{ color, fontSize: large ? 13 : 11 }}
            >
              {band}
            </span>
            <span className="text-muted-foreground uppercase tracking-widest text-center" style={{ fontSize: large ? 10 : 8 }}>
              {title}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
          {metricDesc && <p className="text-foreground font-medium">{metricDesc}</p>}
          {bandDesc && <p className="text-muted-foreground">{bandDesc}</p>}
          {tooltipExtra && <p className="text-muted-foreground/70 italic">{tooltipExtra}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function InsufficientGauge({ title, large, tooltipExtra }: { title: string; large?: boolean; tooltipExtra?: string }) {
  const size = large ? 140 : 110;
  const strokeWidth = large ? 9 : 7;
  const radius = (size - strokeWidth) / 2;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center cursor-default opacity-40">
            <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
              <path
                d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                fill="none"
                stroke="currentColor"
                className="text-border"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
              <text
                x={size / 2}
                y={size / 2 - (large ? 6 : 2)}
                textAnchor="middle"
                fill="currentColor"
                className="text-muted-foreground"
                fontSize={large ? 16 : 13}
                fontFamily="'ModernAge', sans-serif"
              >
                —
              </text>
            </svg>
            <span className="font-display font-bold tracking-wide uppercase mt-1 text-center leading-tight text-muted-foreground" style={{ fontSize: large ? 13 : 11 }}>
              Insufficient Data
            </span>
            <span className="text-muted-foreground uppercase tracking-widest text-center" style={{ fontSize: large ? 10 : 8 }}>
              {title}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs p-3">
          <p className="text-muted-foreground">{tooltipExtra || "Not enough data to calculate this metric."}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Dropdown picker rendered as underlined clickable text */
function InlinePicker({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  if (options.length <= 1) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[120px] p-1" align="center">
        <div className="flex flex-col">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors ${opt.value === value ? "bg-accent font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Standings display that replaces the DPS gauge */
function StandingsGauge({ standingsData }: { standingsData: DriverStandingsResult }) {
  const {
    seasons,
    selectedSeason,
    selectedClass,
    driverPosition,
    driverPoints,
    totalEntries,
    setSelectedSeasonId,
    setSelectedClass,
  } = standingsData;

  const size = 140;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;

  // Calculate progress: position 1 = 100%, last position = ~5%
  const progress = driverPosition != null && totalEntries > 0
    ? Math.max(0.05, 1 - (driverPosition - 1) / totalEntries)
    : 0;
  const dashOffset = circumference * (1 - progress);

  // Color based on position
  const getPositionColor = () => {
    if (driverPosition == null) return "#8b8b9a";
    if (driverPosition === 1) return "#facc15"; // gold
    if (driverPosition === 2) return "#94a3b8"; // silver
    if (driverPosition === 3) return "#d97706"; // bronze
    const pct = totalEntries > 0 ? driverPosition / totalEntries : 1;
    if (pct <= 0.25) return "#4ade80"; // top quarter
    if (pct <= 0.5) return "#60a5fa"; // top half
    if (pct <= 0.75) return "#facc15"; // third quarter
    return "#fb923c"; // bottom quarter
  };

  const color = getPositionColor();
  const hasData = driverPosition != null && selectedSeason;

  // Build label parts
  const yearOptions = [...new Set(seasons.map((s) => s.year))].sort((a, b) => b - a).map((y) => ({
    value: String(y),
    label: String(y),
  }));

  // Filter series options by selected year
  const seriesForYear = selectedSeason
    ? seasons.filter((s) => s.year === selectedSeason.year)
    : [];
  const seriesOptions = [...new Map(seriesForYear.map((s) => [s.seriesId, { value: s.seasonId, label: s.seriesAlias }])).values()];

  const classOptions = selectedSeason?.isMulticlass && selectedSeason.classes.length > 1
    ? selectedSeason.classes.map((c) => ({ value: c.name, label: c.name }))
    : [];

  const handleYearChange = (yearStr: string) => {
    const year = Number(yearStr);
    const match = seasons.find((s) => s.year === year && (selectedSeason ? s.seriesId === selectedSeason.seriesId : true))
      || seasons.find((s) => s.year === year);
    if (match) setSelectedSeasonId(match.seasonId);
  };

  const handleSeriesChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
  };

  if (!hasData && seasons.length === 0) {
    return (
      <div className="flex flex-col items-center cursor-default opacity-40">
        <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="currentColor"
            className="text-border"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <text
            x={size / 2}
            y={size / 2 - 6}
            textAnchor="middle"
            fill="currentColor"
            className="text-muted-foreground"
            fontSize={16}
            fontFamily="'ModernAge', sans-serif"
          >
            —
          </text>
        </svg>
        <span className="font-display font-bold tracking-wide uppercase mt-1 text-center leading-tight text-muted-foreground" style={{ fontSize: 13 }}>
          No Points Data
        </span>
        <span className="text-muted-foreground uppercase tracking-widest text-center" style={{ fontSize: 10 }}>
          Standings
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {hasData && (
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ opacity: 0.9 }}
          />
        )}
        {/* Position number */}
        <text
          x={size / 2}
          y={size / 2 - 12}
          textAnchor="middle"
          fill={color}
          fontSize={34}
          fontFamily="'ModernAge', sans-serif"
        >
          {hasData ? `#${driverPosition}` : "—"}
        </text>
        {/* /total and pts */}
        {hasData && (
          <text
            x={size / 2}
            y={size / 2 + 2}
            textAnchor="middle"
            fill={color}
            fontSize={11}
            fontFamily="'IBM Plex Sans', sans-serif"
            opacity={0.7}
          >
            /{totalEntries} · {driverPoints} pts
          </text>
        )}
      </svg>

      {/* Selectable label line */}
      <div className="flex items-center gap-1 mt-1 flex-wrap justify-center" style={{ fontSize: 10 }}>
        <InlinePicker
          label={selectedSeason ? String(selectedSeason.year) : "—"}
          options={yearOptions}
          value={selectedSeason ? String(selectedSeason.year) : ""}
          onChange={handleYearChange}
        />
        <InlinePicker
          label={selectedSeason?.seriesAlias || "—"}
          options={seriesOptions}
          value={selectedSeason?.seasonId || ""}
          onChange={handleSeriesChange}
        />
        {classOptions.length > 0 && selectedClass && (
          <InlinePicker
            label={selectedClass}
            options={classOptions}
            value={selectedClass || ""}
            onChange={(v) => setSelectedClass(v)}
          />
        )}
        <span className="text-muted-foreground uppercase tracking-widest">Standings</span>
      </div>
      {/* Category text to match the other gauges */}
      <span className="text-muted-foreground uppercase tracking-widest text-center" style={{ fontSize: 10 }}>
        {hasData ? (driverPosition === 1 ? "Championship Leader" : driverPosition != null && driverPosition <= 3 ? "Podium Contender" : "Championship") : "Standings"}
      </span>
    </div>
  );
}

interface DriverFingerprintProps {
  data: DriverFingerprintData | null;
  standingsData?: DriverStandingsResult;
}

export default function DriverFingerprint({ data, standingsData }: DriverFingerprintProps) {
  const empty: DriverFingerprintData = { dps: null, dps_band: null, dcs: null, dcs_band: null, das: null, das_band: null, dws: null, dws_band: null, events_included: 0, adps: null, adps_band: null };
  const d = data || empty;

  const gauges: { key: string; value: number | null; band: string | null; title: string }[] = [
    { key: "dcs", value: d.dcs, band: d.dcs_band, title: "Consistency" },
    { key: "das", value: d.das, band: d.das_band, title: "Adaptability" },
    { key: "dws", value: d.dws, band: d.dws_band, title: "Weather" },
  ];

  return (
    <div className="flex items-center justify-center gap-6 flex-wrap">
      {/* Standings gauge (replaces DPS) — rendered first and slightly larger */}
      {standingsData ? (
        <StandingsGauge standingsData={standingsData} />
      ) : (
        <InsufficientGauge title="Standings" large tooltipExtra="No points data available for this driver." />
      )}

      {gauges.map((g) =>
        g.value != null && g.band ? (
          <SemiCircleGauge key={g.key} value={g.value} band={g.band} title={g.title} />
        ) : (
          <InsufficientGauge key={g.key} title={g.title} />
        )
      )}
    </div>
  );
}
