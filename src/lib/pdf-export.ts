import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import trackRecordsLogo from "@/assets/track-records-logo.png";

export interface SessionExportData {
  sessionName: string;
  sessionDate: string | null;
  sessionType: string;
  results: any[];
  incidents: any[];
  customColumns?: { key: string; name: string }[];
  hasInt?: boolean;
  teamNameMap?: Record<string, string>;
  weather?: {
    condition_summary?: string | null;
    condition_emoji?: string | null;
    air_temp_min?: number | null;
    air_temp_max?: number | null;
    track_temp_min?: number | null;
    track_temp_max?: number | null;
    rain_mm?: number | null;
    wind_speed_max?: number | null;
  } | null;
}

export interface EventExportParams {
  eventName: string;
  seriesName: string;
  circuitName: string;
  circuitCountry?: string;
  sessions: SessionExportData[];
  onProgress?: (pct: number) => void;
}

function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

/** Check if any result has a truthy value for a given field */
function anyHas(results: any[], field: string): boolean {
  return results.some((r) => {
    const v = r[field];
    return v !== null && v !== undefined && v !== "" && v !== 0;
  });
}

function anyHasExtra(results: any[], key: string): boolean {
  return results.some((r) => r.extra_data?.[key]);
}

function buildSessionTable(s: SessionExportData) {
  const { sessionType, results, customColumns = [], hasInt = false, teamNameMap = {} } = s;
  const isRace = sessionType === "race" || sessionType === "sprint_race";
  const isQual = sessionType === "qualifying" || sessionType === "sprint_qualifying";
  const isPractice = sessionType === "practice" || sessionType === "warmup";

  const head: string[] = [];
  const colExtractors: ((r: any) => string)[] = [];

  const addCol = (label: string, extractor: (r: any) => string) => {
    head.push(label);
    colExtractors.push(extractor);
  };

  // Common leading columns
  addCol("Pos", (r) => String(r.position || ""));
  if (anyHas(results, "car_number")) addCol("No.", (r) => r.car_number || "");
  addCol("Driver", (r) => r.v2_drivers?.full_name || "");
  if (results.some((r) => r.v2_teams)) addCol("Team", (r) => {
    const teamId = r.v2_teams?.id;
    if (teamId && teamNameMap[teamId]) return teamNameMap[teamId];
    return r.v2_teams?.short_name || r.v2_teams?.full_name || "";
  });
  if (results.some((r) => r.v2_cars)) addCol("Car", (r) => r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "");

  if (isPractice || sessionType === "other") {
    if (anyHas(results, "best_lap_time")) addCol("Best Lap", (r) => r.best_lap_time || "");
    if (anyHas(results, "gap_to_p1")) addCol("Gap", (r) => r.gap_to_p1 || "");
    if (hasInt && anyHasExtra(results, "Int")) addCol("Int", (r) => r.extra_data?.Int || "");
    if (anyHas(results, "laps_run")) addCol("Laps", (r) => String(r.laps_run || ""));
  } else if (isQual) {
    if (anyHas(results, "q1_time")) addCol("Q1", (r) => r.q1_time || "");
    if (anyHas(results, "q2_time")) addCol("Q2", (r) => r.q2_time || "");
    if (anyHas(results, "q3_time")) addCol("Q3", (r) => r.q3_time || "");
    if (anyHas(results, "best_time")) addCol("Best", (r) => r.best_time || "");
    if (anyHas(results, "gap_to_pole")) addCol("Gap", (r) => r.gap_to_pole || "");
    if (hasInt && anyHasExtra(results, "Int")) addCol("Int", (r) => r.extra_data?.Int || "");
    if (anyHas(results, "laps_run")) addCol("Laps", (r) => String(r.laps_run || ""));
  } else {
    // Race
    if (anyHas(results, "laps_completed")) addCol("Laps", (r) => String(r.laps_completed || ""));
    if (anyHas(results, "total_time")) addCol("Time", (r) => r.total_time || "");
    if (anyHas(results, "gap_to_leader")) addCol("Gap", (r) => r.gap_to_leader || "");
    if (hasInt && anyHasExtra(results, "Int")) addCol("Int", (r) => r.extra_data?.Int || "");
    if (anyHas(results, "fastest_lap_time")) addCol("FL", (r) => r.fastest_lap_time || "");
    if (anyHas(results, "average_lap_time")) addCol("Avg Lap", (r) => r.average_lap_time || "");
    if (results.some((r) => r.pit_stops != null)) addCol("Pits", (r) => String(r.pit_stops ?? ""));
    if (results.some((r) => r.points != null && r.points !== 0)) addCol("Pts", (r) => String(r.points ?? ""));
    if (results.some((r) => r.status && r.status !== "finished")) addCol("Status", (r) => r.status && r.status !== "finished" ? r.status.toUpperCase() : "");
  }

  // Custom extra_data columns (only if they have data)
  for (const col of customColumns) {
    if (anyHasExtra(results, col.key)) {
      addCol(col.name, (r) => String(r.extra_data?.[col.key] ?? ""));
    }
  }

  const body = results.map((r) => colExtractors.map((fn) => fn(r)));

  return { head, body };
}

export async function exportEventPdf(params: EventExportParams) {
  const { eventName, seriesName, circuitName, circuitCountry, sessions, onProgress } = params;

  let logoData: string | null = null;
  try {
    // Use a short timeout so a slow/broken image doesn't hang the export
    logoData = await Promise.race([
      loadImageAsBase64(trackRecordsLogo),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Logo load timeout")), 3000)),
    ]) as string;
  } catch (e) {
    console.warn("Logo load skipped:", e);
  }

  onProgress?.(10);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 0; i < sessions.length; i++) {
    if (i > 0) doc.addPage();

    const s = sessions[i];

    // --- Header band: logo left, event info right-aligned ---
    const headerY = 12;

    // Logo (right-aligned)
    if (logoData) {
      const imgProps = doc.getImageProperties(logoData);
      const logoHeight = 10;
      const logoWidth = (imgProps.width / imgProps.height) * logoHeight;
      doc.addImage(logoData, "PNG", pageWidth - 14 - logoWidth, 7, logoWidth, logoHeight);
    } else {
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text("TRACK RECORDS", pageWidth - 14, headerY, { align: "right" });
    }

    // Event name (left-aligned, bold)
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(eventName, 14, headerY - 1);

    // Series · Circuit, Country (left-aligned, smaller)
    doc.setFontSize(8);
    doc.setTextColor(100);
    const locationStr = [circuitName, circuitCountry].filter(Boolean).join(", ");
    const subtitle = [seriesName, locationStr].filter(Boolean).join(" · ");
    doc.text(subtitle, 14, headerY + 5);

    // Export date (left, small, below subtitle)
    doc.setFontSize(6);
    doc.setTextColor(160);
    doc.text(new Date().toLocaleDateString(), 14, headerY + 9);

    // Session name & date
    let y = 24;
    doc.setFontSize(11);
    doc.setTextColor(50);
    const sessionLabel = s.sessionName + (s.sessionDate ? ` — ${new Date(s.sessionDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}` : "");
    doc.text(sessionLabel, 14, y);

    let tableStartY = y + 5;

    // Weather snippet
    if (s.weather) {
      const w = s.weather;
      const parts: string[] = [];
      if (w.condition_summary) parts.push(w.condition_summary);
      if (w.air_temp_min != null || w.air_temp_max != null) {
        const temps = [w.air_temp_min, w.air_temp_max].filter((t) => t != null);
        parts.push(`Air: ${temps.join("–")}°C`);
      }
      if (w.track_temp_min != null || w.track_temp_max != null) {
        const temps = [w.track_temp_min, w.track_temp_max].filter((t) => t != null);
        parts.push(`Track: ${temps.join("–")}°C`);
      }
      if (w.rain_mm != null && w.rain_mm > 0) parts.push(`Rain: ${w.rain_mm}mm`);
      if (w.wind_speed_max != null) parts.push(`Wind: ${w.wind_speed_max} km/h`);

      if (parts.length > 0) {
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text("Weather: " + parts.join("  |  "), 14, tableStartY);
        tableStartY += 5;
      }
    }

    // Table
    const { head, body } = buildSessionTable(s);

    autoTable(doc, {
      startY: tableStartY,
      head: [head],
      body,
      styles: { fontSize: 7, cellPadding: 1.5, font: "courier" },
      headStyles: { fillColor: [30, 30, 35], textColor: [255, 255, 255], fontStyle: "bold", font: "helvetica" },
      alternateRowStyles: { fillColor: [245, 245, 248] },
      columnStyles: { 0: { halign: "center", cellWidth: 10 } },
    });

    const isRace = s.sessionType === "race" || s.sessionType === "sprint_race";

    // Incidents
    if (isRace && s.incidents.length > 0) {
      let incY = (doc as any).previousAutoTable.finalY + 8;
      if (incY > pageHeight - 20) {
        doc.addPage();
        incY = 14;
      }
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text("Incidents", 14, incY);

      let iy = incY + 5;
      doc.setFontSize(7);
      doc.setTextColor(80);
      for (const inc of s.incidents) {
        if (iy > pageHeight - 10) {
          doc.addPage();
          iy = 14;
        }
        const text = `${inc.lap_number ? `Lap ${inc.lap_number}: ` : ""}${inc.description || ""}${inc.penalty_type ? ` — ${inc.penalty_type}` : ""}${inc.outcome ? ` (${inc.outcome})` : ""}`;
        doc.text(text, 16, iy);
        iy += 4;
      }
    }

    // Fastest lap highlight for races
    if (isRace && s.results.length > 0) {
      const fastest = s.results.reduce((best: any, r: any) => {
        if (!r.fastest_lap_time) return best;
        if (!best || r.fastest_lap_time < best.fastest_lap_time) return r;
        return best;
      }, null);
      if (fastest) {
        let flY = (doc as any).previousAutoTable.finalY + (isRace && s.incidents.length > 0 ? s.incidents.length * 4 + 14 : 8);
        if (flY > pageHeight - 10) {
          doc.addPage();
          flY = 14;
        }
        doc.setFontSize(8);
        doc.setTextColor(200, 120, 0);
        doc.text(`Fastest Lap: ${fastest.v2_drivers?.full_name || "Unknown"} — ${fastest.fastest_lap_time}`, 14, flY);
      }
    }

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(180);
    doc.text(`Page ${i + 1} of ${sessions.length}`, pageWidth - 14, pageHeight - 6, { align: "right" });

    onProgress?.(10 + ((i + 1) / sessions.length) * 85);
  }

  const fileName = `${eventName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  
  // Generate blob and trigger download
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  
  // Attempt 1: programmatic <a> click (works in most browsers)
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Attempt 2: fallback for sandboxed iframes — open in new window
  // Some environments block the <a> download silently; opening the blob URL
  // in a new tab lets the user save the PDF from their browser's viewer.
  try {
    const newWin = window.open(blobUrl, "_blank");
    if (!newWin) {
      // popup blocked — the <a> click is our only option
      console.info("PDF generated. If download didn't start, try opening the preview in a new tab.");
    }
  } catch {
    // ignore — the <a> approach should have worked
  }
  
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  onProgress?.(100);
}

// Legacy single-session wrapper (kept for backward compat)
export async function exportSessionPdf(params: {
  eventName: string;
  seriesName: string;
  circuitName: string;
  sessionName: string;
  sessionDate: string | null;
  sessionType: string;
  results: any[];
  incidents: any[];
  customColumns?: { key: string; name: string }[];
  hasInt?: boolean;
}) {
  await exportEventPdf({
    eventName: params.eventName,
    seriesName: params.seriesName,
    circuitName: params.circuitName,
    sessions: [{
      sessionName: params.sessionName,
      sessionDate: params.sessionDate,
      sessionType: params.sessionType,
      results: params.results,
      incidents: params.incidents,
      customColumns: params.customColumns,
      hasInt: params.hasInt,
    }],
  });
}
