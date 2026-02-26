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
  const isRace = sessionType === "race" || sessionType === "sprint_race" || sessionType === "endurance_race";
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

  // PIC and Class right after Pos (before No./Driver)
  const hasPIC = results.some((r) => r.extra_data?.PIC);
  const hasClass = results.some((r) => r.extra_data?.Class);
  if (hasPIC) addCol("PIC", (r) => String(r.extra_data?.PIC || ""));
  if (hasClass) addCol("Class", (r) => r.extra_data?.Class || "");

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
    if (results.some((r) => r.points != null && r.points !== 0)) addCol("Pts", (r) => String(r.points ?? ""));
  } else if (isQual) {
    if (anyHas(results, "q1_time")) addCol("Q1", (r) => r.q1_time || "");
    if (anyHas(results, "q2_time")) addCol("Q2", (r) => r.q2_time || "");
    if (anyHas(results, "q3_time")) addCol("Q3", (r) => r.q3_time || "");
    if (anyHas(results, "best_time")) addCol("Best", (r) => r.best_time || "");
    if (anyHas(results, "gap_to_pole")) addCol("Gap", (r) => r.gap_to_pole || "");
    if (hasInt && anyHasExtra(results, "Int")) addCol("Int", (r) => r.extra_data?.Int || "");
    if (anyHas(results, "laps_run")) addCol("Laps", (r) => String(r.laps_run || ""));
    if (results.some((r) => r.points != null && r.points !== 0)) addCol("Pts", (r) => String(r.points ?? ""));
  } else {
    // Race
    if (anyHas(results, "laps_completed")) addCol("Laps", (r) => String(r.laps_completed || ""));
    if (anyHas(results, "total_time")) addCol("Time", (r) => r.total_time || "");
    if (anyHas(results, "gap_to_leader")) addCol("Gap", (r) => r.gap_to_leader || "");
    if (hasInt && anyHasExtra(results, "Int")) addCol("Int", (r) => r.extra_data?.Int || "");
    
    if (anyHas(results, "average_lap_time")) addCol("Avg Lap", (r) => r.average_lap_time || "");
    if (results.some((r) => r.pit_stops != null)) addCol("Pits", (r) => String(r.pit_stops ?? ""));
    if (results.some((r) => r.points != null && r.points !== 0)) addCol("Pts", (r) => String(r.points ?? ""));
    if (results.some((r) => r.status && r.status !== "finished")) addCol("Status", (r) => r.status && r.status !== "finished" ? r.status.toUpperCase() : "");
  }

  // Custom extra_data columns (only if they have data) — skip PIC/Class already added above
  for (const col of customColumns) {
    if (col.key === "PIC" || col.key === "Class") continue;
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

    // --- Header: Event (left) | Logo (center) | Session (right) ---
    // All elements start at same topY for vertical alignment
    const topY = 10;
    const centerX = pageWidth / 2;
    const margin = 14;

    // Col 1: Event info (left)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(eventName, margin, topY + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    if (seriesName) doc.text(seriesName, margin, topY + 9);
    const locationStr = [circuitName, circuitCountry].filter(Boolean).join(", ");
    if (locationStr) doc.text(locationStr, margin, topY + 13);

    // Col 2: Logo (centered, vertically aligned to topY)
    if (logoData) {
      const imgProps = doc.getImageProperties(logoData);
      const logoHeight = 12;
      const logoWidth = (imgProps.width / imgProps.height) * logoHeight;
      doc.addImage(logoData, "PNG", centerX - logoWidth / 2, topY, logoWidth, logoHeight);
    } else {
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text("TRACK RECORDS", centerX, topY + 4, { align: "center" });
    }

    // Col 3: Session info (right-aligned, starting at same topY)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(50);
    const sessionLabel = s.sessionName + (s.sessionDate ? ` — ${new Date(s.sessionDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}` : "");
    doc.text(sessionLabel, pageWidth - margin, topY + 4, { align: "right" });
    doc.setFont("helvetica", "normal");

    // Weather below session name (right-aligned)
    let rightLineY = topY + 9;
    if (s.weather) {
      const w = s.weather;
      doc.setFontSize(7);
      doc.setTextColor(120);

      const cleanSummary = (w.condition_summary || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
      if (cleanSummary) {
        doc.text(cleanSummary, pageWidth - margin, rightLineY, { align: "right" });
        rightLineY += 3.5;
      }

      const tempParts: string[] = [];
      if (w.air_temp_min != null || w.air_temp_max != null) {
        const temps = [w.air_temp_min, w.air_temp_max].filter((t) => t != null);
        tempParts.push(`Air: ${temps.join("-")}°C`);
      }
      if (w.track_temp_min != null || w.track_temp_max != null) {
        const temps = [w.track_temp_min, w.track_temp_max].filter((t) => t != null);
        tempParts.push(`Track: ${temps.join("-")}°C`);
      }
      if (tempParts.length > 0) {
        doc.text(tempParts.join("  |  "), pageWidth - margin, rightLineY, { align: "right" });
        rightLineY += 3.5;
      }

      const extraParts: string[] = [];
      if (w.rain_mm != null && w.rain_mm > 0) extraParts.push(`Rain: ${w.rain_mm}mm`);
      if (w.wind_speed_max != null) extraParts.push(`Wind: ${w.wind_speed_max} km/h`);
      if (extraParts.length > 0) {
        doc.text(extraParts.join("  |  "), pageWidth - margin, rightLineY, { align: "right" });
        rightLineY += 3.5;
      }
    }

    const bottomY = Math.max(topY + 13, rightLineY);

    let tableStartY = bottomY + 4;

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

    const isRace = s.sessionType === "race" || s.sessionType === "sprint_race" || s.sessionType === "endurance_race";

    // Incidents
    const tableFinalY = (doc as any).previousAutoTable?.finalY ?? tableStartY + 20;

    if (isRace && s.incidents.length > 0) {
      let incY = tableFinalY + 8;
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


    // Footer
    doc.setFontSize(6);
    doc.setTextColor(180);
    doc.text(new Date().toLocaleDateString(), 14, pageHeight - 6);
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
