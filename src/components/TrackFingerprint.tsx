import { TrackMetrics, categoryHexColor } from "@/lib/track-calculations";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CATEGORY_EXPLANATIONS: Record<string, string> = {
  // TCS
  "Power Circuit": "Long straights dominate this layout, rewarding top speed and engine power over cornering agility.",
  "Speed Circuit": "A fast layout with extended high-speed sections where aerodynamic efficiency is key.",
  "High-Speed Technical": "Blends fast straights with demanding corners, requiring both speed and precision.",
  "Balanced": "An even mix of straights and corners — no single trait dominates the lap.",
  "Technical": "Corner-heavy with frequent direction changes that reward car setup and driver skill.",
  "Tight & Twisty": "A dense, low-speed layout where mechanical grip and traction are paramount.",
  // EI
  "Flat": "Minimal elevation change across the lap — a level playing field for all setups.",
  "Undulating": "Gentle rises and dips that subtly affect weight transfer and braking points.",
  "Hilly": "Significant climbs and descents that challenge braking zones and throttle application.",
  "Highland": "Large elevation swings that heavily influence car balance and power delivery.",
  "Mountainous": "Extreme vertical variation — elevation is a defining challenge of every lap.",
  // CSI
  "Flowing": "Corners link together smoothly with light braking, rewarding momentum and rhythm.",
  "Rhythmic": "A moderate braking load with a mix of light and firm braking zones.",
  "High Braking Density": "Frequent heavy braking events that stress brakes and demand precise threshold control.",
  "Extreme Braking Density": "Nearly every corner requires hard braking — maximum stress on brakes and driver focus.",
  // TDI
  "Efficient": "A forgiving circuit that is relatively easy on car and driver over a race distance.",
  "Active": "Moderate physical and mechanical demands — enough to separate the field over time.",
  "Punishing": "High cumulative stress from corners, elevation, and braking throughout the lap.",
  "Relentless": "Among the most demanding layouts — every system and skill is tested to the limit.",
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Circuit Demand": "Overall difficulty score (0–100). Combines how technical, hilly, and brake-heavy a circuit is. Higher = more demanding on car and driver.",
  "Circuit Character": "Layout style score (0–100). Low = tight, technical corners dominate. High = long straights and raw speed dominate.",
  "Corner Severity": "Braking intensity score (0–100). Measures what percentage of corners need heavy braking. Higher = more punishing on brakes.",
  "Elevation": "Altitude change score (0–100). Elevation range (lowest to highest point) per km of lap; 100 = 20 m per km or more. Higher = hillier terrain.",
};

interface MetricProps {
  value: number;
  category: string;
  title: string;
}

function MetricCell({ value, category, title }: MetricProps) {
  const color = categoryHexColor(category);
  const pct = Math.max(0, Math.min(100, value));
  const explanation = CATEGORY_EXPLANATIONS[category];
  const metricDesc = METRIC_DESCRIPTIONS[title];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0 cursor-default bg-card px-4 py-3.5">
            <div className="label-caps truncate">{title}</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-accent text-3xl leading-none text-foreground">{Math.round(value)}</span>
              <span className="num text-[11px] text-muted-foreground">/100</span>
            </div>
            <div className="relative mt-2.5 h-1 w-full bg-muted" aria-hidden>
              <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: color }} />
              {[25, 50, 75].map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-card" style={{ left: `${t}%` }} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate font-display text-xs font-semibold uppercase tracking-wide text-foreground">{category}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] space-y-1.5 p-3 text-xs">
          {metricDesc && <p className="font-medium text-foreground">{metricDesc}</p>}
          {explanation && <p className="text-muted-foreground">{explanation}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface TrackFingerprintProps {
  metrics: TrackMetrics;
  layoutImageUrl?: string | null;
  layoutName?: string | null;
  lengthKm?: number | null;
  turns?: number | null;
}

export default function TrackFingerprint({ metrics, layoutImageUrl, layoutName, lengthKm, turns }: TrackFingerprintProps) {
  const gauges: { value: number; category: string; title: string; key: string }[] = [];

  if (metrics.tdi != null && metrics.tdiCategory)
    gauges.push({ value: metrics.tdi, category: metrics.tdiCategory, title: "Circuit Demand", key: "tdi" });
  if (metrics.tcs100 != null && metrics.tcsCategory)
    gauges.push({ value: metrics.tcs100, category: metrics.tcsCategory, title: "Circuit Character", key: "tcs" });
  if (metrics.csi != null && metrics.csiCategory)
    gauges.push({ value: metrics.csi, category: metrics.csiCategory, title: "Corner Severity", key: "csi" });
  if (metrics.ei != null && metrics.eiCategory)
    gauges.push({ value: metrics.ei, category: metrics.eiCategory, title: "Elevation", key: "ei" });

  if (gauges.length === 0) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 md:flex-row md:items-center md:gap-6">
      {layoutImageUrl && (
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex aspect-[5/3] w-[132px] items-center justify-center">
            <img
              src={layoutImageUrl}
              alt={layoutName ? `${layoutName} layout` : "Circuit layout"}
              className="logo-adapt max-h-full w-full object-contain"
            />
          </div>
          {(layoutName || lengthKm || turns != null) && (
            <div className="min-w-0 md:max-w-[160px]">
              {layoutName && <div className="font-display text-sm font-bold uppercase leading-tight tracking-wide text-foreground">{layoutName}</div>}
              <div className="num mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {lengthKm && <span>{Number(lengthKm).toFixed(3)} km</span>}
                {turns != null && <span>{turns} turns</span>}
              </div>
            </div>
          )}
        </div>
      )}
      <div className={`grid min-w-0 flex-1 grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border ${gauges.length >= 4 ? "lg:grid-cols-4" : gauges.length === 3 ? "lg:grid-cols-3" : ""}`}>
        {gauges.map((g) => (
          <MetricCell key={g.key} value={g.value} category={g.category} title={g.title} />
        ))}
      </div>
    </div>
  );
}
