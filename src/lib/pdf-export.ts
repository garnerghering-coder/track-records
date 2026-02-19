import jsPDF from "jspdf";
import "jspdf-autotable";
import trackRecordsLogo from "@/assets/track-records-logo.png";

interface ExportParams {
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

export async function exportSessionPdf(params: ExportParams) {
  const { eventName, seriesName, circuitName, sessionName, sessionDate, sessionType, results, incidents, customColumns = [], hasInt = false } = params;
  const isRace = sessionType === "race" || sessionType === "sprint_race";
  const isQual = sessionType === "qualifying" || sessionType === "sprint_qualifying";
  const isPractice = sessionType === "practice" || sessionType === "warmup";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 10;
  try {
    const logoData = await loadImageAsBase64(trackRecordsLogo);
    doc.addImage(logoData, "PNG", 14, 8, 40, 12);
    startY = 24;
  } catch (e) {
    console.warn("Logo load failed, using text fallback:", e);
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text("TRACK RECORDS", 14, 14);
    startY = 20;
  }

  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(new Date().toLocaleDateString(), pageWidth - 14, 12, { align: "right" });

  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(eventName, 14, startY + 2);

  doc.setFontSize(10);
  doc.setTextColor(100);
  const subtitle = [seriesName, circuitName, sessionName].filter(Boolean).join(" • ");
  doc.text(subtitle, 14, startY + 9);

  let tableStartY = startY + 13;

  if (sessionDate) {
    doc.text(new Date(sessionDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), 14, startY + 15);
    tableStartY = startY + 19;
  }

  let head: string[] = [];
  let body: string[][] = [];
  const customNames = customColumns.map(c => c.name);

  if (isPractice || sessionType === "other") {
    head = ["Pos", "No.", "Driver", "Nat", "Team", "Car", "Best Lap", "Gap"];
    if (hasInt) head.push("Int");
    head.push("Laps", ...customNames);
    body = results.map(r => {
      const row = [
        String(r.position || ""),
        r.car_number || "",
        r.v2_drivers?.full_name || "",
        r.v2_drivers?.nationality || "",
        r.v2_teams?.short_name || r.v2_teams?.full_name || "",
        r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
        r.best_lap_time || "",
        r.gap_to_p1 || "",
      ];
      if (hasInt) row.push(r.extra_data?.Int || "");
      row.push(String(r.laps_run || ""), ...customColumns.map(c => String(r.extra_data?.[c.key] ?? "")));
      return row;
    });
  } else if (isQual) {
    head = ["Pos", "No.", "Driver", "Nat", "Team", "Car", "Q1", "Q2", "Q3", "Best", "Gap"];
    if (hasInt) head.push("Int");
    head.push("Laps", ...customNames);
    body = results.map(r => {
      const row = [
        String(r.position || ""),
        r.car_number || "",
        r.v2_drivers?.full_name || "",
        r.v2_drivers?.nationality || "",
        r.v2_teams?.short_name || r.v2_teams?.full_name || "",
        r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
        r.q1_time || "", r.q2_time || "", r.q3_time || "",
        r.best_time || "", r.gap_to_pole || "",
      ];
      if (hasInt) row.push(r.extra_data?.Int || "");
      row.push(String(r.laps_run || ""), ...customColumns.map(c => String(r.extra_data?.[c.key] ?? "")));
      return row;
    });
  } else {
    head = ["Pos", "No.", "Driver", "Nat", "Team", "Car", "Laps", "Time/Gap", "FL"];
    if (hasInt) head.push("Int");
    head.push("Pits", "Pts", "Status", ...customNames);
    body = results.map(r => {
      const row = [
        String(r.position || ""),
        r.car_number || "",
        r.v2_drivers?.full_name || "",
        r.v2_drivers?.nationality || "",
        r.v2_teams?.short_name || r.v2_teams?.full_name || "",
        r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "",
        String(r.laps_completed || ""),
        r.total_time || r.gap_to_leader || "",
        r.fastest_lap_time || "",
      ];
      if (hasInt) row.push(r.extra_data?.Int || "");
      row.push(
        String(r.pit_stops ?? ""),
        String(r.points ?? ""),
        r.status && r.status !== "finished" ? r.status.toUpperCase() : "",
        ...customColumns.map(c => String(r.extra_data?.[c.key] ?? "")),
      );
      return row;
    });
  }

  (doc as any).autoTable({
    startY: tableStartY,
    head: [head],
    body,
    styles: { fontSize: 7, cellPadding: 1.5, font: "courier" },
    headStyles: { fillColor: [30, 30, 35], textColor: [255, 255, 255], fontStyle: "bold", font: "helvetica" },
    alternateRowStyles: { fillColor: [245, 245, 248] },
    columnStyles: { 0: { halign: "center", cellWidth: 10 }, 1: { halign: "center", cellWidth: 12 } },
  });

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
      doc.text(`Fastest Lap: ${fastest.v2_drivers?.full_name || "Unknown"} — ${fastest.fastest_lap_time}`, 14, y);
    }
  }

  doc.save(`${eventName.replace(/\s+/g, "-").toLowerCase()}_${sessionName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
