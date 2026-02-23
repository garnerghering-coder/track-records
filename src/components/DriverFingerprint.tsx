import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
}

const BAND_COLORS: Record<string, string> = {
  // DPS
  Elite: "#60a5fa",
  Competitive: "#4ade80",
  Midfield: "#facc15",
  "Below Average": "#fb923c",
  Developing: "#f87171",
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
  "Driver Performance": "Measures overall racing performance from normalised positional data across all sessions, weighted by session importance.",
  "Consistency": "How reliably a driver performs at their own level — low variance means dependable, high variance means unpredictable swings.",
  "Adaptability": "Whether a driver performs equally across different circuit types (power vs technical, flat vs hilly, low vs high braking).",
  "Wet Weather": "Compares performance in wet or damp conditions versus dry. Above 50 means the driver gains in the rain.",
};

const BAND_EXPLANATIONS: Record<string, string> = {
  Elite: "Consistently near the sharp end. Dominant across sessions.",
  Competitive: "Regular front-runner. Strong performer in most conditions.",
  Midfield: "Competitive but not consistently challenging leaders.",
  "Below Average": "Struggling to match field pace on most weekends.",
  Developing: "Significant room for improvement.",
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

function SemiCircleGauge({ value, band, title, large }: { value: number; band: string; title: string; large?: boolean }) {
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
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function InsufficientGauge({ title, large }: { title: string; large?: boolean }) {
  const size = large ? 140 : 110;
  const strokeWidth = large ? 9 : 7;
  const radius = (size - strokeWidth) / 2;

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
  );
}

export default function DriverFingerprint({ data }: { data: DriverFingerprintData | null }) {
  const empty: DriverFingerprintData = { dps: null, dps_band: null, dcs: null, dcs_band: null, das: null, das_band: null, dws: null, dws_band: null, events_included: 0 };
  const d = data || empty;

  const gauges: { key: string; value: number | null; band: string | null; title: string }[] = [
    { key: "dps", value: d.dps, band: d.dps_band, title: "Driver Performance" },
    { key: "dcs", value: d.dcs, band: d.dcs_band, title: "Consistency" },
    { key: "das", value: d.das, band: d.das_band, title: "Adaptability" },
    { key: "dws", value: d.dws, band: d.dws_band, title: "Wet Weather" },
  ];

  return (
    <div className="flex items-center justify-center gap-6">
      {gauges.map((g) =>
        g.value != null && g.band ? (
          <SemiCircleGauge key={g.key} value={g.value} band={g.band} title={g.title} large={g.key === "dps"} />
        ) : (
          <InsufficientGauge key={g.key} title={g.title} large={g.key === "dps"} />
        )
      )}
    </div>
  );
}
