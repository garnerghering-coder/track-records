import { TrackMetrics, categoryHexColor } from "@/lib/track-calculations";

interface GaugeProps {
  value: number;
  category: string;
  title: string;
  large?: boolean;
}

function SemiCircleGauge({ value, category, title, large }: GaugeProps) {
  const color = categoryHexColor(category);
  const size = large ? 160 : 120;
  const strokeWidth = large ? 10 : 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const dashOffset = circumference * (1 - progress);
  const rounded = Math.round(value);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
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
        {/* Number */}
        <text
          x={size / 2}
          y={size / 2 - (large ? 8 : 4)}
          textAnchor="middle"
          fill={color}
          fontSize={large ? 42 : 30}
          fontFamily="'ModernAge', sans-serif"
          fontWeight="400"
        >
          {rounded}
        </text>
      </svg>
      <span
        className="font-display font-bold tracking-wide uppercase mt-1"
        style={{ color, fontSize: large ? 14 : 12 }}
      >
        {category}
      </span>
      <span className="text-muted-foreground uppercase tracking-widest" style={{ fontSize: large ? 11 : 9 }}>
        {title}
      </span>
    </div>
  );
}

export default function TrackFingerprint({ metrics }: { metrics: TrackMetrics }) {
  const gauges: { value: number; category: string; title: string; key: string }[] = [];

  if (metrics.tdi != null && metrics.tdiCategory)
    gauges.push({ value: metrics.tdi, category: metrics.tdiCategory, title: "Track Demand", key: "tdi" });
  if (metrics.tcs100 != null && metrics.tcsCategory)
    gauges.push({ value: metrics.tcs100, category: metrics.tcsCategory, title: "Track Character", key: "tcs" });
  if (metrics.csi != null && metrics.csiCategory)
    gauges.push({ value: metrics.csi, category: metrics.csiCategory, title: "Corner Severity", key: "csi" });
  if (metrics.ei != null && metrics.eiCategory)
    gauges.push({ value: metrics.ei, category: metrics.eiCategory, title: "Elevation", key: "ei" });

  if (gauges.length === 0) return null;

  const tdi = gauges.find(g => g.key === "tdi");
  const rest = gauges.filter(g => g.key !== "tdi");

  return (
    <div className="flex flex-col items-center gap-4">
      {tdi && <SemiCircleGauge value={tdi.value} category={tdi.category} title={tdi.title} large />}
      {rest.length > 0 && (
        <div className="flex flex-wrap justify-center gap-6">
          {rest.map(g => (
            <SemiCircleGauge key={g.key} value={g.value} category={g.category} title={g.title} />
          ))}
        </div>
      )}
    </div>
  );
}
