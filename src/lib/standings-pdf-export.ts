import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import trackRecordsLogo from "@/assets/track-records-logo.png";
import { supabase } from "@/integrations/supabase/client";

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

export interface StandingsPdfParams {
  seriesName: string;
  year: number;
  seasonId: string;
  className?: string | null;
  onProgress?: (pct: number) => void;
}

interface EventSessionGroup {
  eventName: string;
  circuitName: string;
  sessions: { sessionId: string; sessionName: string; sessionType: string }[];
}

interface CarRow {
  carNumber: string;
  driverNames: string[];
  teamName: string | null;
  className: string | null;
  pointsBySession: Record<string, number>; // sessionId -> points
  totalPoints: number;
}

export async function exportStandingsPdf(params: StandingsPdfParams) {
  const { seriesName, year, seasonId, className, onProgress } = params;

  onProgress?.(5);

  // 1. Fetch events for this season, sorted chronologically
  const { data: eventsData } = await supabase
    .from("v2_events")
    .select("id, name, start_date, v2_circuits(name)")
    .eq("season_id", seasonId)
    .eq("status", "published" as any)
    .order("start_date", { ascending: true });

  const events = (eventsData || []) as any[];
  if (events.length === 0) {
    alert("No published events found for this season.");
    return;
  }

  onProgress?.(15);

  const eventIds = events.map((e: any) => e.id);

  // 2. Fetch all parent sessions for these events, ordered
  const { data: sessionsData } = await supabase
    .from("v2_sessions")
    .select("id, event_id, name, session_type, sort_order, parent_session_id")
    .in("event_id", eventIds)
    .is("parent_session_id", null)
    .order("sort_order", { ascending: true });

  const sessions = (sessionsData || []) as any[];

  onProgress?.(25);

  // Build event -> sessions grouping
  const eventSessionGroups: EventSessionGroup[] = [];
  const sessionEventMap: Record<string, string> = {};
  for (const ev of events) {
    const evSessions = sessions
      .filter((s: any) => s.event_id === ev.id)
      .map((s: any) => ({
        sessionId: s.id,
        sessionName: s.name || s.session_type,
        sessionType: s.session_type,
      }));
    if (evSessions.length > 0) {
      eventSessionGroups.push({
        eventName: ev.name,
        circuitName: ev.v2_circuits?.name || ev.name,
        sessions: evSessions,
      });
      for (const s of evSessions) {
        sessionEventMap[s.sessionId] = ev.id;
      }
    }
  }

  // All session IDs (flat)
  const allSessionIds = eventSessionGroups.flatMap((g) => g.sessions.map((s) => s.sessionId));

  if (allSessionIds.length === 0) {
    alert("No sessions found.");
    return;
  }

  // 3. Fetch all results with points
  const [{ data: raceRes }, { data: qualRes }, { data: pracRes }] = await Promise.all([
    supabase
      .from("v2_race_results" as any)
      .select("car_number, driver_id, points, session_id, extra_data, v2_drivers(full_name), v2_teams(id, full_name)")
      .in("session_id", allSessionIds),
    supabase
      .from("v2_qualifying_results" as any)
      .select("car_number, driver_id, points, session_id, extra_data, v2_drivers(full_name), v2_teams(id, full_name)")
      .in("session_id", allSessionIds),
    supabase
      .from("v2_practice_results" as any)
      .select("car_number, driver_id, points, session_id, extra_data, v2_drivers(full_name), v2_teams(id, full_name)")
      .in("session_id", allSessionIds),
  ]);

  onProgress?.(50);

  // Fetch team season aliases
  const { data: teamSeasonNames } = await supabase
    .from("v2_team_season_names" as any)
    .select("team_id, season_id, display_name")
    .eq("season_id", seasonId);

  const teamAliasMap = new Map<string, string>();
  for (const tsn of (teamSeasonNames || []) as any[]) {
    teamAliasMap.set(tsn.team_id, tsn.display_name);
  }

  const allResults = [
    ...((raceRes || []) as any[]),
    ...((qualRes || []) as any[]),
    ...((pracRes || []) as any[]),
  ];

  // 4. Group by car_number
  const carMap = new Map<string, CarRow>();
  const countedPoints = new Set<string>();

  for (const r of allResults) {
    if (!r.car_number) continue;
    const pts = r.points != null ? Number(r.points) : 0;
    const resultClass = r.extra_data?.Class || r.extra_data?.class || null;

    const teamId = r.v2_teams?.id || null;
    const teamDisplayName =
      (teamId ? teamAliasMap.get(teamId) : null) || r.v2_teams?.full_name || null;

    if (!carMap.has(r.car_number)) {
      carMap.set(r.car_number, {
        carNumber: r.car_number,
        driverNames: [],
        teamName: teamDisplayName,
        className: resultClass,
        pointsBySession: {},
        totalPoints: 0,
      });
    }

    const entry = carMap.get(r.car_number)!;

    // Deduplicate points per car per session
    const pointsKey = `${r.car_number}|${r.session_id}`;
    if (pts > 0 && !countedPoints.has(pointsKey)) {
      entry.pointsBySession[r.session_id] =
        (entry.pointsBySession[r.session_id] || 0) + pts;
      entry.totalPoints += pts;
      countedPoints.add(pointsKey);
    }

    // Collect unique driver names
    if (r.v2_drivers?.full_name && !entry.driverNames.includes(r.v2_drivers.full_name)) {
      entry.driverNames.push(r.v2_drivers.full_name);
    }
    if (!entry.teamName && teamDisplayName) entry.teamName = teamDisplayName;
    if (!entry.className && resultClass) entry.className = resultClass;
  }

  // 5. Filter by class if specified
  let rows = [...carMap.values()];
  if (className) {
    rows = rows.filter((r) => r.className === className);
  }
  rows = rows.filter((r) => r.totalPoints > 0);
  rows.sort((a, b) => b.totalPoints - a.totalPoints);

  if (rows.length === 0) {
    alert("No standings data to export.");
    return;
  }

  const anyMultiDriver = rows.some((r) => r.driverNames.length > 1);

  onProgress?.(60);

  // 6. Filter out session columns with zero points across all rows
  const activeSessionIds = new Set<string>();
  for (const row of rows) {
    for (const sid of Object.keys(row.pointsBySession)) {
      if (row.pointsBySession[sid] > 0) activeSessionIds.add(sid);
    }
  }

  const filteredGroups = eventSessionGroups
    .map((g) => ({
      ...g,
      sessions: g.sessions.filter((s) => activeSessionIds.has(s.sessionId)),
    }))
    .filter((g) => g.sessions.length > 0);

  // 7. Build PDF
  let logoData: string | null = null;
  try {
    logoData = (await Promise.race([
      loadImageAsBase64(trackRecordsLogo),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      ),
    ])) as string;
  } catch {
    console.warn("Logo load skipped");
  }

  onProgress?.(70);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // --- Header ---
  const topY = 10;
  const titleLine1 = seriesName;
  const titleLine2 = `${year} Championship Standings${className ? ` — ${className}` : ""}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.text(titleLine1, margin, topY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(titleLine2, margin, topY + 10);

  // Logo right-aligned, vertically centered with header
  if (logoData) {
    const imgProps = doc.getImageProperties(logoData);
    const logoHeight = 12;
    const logoWidth = (imgProps.width / imgProps.height) * logoHeight;
    const logoY = topY + (10 - logoHeight) / 2 + 1; // vertically center with the two-line header
    doc.addImage(logoData, "PNG", pageWidth - margin - logoWidth, logoY, logoWidth, logoHeight);
  }

  // --- Table ---
  // Build header: two rows
  // Row 1: "", "Driver/Car", then event name spanning its session columns, then "Total"
  // Row 2: "Pos", "", then session short names, then ""

  const flatSessions = filteredGroups.flatMap((g) => g.sessions);

  // Format session type for short column headers
  const shortType = (name: string, type: string): string => {
    const n = name.toLowerCase();
    if (n.includes("qualifying") || n.includes("qual")) return "Qual";
    if (n.includes("sprint") && n.includes("race")) return "Sprint";
    if (n.includes("race")) return "Race";
    if (n.includes("practice") || n.includes("fp")) return "Prac";
    // Fallback to first word
    return name.length > 8 ? name.slice(0, 7) + "." : name;
  };

  // We need to use autoTable's didDrawPage for grouped headers
  // Build body data
  const bodyData = rows.map((row, i) => {
    const pos = String(i + 1);
    const identifier = anyMultiDriver
      ? `#${row.carNumber} – ${row.teamName || "Unknown"}`
      : row.driverNames[0] || "Unknown";

    const sessionPts = flatSessions.map((s) => {
      const pts = row.pointsBySession[s.sessionId];
      return pts ? String(pts) : "";
    });

    return [pos, identifier, ...sessionPts, String(row.totalPoints)];
  });

  // Simple header row: Pos, Driver/Car, ...session short names, Total
  const headRow = [
    "Pos",
    anyMultiDriver ? "Car / Team" : "Driver",
    ...flatSessions.map((s) => shortType(s.sessionName, s.sessionType)),
    "Total",
  ];

  const tableStartY = topY + 16;

  // Draw event group brackets above the table after initial draw
  autoTable(doc, {
    startY: tableStartY + 6, // leave room for event name brackets
    head: [headRow],
    body: bodyData,
    styles: { fontSize: 6, cellPadding: 1.2, font: "courier" },
    headStyles: {
      fillColor: [30, 30, 35],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      font: "helvetica",
      fontSize: 5.5,
    },
    alternateRowStyles: { fillColor: [245, 245, 248] },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: anyMultiDriver ? 52 : 40 },
      [headRow.length - 1]: { halign: "right", fontStyle: "bold", cellWidth: 12 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Draw event name brackets on the first page above the head row
      if (data.pageNumber === 1 && data.settings.startY != null) {
        const bracketY = data.settings.startY - 3;
        doc.setFontSize(5);
        doc.setTextColor(100);
        doc.setFont("helvetica", "bold");

        // Calculate x positions for each session column
        // Columns: 0=Pos, 1=Driver, 2..n-1=sessions, n=Total
        const colCount = headRow.length;
        const table = (data as any).table;
        if (table && table.columns) {
          let sessionIdx = 0;
          for (const group of filteredGroups) {
            const startCol = 2 + sessionIdx;
            const endCol = startCol + group.sessions.length - 1;

            const startColObj = table.columns[startCol];
            const endColObj = table.columns[endCol];
            if (startColObj && endColObj) {
              const x1 = startColObj.x;
              const x2 = endColObj.x + endColObj.width;
              const centerX = (x1 + x2) / 2;

              // Draw bracket line
              doc.setDrawColor(150);
              doc.setLineWidth(0.2);
              doc.line(x1 + 1, bracketY + 1.5, x2 - 1, bracketY + 1.5);

              // Draw circuit/event name
              const label =
                group.circuitName.length > 18
                  ? group.circuitName.slice(0, 17) + "…"
                  : group.circuitName;
              doc.text(label, centerX, bracketY, { align: "center" });
            }
            sessionIdx += group.sessions.length;
          }
        }
      }
    },
  });

  // Footer
  doc.setFontSize(6);
  doc.setTextColor(180);
  doc.text(new Date().toLocaleDateString(), margin, pageHeight - 6);
  doc.text("track-records.lovable.app", pageWidth - margin, pageHeight - 6, {
    align: "right",
  });

  onProgress?.(90);

  // Save
  const fileName = `${seriesName.replace(/\s+/g, "-").toLowerCase()}-${year}-standings${className ? `-${className.replace(/\s+/g, "-").toLowerCase()}` : ""}.pdf`;

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  try {
    const newWin = window.open(blobUrl, "_blank");
    if (!newWin) {
      console.info("PDF generated. If download didn't start, try opening the preview in a new tab.");
    }
  } catch {
    // ignore
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  onProgress?.(100);
}
