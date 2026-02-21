import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WeatherData {
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

export default function WeatherBubble({ weather }: { weather: WeatherData | null }) {
  if (!weather) return null;

  const emoji = weather.condition_emoji || "🌤️";
  const hasRain = weather.rain_mm != null && weather.rain_mm > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 border border-border cursor-default text-sm leading-snug">
            <span className="text-sm leading-none">{emoji}</span>
            {hasRain && (
              <span className="text-[10px] font-medium text-muted-foreground">{weather.rain_mm}mm</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="w-64 p-3">
          <p className="text-xs font-semibold text-foreground mb-1.5">Weather</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="text-sm mr-1">{emoji}</span>
              <span className="text-foreground font-medium">{weather.condition_summary || "No data"}</span>
            </p>
            {(weather.air_temp_min != null || weather.air_temp_max != null) && (
              <p>Air: {weather.air_temp_min}–{weather.air_temp_max} °C</p>
            )}
            {(weather.track_temp_min != null || weather.track_temp_max != null) && (
              <p>Track: {weather.track_temp_min}–{weather.track_temp_max} °C</p>
            )}
            {hasRain && (
              <p>Rain: {weather.rain_mm} mm{weather.rain_detail ? ` (${weather.rain_detail})` : ""}</p>
            )}
            {weather.wind_summary && (
              <p>Wind: {weather.wind_summary}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
