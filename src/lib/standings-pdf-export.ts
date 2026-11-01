import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import trackRecordsLogo from "@/assets/track-records-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { computeTeamStandings } from "@/lib/standings";
import { fetchSeasonStandingsInput } from "@/lib/standings-data";

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
  /** Single class, multiple classes, or null/undefined for all */
  classNames?: string[] | null;
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
  position?: number;
}

export async function exportStandingsPdf(params: StandingsPdfParams) {
  const { seriesName, year, seasonId, classNames, onProgress } = params;

  onProgress?.(5);

  // 1. Fetch events for this season, sorted chronologically
  const { data: eventsData } = await supabase
    .from("v2_events")
    .select("id, name, short_name, start_date, v2_circuits(name)")
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
  interface EventSessionGroupFull extends EventSessionGroup { shortName: string | null; }
  const eventSessionGroups: EventSessionGroupFull[] = [];
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
        shortName: ev.short_name || null,
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

  // 3. Points-bearing results and team (car) standings: shared rules in
  //    src/lib/standings.ts (parent sessions only, paginated fetch, one score
  //    per car per session, countback tie-breaks).
  const input = await fetchSeasonStandingsInput(seasonId);

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

  // 4. One row per car (car number + class)
  const carRows: CarRow[] = computeTeamStandings(input.sessions, input.rows, input.rules).map((t) => ({
    carNumber: t.carNumber,
    driverNames: t.driverIds.map((d) => input.drivers.get(d)?.name).filter((n): n is string => !!n),
    teamName: (t.teamId ? teamAliasMap.get(t.teamId) || input.teams.get(t.teamId) : null) || null,
    className: t.className || null,
    pointsBySession: Object.fromEntries(t.results.filter((r) => r.points > 0).map((r) => [r.sessionId, r.points])),
    totalPoints: t.totalPoints,
    position: t.position,
  }));

  // 5. Determine which classes to render (each gets its own page)
  const allRows = carRows.filter((r) => r.totalPoints > 0);

  if (allRows.length === 0) {
    alert("No standings data to export.");
    return;
  }

  // Build class groups: if classNames specified, one group per class; otherwise one group with all
  const classGroups: { className: string | null; rows: CarRow[] }[] = [];
  if (classNames && classNames.length > 0) {
    for (const cn of classNames) {
      const filtered = allRows.filter((r) => r.className === cn);
      if (filtered.length > 0) {
        // already ranked within the class (ties share a position)
        classGroups.push({ className: cn, rows: filtered });
      }
    }
  } else {
    // All classes on one page: order by points, positions renumbered overall
    const overall = [...allRows].sort((a, b) => b.totalPoints - a.totalPoints).map((r, i) => ({ ...r, position: i + 1 }));
    classGroups.push({ className: null, rows: overall });
  }

  if (classGroups.length === 0) {
    alert("No standings data to export.");
    return;
  }

  onProgress?.(60);

  // 6. Build PDF
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

  for (let gi = 0; gi < classGroups.length; gi++) {
    if (gi > 0) doc.addPage();

    const group = classGroups[gi];
    const rows = group.rows;
    const anyMultiDriver = rows.some((r) => r.driverNames.length > 1);

    // Filter session columns to only those with points in this class group
    const activeSessionIds = new Set<string>();
    for (const row of rows) {
      for (const sid of Object.keys(row.pointsBySession)) {
        if (row.pointsBySession[sid] > 0) activeSessionIds.add(sid);
      }
    }

    const classFilteredGroups = eventSessionGroups
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter((s) => activeSessionIds.has(s.sessionId)),
      }))
      .filter((g) => g.sessions.length > 0);

    const flatSessions = classFilteredGroups.flatMap((g) => g.sessions);

    // --- Header ---
    const topY = 10;
    const classLabel = group.className;
    const titleLine2 = `${year} Championship Standings${classLabel ? ` — ${classLabel}` : ""}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(seriesName, margin, topY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(titleLine2, margin, topY + 10);

    if (logoData) {
      const imgProps = doc.getImageProperties(logoData);
      const logoHeight = 12;
      const logoWidth = (imgProps.width / imgProps.height) * logoHeight;
      const logoY = topY + (10 - logoHeight) / 2 + 1;
      doc.addImage(logoData, "PNG", pageWidth - margin - logoWidth, logoY, logoWidth, logoHeight);
    }

    // --- Table ---
    const shortType = (name: string): string => {
      const n = name.toLowerCase();
      if (n.includes("qualifying") || n.includes("qual")) return "Qual";
      if (n.includes("sprint") && n.includes("race")) return "Sprint";
      if (n.includes("race")) return "Race";
      if (n.includes("practice") || n.includes("fp")) return "Prac";
      return name.length > 8 ? name.slice(0, 7) + "." : name;
    };

    const bodyData = rows.map((row, i) => {
      const pos = String(row.position ?? i + 1);
      const identifier = anyMultiDriver
        ? `#${row.carNumber} – ${row.teamName || "Unknown"}`
        : row.driverNames[0] || "Unknown";
      const sessionPts = flatSessions.map((s) => {
        const pts = row.pointsBySession[s.sessionId];
        return pts ? String(pts) : "";
      });
      return [pos, identifier, ...sessionPts, String(row.totalPoints)];
    });

    const headRow = [
      "Pos",
      anyMultiDriver ? "Car / Team" : "Driver",
      ...flatSessions.map((s) => shortType(s.sessionName)),
      "Total",
    ];

    const tableStartY = topY + 16;
    const groupsRef = classFilteredGroups; // capture for closure

    autoTable(doc, {
      startY: tableStartY + 6,
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
        // Draw event name brackets above the head row on the current page
        if (data.settings.startY != null) {
          const bracketY = data.settings.startY - 3;
          doc.setFontSize(5);
          doc.setTextColor(100);
          doc.setFont("helvetica", "bold");

          const table = data.table;
          if (table && table.columns) {
            // Calculate x positions from margin + cumulative column widths
            const cols = table.columns;
            const colXPositions: number[] = [];
            let cx = margin;
            for (const col of cols) {
              colXPositions.push(cx);
              cx += col.width;
            }

            let sessionIdx = 0;
            for (const evGroup of groupsRef) {
              const startCol = 2 + sessionIdx;
              const endCol = startCol + evGroup.sessions.length - 1;
              if (startCol < cols.length && endCol < cols.length) {
                const x1 = colXPositions[startCol];
                const x2 = colXPositions[endCol] + cols[endCol].width;
                if (x2 > x1) {
                  const centerX = (x1 + x2) / 2;
                  doc.setDrawColor(150);
                  doc.setLineWidth(0.2);
                  doc.line(x1 + 1, bracketY + 1.5, x2 - 1, bracketY + 1.5);
                  const rawLabel = evGroup.shortName || evGroup.circuitName;
                  const label = rawLabel.length > 18
                    ? rawLabel.slice(0, 17) + "…"
                    : rawLabel;
                  doc.text(label, centerX, bracketY, { align: "center" });
                }
              }
              sessionIdx += evGroup.sessions.length;
            }
          }
        }
      },
    });

    // Footer per page
    doc.setFontSize(6);
    doc.setTextColor(180);
    doc.text(new Date().toLocaleDateString(), margin, pageHeight - 6);
    doc.text("track-records.com", pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  onProgress?.(90);

  // Save
  const allClassLabel = classNames && classNames.length > 0 ? classNames.join("-") : null;
  const fileName = `${seriesName.replace(/\s+/g, "-").toLowerCase()}-${year}-standings${allClassLabel ? `-${allClassLabel.replace(/[\s,]+/g, "-").toLowerCase()}` : ""}.pdf`;

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
