import jsPDF from "jspdf";
import "jspdf-autotable";

interface ExportParams {
  eventName: string;
  seriesName: string;
  circuitName: string;
  sessionName: string;
  sessionDate: string | null;
  sessionType: string;
  results: any[];
  incidents: any[];
}

export function exportSessionPdf(params: ExportParams) {
  const { eventName, seriesName, circuitName, sessionName, sessionDate, sessionType, results, incidents } = params;
  const isRace = sessionType === "race" || sessionType === "sprint_race";
  const isQual = sessionType === "qualifying" || sessionType === "sprint_qualifying";
  const isPractice = sessionType === "practice" || sessionType === "warmup";

  // Landscape for wide tables
  const doc = new jsPDF({ orientation: isRace || isQual ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("TRACK RECORDS", 14, 10);
  doc.text(new Date().toLocaleDateString(), pageWidth - 14, 10, { align: "right" });

  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(eventName, 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100);
  const subtitle = [seriesName, circuitName, sessionName].filter(Boolean).join(" • ");
  doc.text(subtitle, 14, 29);

  if (sessionDate) {
    doc.text(new Date(sessionDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), 14, 35);
  }

  // Build table
  let head: string[] = [];
  let body: string[][] = [];

  if (isPractice || sessionType === "other") {
    head = ["Pos", "Driver", "Team", "Car", "Best Lap", "Gap", "Laps"];
    body = results.map(r => [
      String(r.position || ""),
      r.v2_drivers?.full_name || "",
      r.v2_teams?.short_name || r.v2_teams?.full_name || "",
      r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
      r.best_lap_time || "",
      r.gap_to_p1 || "",
      String(r.laps_run || ""),
    ]);
  } else if (isQual) {
    head = ["Pos", "Driver", "Team", "Car", "Q1", "Q2", "Q3", "Best", "Gap", "Laps"];
    body = results.map(r => [
      String(r.position || ""),
      r.v2_drivers?.full_name || "",
      r.v2_teams?.short_name || r.v2_teams?.full_name || "",
      r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
      r.q1_time || "", r.q2_time || "", r.q3_time || "",
      r.best_time || "", r.gap_to_pole || "",
      String(r.laps_run || ""),
    ]);
  } else {
    head = ["Pos", "Driver", "Team", "Car", "Laps", "Time/Gap", "FL", "Pits", "Pts", "Status"];
    body = results.map(r => [
      String(r.position || ""),
      r.v2_drivers?.full_name || "",
      r.v2_teams?.short_name || r.v2_teams?.full_name || "",
      r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
      String(r.laps_completed || ""),
      r.total_time || r.gap_to_leader || "",
      r.fastest_lap_time || "",
      String(r.pit_stops ?? ""),
      String(r.points ?? ""),
      r.status && r.status !== "finished" ? r.status.toUpperCase() : "",
    ]);
  }

  (doc as any).autoTable({
    startY: sessionDate ? 40 : 34,
    head: [head],
    body,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      font: "courier",
    },
    headStyles: {
      fillColor: [30, 30, 35],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      font: "helvetica",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 248],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
    },
  });

  // Incidents section
  if (isRace && incidents.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text("Incidents", 14, finalY);

    let y = finalY + 5;
    doc.setFontSize(7);
    doc.setTextColor(80);
    incidents.forEach(inc => {
      const text = `${inc.lap_number ? `Lap ${inc.lap_number}: ` : ""}${inc.description || ""}${inc.penalty_type ? ` — ${inc.penalty_type}` : ""}${inc.outcome ? ` (${inc.outcome})` : ""}`;
      doc.text(text, 16, y);
      y += 4;
    });
  }

  // Fastest lap highlight for race
  if (isRace && results.length > 0) {
    const fastest = results.reduce((best: any, r: any) => {
      if (!r.fastest_lap_time) return best;
      if (!best || r.fastest_lap_time < best.fastest_lap_time) return r;
      return best;
    }, null);
    if (fastest) {
      const y = (doc as any).lastAutoTable.finalY + (incidents.length > 0 ? incidents.length * 4 + 14 : 8);
      doc.setFontSize(8);
      doc.setTextColor(200, 120, 0);
      doc.text(`⚡ Fastest Lap: ${fastest.v2_drivers?.full_name || "Unknown"} — ${fastest.fastest_lap_time}`, 14, y);
    }
  }

  doc.save(`${eventName.replace(/\s+/g, "-").toLowerCase()}_${sessionName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
