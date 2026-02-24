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
  "Mountain": "Extreme vertical variation — elevation is a defining challenge of every lap.",
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
  "Circuit Demand": "An overall difficulty rating combining circuit character, elevation, and braking severity.",
  "Circuit Character": "Classifies the configuration from power-focused straights to tight technical sections based on corner density and straight ratio.",
  "Corner Severity": "Measures the proportion of corners that require heavy braking effort.",
  "Elevation": "Rates the total elevation change relative to track length.",
};

interface GaugeProps {
  value: number;
  category: string;
  title: string;
  large?: boolean;
}

function SemiCircleGauge({ value, category, title, large }: GaugeProps) {
  const color = categoryHexColor(category);
  const size = large ? 140 : 110;
  const strokeWidth = large ? 9 : 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const dashOffset = circumference * (1 - progress);
  const rounded = Math.round(value);
  const explanation = CATEGORY_EXPLANATIONS[category];
  const metricDesc = METRIC_DESCRIPTIONS[title];

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
              {category}
            </span>
            <span className="text-muted-foreground uppercase tracking-widest text-center" style={{ fontSize: large ? 10 : 8 }}>
              {title}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
          {metricDesc && <p className="text-foreground font-medium">{metricDesc}</p>}
          {explanation && <p className="text-muted-foreground">{explanation}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function TrackFingerprint({ metrics }: { metrics: TrackMetrics }) {
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
    <div className="flex items-center gap-6">
      {gauges.map(g => (
        <SemiCircleGauge key={g.key} value={g.value} category={g.category} title={g.title} large={g.key === "tdi"} />
      ))}
    </div>
  );
}
