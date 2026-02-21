import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HourlyWeather {
  time: string;
  temperature_2m: number;
  precipitation: number;
  weathercode: number;
  windspeed_10m: number;
  winddirection_10m: number;
}

// WMO Weather Codes to emoji/description
function wmoToEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "🌤️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 57) return "🌧️";
  if (code <= 65) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

function wmoToDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 55) return "Drizzle";
  if (code <= 57) return "Freezing drizzle";
  if (code <= 61) return "Light rain";
  if (code <= 63) return "Moderate rain";
  if (code <= 65) return "Heavy rain";
  if (code <= 67) return "Freezing rain";
  if (code <= 71) return "Light snow";
  if (code <= 75) return "Heavy snow";
  if (code === 77) return "Snow grains";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96) return "Thunderstorm with hail";
  return "Unknown";
}

function windDirectionStr(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id required");

    // Get session with event and circuit
    const { data: session, error: sessErr } = await supabase
      .from("v2_sessions")
      .select("*, v2_events(*, v2_circuits(latitude, longitude), v2_seasons(year))")
      .eq("id", session_id)
      .single();
    if (sessErr || !session) throw new Error("Session not found");

    const circuit = session.v2_events?.v2_circuits;
    if (!circuit?.latitude || !circuit?.longitude) {
      throw new Error("Circuit coordinates not set. Please add latitude/longitude to the circuit first.");
    }

    const sessionDate = session.date?.split("T")[0] || session.v2_events?.start_date;
    if (!sessionDate) throw new Error("Session or event date not set.");

    const startTime = session.start_time || "09:00";
    const endTime = session.end_time || "18:00";

    // Fetch from Open-Meteo Archive API
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${circuit.latitude}&longitude=${circuit.longitude}&start_date=${sessionDate}&end_date=${sessionDate}&hourly=temperature_2m,precipitation,weathercode,windspeed_10m,winddirection_10m&timezone=auto`;

    const resp = await fetch(url);
    if (!resp.ok) {
      // Try forecast API for recent/future dates
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${circuit.latitude}&longitude=${circuit.longitude}&start_date=${sessionDate}&end_date=${sessionDate}&hourly=temperature_2m,precipitation,weathercode,windspeed_10m,winddirection_10m&timezone=auto&past_days=7`;
      const forecastResp = await fetch(forecastUrl);
      if (!forecastResp.ok) throw new Error("Weather data not available for this date.");
      var weatherData = await forecastResp.json();
    } else {
      var weatherData = await resp.json();
    }

    if (!weatherData.hourly?.time?.length) throw new Error("No hourly weather data returned.");

    // Filter to session hours
    const startHour = parseInt(startTime.split(":")[0]);
    const endHour = parseInt(endTime.split(":")[0]);

    const hourly = weatherData.hourly;
    const sessionHours: HourlyWeather[] = [];

    for (let i = 0; i < hourly.time.length; i++) {
      // Parse hour directly from string (e.g. "2024-01-15T14:00") to avoid timezone shifts
      const hour = parseInt(hourly.time[i].split("T")[1]?.split(":")[0] ?? "0");
      if (hour >= startHour && hour <= endHour) {
        sessionHours.push({
          time: hourly.time[i],
          temperature_2m: hourly.temperature_2m[i],
          precipitation: hourly.precipitation[i],
          weathercode: hourly.weathercode[i],
          windspeed_10m: hourly.windspeed_10m[i],
          winddirection_10m: hourly.winddirection_10m[i],
        });
      }
    }

    if (sessionHours.length === 0) throw new Error("No weather data for session time window.");

    // Compute summary stats
    const temps = sessionHours.map(h => h.temperature_2m).filter(t => t != null);
    const airTempMin = Math.round(Math.min(...temps) * 10) / 10;
    const airTempMax = Math.round(Math.max(...temps) * 10) / 10;

    const totalRain = Math.round(sessionHours.reduce((sum, h) => sum + (h.precipitation || 0), 0) * 10) / 10;
    
    const winds = sessionHours.map(h => h.windspeed_10m).filter(w => w != null);
    const windMin = Math.round(Math.min(...winds));
    const windMax = Math.round(Math.max(...winds));
    const avgWindDir = Math.round(sessionHours.reduce((sum, h) => sum + (h.winddirection_10m || 0), 0) / sessionHours.length);

    // Build rain detail
    let rainDetail: string | null = null;
    if (totalRain > 0) {
      const rainHours = sessionHours.filter(h => h.precipitation > 0);
      if (rainHours.length > 0) {
        const startRain = rainHours[0].time.split("T")[1]?.substring(0, 5) || "?";
        const endRain = rainHours[rainHours.length - 1].time.split("T")[1]?.substring(0, 5) || "?";
        if (rainHours.length === 1) {
          rainDetail = `around ${startRain}`;
        } else {
          rainDetail = `${startRain}–${endRain}`;
        }
      }
    }

    // Build condition summary and emoji sequence
    const uniqueCodes = [...new Set(sessionHours.map(h => h.weathercode))];
    const emojis = uniqueCodes.map(c => wmoToEmoji(c));
    const conditionEmoji = emojis.join("");

    let conditionSummary: string;
    if (uniqueCodes.length === 1) {
      conditionSummary = wmoToDescription(uniqueCodes[0]);
    } else {
      const descriptions = uniqueCodes.map(c => wmoToDescription(c));
      const hasRain = uniqueCodes.some(c => c >= 51);
      const hasDry = uniqueCodes.some(c => c < 51);
      if (hasRain && hasDry) {
        conditionSummary = `Variable: ${descriptions.filter((d, i) => uniqueCodes[i] < 51)[0] || "Dry"} → ${descriptions.filter((d, i) => uniqueCodes[i] >= 51)[0] || "Wet"}`;
      } else {
        conditionSummary = descriptions.join(", ");
      }
    }

    // Wind summary
    let windSummary: string;
    if (windMax < 15) windSummary = "Light winds";
    else if (windMax < 30) windSummary = `${windMin}–${windMax} km/h ${windDirectionStr(avgWindDir)}`;
    else windSummary = `${windMin}–${windMax} km/h ${windDirectionStr(avgWindDir)}, gusts to ${windMax} km/h`;

    // Upsert weather data
    const weatherRecord = {
      session_id,
      condition_summary: conditionSummary,
      condition_emoji: conditionEmoji,
      air_temp_min: airTempMin,
      air_temp_max: airTempMax,
      track_temp_min: null,
      track_temp_max: null,
      rain_mm: totalRain,
      rain_detail: rainDetail,
      wind_summary: windSummary,
      wind_speed_min: windMin,
      wind_speed_max: windMax,
      wind_direction: windDirectionStr(avgWindDir),
      hourly_data: sessionHours,
      fetched_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("v2_session_weather")
      .upsert(weatherRecord, { onConflict: "session_id" });
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ success: true, weather: weatherRecord }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
