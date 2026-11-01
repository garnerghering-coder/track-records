import type { LucideIcon } from "lucide-react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface WeatherData {
  condition_summary: string | null;
  condition_emoji: string | null;
  air_temp_min: number | null;
  air_temp_max: number | null;
  track_temp_min: number | null;
  track_temp_max: number | null;
  rain_mm: number | null;
  rain_detail: string | null;
  wind_summary: string | null;
}

/* The weather import stores conditions as an emoji sequence (one per part of
   the session, e.g. "☀️🌇🌙"). We render those as line icons instead. */
const EMOJI_ICONS: [string, LucideIcon, string][] = [
  ["🌦", CloudDrizzle, "Showers"],
  ["🌧", CloudRain, "Rain"],
  ["⛈", CloudLightning, "Storm"],
  ["🌨", CloudSnow, "Snow"],
  ["🌫", CloudFog, "Fog"],
  ["🌤", CloudSun, "Partly cloudy"],
  ["⛅", CloudSun, "Partly cloudy"],
  ["☁", Cloud, "Cloudy"],
  ["🌅", Sunrise, "Dawn"],
  ["🌇", Sunset, "Dusk"],
  ["🌙", Moon, "Night"],
  ["☀", Sun, "Sun"],
];

export function weatherIconsFor(weather: Pick<WeatherData, "condition_emoji" | "condition_summary"> | null): { Icon: LucideIcon; label: string }[] {
  const src = weather?.condition_emoji || "";
  const out: { Icon: LucideIcon; label: string }[] = [];
  let i = 0;
  while (i < src.length) {
    const hit = EMOJI_ICONS.find(([e]) => src.startsWith(e, i));
    if (hit) {
      out.push({ Icon: hit[1], label: hit[2] });
      i += hit[0].length;
    } else i++;
  }
  if (out.length === 0) {
    const s = (weather?.condition_summary || "").toLowerCase();
    if (/thunder|storm/.test(s)) out.push({ Icon: CloudLightning, label: "Storm" });
    else if (/rain|drizzle|shower|wet/.test(s)) out.push({ Icon: CloudRain, label: "Rain" });
    else if (/fog/.test(s)) out.push({ Icon: CloudFog, label: "Fog" });
    else if (/overcast|cloud/.test(s)) out.push({ Icon: CloudSun, label: "Cloudy" });
    else out.push({ Icon: Sun, label: "Clear" });
  }
  // Collapse consecutive duplicates
  return out.filter((x, idx) => idx === 0 || out[idx - 1].Icon !== x.Icon);
}

export function WeatherIcons({ weather, className, size = 14 }: { weather: WeatherData | null; className?: string; size?: number }) {
  const icons = weatherIconsFor(weather);
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={icons.map((i) => i.label).join(", ")}>
      {icons.map(({ Icon }, i) => (
        <Icon key={i} style={{ width: size, height: size }} strokeWidth={1.75} />
      ))}
    </span>
  );
}

const range = (a: number | null, b: number | null) => (a != null && b != null && a !== b ? `${a}–${b}` : `${a ?? b}`);

export default function WeatherBubble({ weather }: { weather: WeatherData | null }) {
  if (!weather) return null;

  const hasRain = weather.rain_mm != null && weather.rain_mm > 0;
  const hasAir = weather.air_temp_min != null || weather.air_temp_max != null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 cursor-default items-center gap-1.5 rounded-sm border bg-background/60 px-1.5 text-muted-foreground">
            <WeatherIcons weather={weather} size={13} />
            {hasAir && <span className="num text-[11px] text-foreground">{range(weather.air_temp_min, weather.air_temp_max)}°</span>}
            {hasRain && <span className="num text-[11px] text-sky-500">{weather.rain_mm}mm</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="w-64 p-3">
          <div className="label-caps mb-1.5">Weather</div>
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <WeatherIcons weather={weather} size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{weather.condition_summary || "No data"}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {hasAir && (
              <>
                <dt className="text-muted-foreground">Air</dt>
                <dd className="num text-foreground">{range(weather.air_temp_min, weather.air_temp_max)} °C</dd>
              </>
            )}
            {(weather.track_temp_min != null || weather.track_temp_max != null) && (
              <>
                <dt className="text-muted-foreground">Track</dt>
                <dd className="num text-foreground">{range(weather.track_temp_min, weather.track_temp_max)} °C</dd>
              </>
            )}
            {hasRain && (
              <>
                <dt className="text-muted-foreground">Rain</dt>
                <dd className="text-foreground">
                  <span className="num">{weather.rain_mm} mm</span>
                  {weather.rain_detail ? ` (${weather.rain_detail})` : ""}
                </dd>
              </>
            )}
            {weather.wind_summary && (
              <>
                <dt className="text-muted-foreground">Wind</dt>
                <dd className="text-foreground">{weather.wind_summary}</dd>
              </>
            )}
          </dl>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
