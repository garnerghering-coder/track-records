import { useState, useMemo, useCallback } from "react";
import { ClassBadge, Pos } from "@/components/tr/primitives";
import { getClassColor, sortClasses } from "@/lib/classes";
import { chip, toolButton } from "@/components/event-ui";
import { FileDown } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import WeatherBubble from "@/components/WeatherBubble";
import { Link } from "react-router-dom";
import { formatElapsedLabel } from "@/lib/lap-position-calc";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import trackRecordsLogo from "@/assets/track-records-logo.png";

interface StandingRow {
  carNumber: string;
  position: number;
  lapsCompleted: number;
  elapsed: number;
  className: string;
  classPosition: number;
  teamName: string;
  teamId: string | null;
  drivers: { id: string | null; name: string; nationality: string | null }[];
  currentDriver?: { id: string | null; name: string; nationality: string | null } | null;
  car: { model_name: string; manufacturer: string | null } | null;
  carLabel: string;
  interval: string;
}

interface ComputedStandingsTableProps {
  standings: StandingRow[];
  timeLabel: string;
  isMulticlass?: boolean;
  weather?: any;
  event?: any;
  parentSession?: any;
  teamNameMap?: Record<string, string>;
  /** Optional season class colors (class name → hex) */
  classColors?: Record<string, string>;
}

export default function ComputedStandingsTable({
  standings,
  timeLabel,
  isMulticlass,
  weather,
  event,
  parentSession,
  classColors,
}: ComputedStandingsTableProps) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  // Get unique classes
  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of standings) {
      if (s.className) set.add(s.className);
    }
    return Array.from(set).sort(sortClasses);
  }, [standings]);

  // Filter standings by class and recompute class positions + intervals
  const filteredStandings = useMemo(() => {
    if (classFilter === "all") return standings;
    const filtered = standings.filter(s => s.className === classFilter);
    // Recompute class positions and intervals for the filtered view
    let prevCar: { lapsCompleted: number; elapsed: number } | null = null;
    return filtered.map((s, i) => {
      let interval = "";
      if (i > 0 && prevCar) {
        const lapDiff = prevCar.lapsCompleted - s.lapsCompleted;
        if (lapDiff > 0) {
          interval = `+${lapDiff} ${lapDiff === 1 ? "Lap" : "Laps"}`;
        } else {
          const timeDiff = s.elapsed - prevCar.elapsed;
          interval = `+${timeDiff.toFixed(3)}`;
        }
      }
      prevCar = { lapsCompleted: s.lapsCompleted, elapsed: s.elapsed };
      return { ...s, classPosition: i + 1, interval };
    });
  }, [standings, classFilter]);

  // Gap to leader computation
  const computeGap = useCallback((s: StandingRow, i: number) => {
    const leader = filteredStandings[0];
    if (!leader || i === 0) return "Leader";
    const lapDiff = leader.lapsCompleted - s.lapsCompleted;
    if (lapDiff > 0) return `+${lapDiff} ${lapDiff === 1 ? "Lap" : "Laps"}`;
    const timeDiff = s.elapsed - leader.elapsed;
    return `+${timeDiff.toFixed(3)}`;
  }, [filteredStandings]);

  // PDF export
  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      let logoData: string | null = null;
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        logoData = await new Promise<string>((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = () => reject();
          img.src = trackRecordsLogo;
        });
      } catch { /* ignore */ }

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const topY = 10;
      const centerX = pageWidth / 2;

      // Header left: event info
      const eventName = event?.name || "Race";
      const seriesName = (event as any)?.v2_seasons?.v2_series?.name || "";
      const circuitName = (event as any)?.v2_circuits?.name || "";
      const circuitCountry = (event as any)?.v2_circuits?.country || "";

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

      // Center: logo
      if (logoData) {
        const imgProps = doc.getImageProperties(logoData);
        const logoHeight = 12;
        const logoWidth = (imgProps.width / imgProps.height) * logoHeight;
        doc.addImage(logoData, "PNG", centerX - logoWidth / 2, topY, logoWidth, logoHeight);
      }

      // Right: session info
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(50);
      const sessionLabel = `Standings at ${timeLabel}${classFilter !== "all" ? ` — ${classFilter}` : ""}`;
      doc.text(sessionLabel, pageWidth - margin, topY + 4, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text("Computed from lap data", pageWidth - margin, topY + 9, { align: "right" });

      // Weather
      let rightLineY = topY + 13;
      if (weather) {
        const cleanSummary = (weather.condition_summary || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
        if (cleanSummary) {
          doc.text(cleanSummary, pageWidth - margin, rightLineY, { align: "right" });
          rightLineY += 3.5;
        }
      }

      const tableStartY = Math.max(topY + 13, rightLineY) + 4;

      // Build table
      const head: string[] = ["Pos"];
      if (isMulticlass) { head.push("PIC", "Class"); }
      head.push("No.", "Driver(s)", "Team", "Car", "Laps", "Gap", "Int");

      const body = filteredStandings.map((s, i) => {
        const row: string[] = [String(s.position)];
        if (isMulticlass) { row.push(String(s.classPosition), s.className || "—"); }
        row.push(s.carNumber);
        row.push(s.drivers.map(d => d.name).join(", ") || "—");
        row.push(s.teamName || "—");
        row.push(s.carLabel || "—");
        row.push(String(s.lapsCompleted));
        row.push(computeGap(s, i));
        row.push(i === 0 ? "" : s.interval);
        return row;
      });

      autoTable(doc, {
        startY: tableStartY,
        head: [head],
        body,
        styles: { fontSize: 7, cellPadding: 1.5, font: "courier" },
        headStyles: { fillColor: [30, 30, 35], textColor: [255, 255, 255], fontStyle: "bold", font: "helvetica" },
        alternateRowStyles: { fillColor: [245, 245, 248] },
        columnStyles: { 0: { halign: "center", cellWidth: 10 } },
      });

      // Footer
      doc.setFontSize(6);
      doc.setTextColor(180);
      doc.text(new Date().toLocaleDateString(), margin, pageHeight - 6);
      doc.text("Page 1 of 1", pageWidth - margin, pageHeight - 6, { align: "right" });

      const fileName = `${eventName.replace(/\s+/g, "-").toLowerCase()}-standings-${timeLabel.replace(/:/g, "")}.pdf`;
      const blob = doc.output("blob");
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      try { window.open(blobUrl, "_blank"); } catch { /* ignored */ }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } finally {
      setExporting(false);
    }
  }, [filteredStandings, timeLabel, isMulticlass, weather, event, classFilter, computeGap]);

  const classCounts: Record<string, number> = {};
  for (const s of standings) if (s.className) classCounts[s.className] = (classCounts[s.className] || 0) + 1;

  return (
    <div className="overflow-hidden rounded border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-bold uppercase leading-none tracking-wide text-foreground">
            Standings at <span className="text-primary">{timeLabel}</span>
          </h3>
          {weather && <WeatherBubble weather={weather} />}
          <span className="label-caps">Computed from lap data</span>
        </div>
        <button type="button" className={toolButton} onClick={handleExportPdf} disabled={exporting}>
          <FileDown />
          PDF
        </button>
      </div>
      {isMulticlass && classes.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b bg-background/40 px-4 py-2" role="group" aria-label="Filter by class">
          <button type="button" className={chip(classFilter === "all")} onClick={() => setClassFilter("all")}>
            All <span className="num font-normal opacity-70">{standings.length}</span>
          </button>
          {classes.map((cls) => {
            const c = getClassColor(cls, classColors);
            const active = classFilter === cls;
            return (
              <button
                key={cls}
                type="button"
                className={chip(active)}
                onClick={() => setClassFilter(active ? "all" : cls)}
                style={active ? { backgroundColor: c, borderColor: c, color: "#fff" } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? "#fff" : c }} />
                {cls}
                <span className="num font-normal opacity-70">{classCounts[cls] || 0}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-table [&_tbody_td]:px-2 [&_thead_th]:px-2 sm:[&_tbody_td]:px-3 sm:[&_thead_th]:px-3 [&_thead_th.text-center]:text-center [&_thead_th.text-right]:text-right">
          <thead>
            <tr>
              <th className="w-12 text-center">Pos</th>
              {isMulticlass && <th className="w-12 text-center">PIC</th>}
              {isMulticlass && <th className="hidden w-20 md:table-cell">Class</th>}
              <th className="w-14 text-right">No.</th>
              <th>Driver(s)</th>
              <th className="hidden md:table-cell">Team</th>
              <th className="hidden lg:table-cell">Car</th>
              <th className="text-right">Laps</th>
              <th className="text-right">Gap</th>
              <th className="hidden text-right sm:table-cell">Int</th>
            </tr>
          </thead>
          <tbody>
            {filteredStandings.map((s, i) => (
              <tr key={s.carNumber}>
                <td className="text-center" style={isMulticlass && s.className ? { boxShadow: `inset 3px 0 0 ${getClassColor(s.className, classColors)}` } : undefined}>
                  <Pos value={classFilter !== "all" ? s.classPosition : s.position} />
                </td>
                {isMulticlass && <td className="num text-center text-[13px] text-muted-foreground">{s.classPosition}</td>}
                {isMulticlass && (
                  <td className="hidden md:table-cell">{s.className ? <ClassBadge name={s.className} color={getClassColor(s.className, classColors)} /> : <span className="text-muted-foreground">—</span>}</td>
                )}
                <td className="num text-right font-semibold">#{s.carNumber}</td>
                <td className="py-2">
                  {(() => {
                    // Show current driver if available (time-specific), otherwise all
                    if (s.currentDriver) {
                      return (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium leading-5">
                          <FlagImage nationality={s.currentDriver.nationality} size={14} />
                          {s.currentDriver.id ? (
                            <Link to={`/driver/${s.currentDriver.id}`} className="transition-colors hover:text-primary">
                              {s.currentDriver.name}
                            </Link>
                          ) : (
                            s.currentDriver.name
                          )}
                        </span>
                      );
                    }
                    if (s.drivers.length === 0) return "—";
                    return (
                      <div className="flex flex-col gap-0.5">
                        {s.drivers.map((d, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium leading-5">
                            <FlagImage nationality={d.nationality} size={14} />
                            {d.id ? (
                              <Link to={`/driver/${d.id}`} className="transition-colors hover:text-primary">
                                {d.name}
                              </Link>
                            ) : (
                              d.name
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {s.teamName && <div className="max-w-[10rem] truncate text-xs text-muted-foreground sm:max-w-[16rem] md:hidden">{s.teamName}</div>}
                </td>
                <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  {s.teamId ? (
                    <Link to={`/team/${s.teamId}`} className="transition-colors hover:text-foreground">
                      {s.teamName}
                    </Link>
                  ) : (
                    s.teamName || "—"
                  )}
                </td>
                <td className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">{s.carLabel || "—"}</td>
                <td className="num text-right text-[13px]">{s.lapsCompleted}</td>
                <td className="num whitespace-nowrap text-right text-[13px] text-muted-foreground">
                  {i === 0 && classFilter === "all" ? <span className="label-caps text-foreground">Leader</span> : computeGap(s, i)}
                </td>
                <td className="num hidden whitespace-nowrap text-right text-[13px] text-muted-foreground sm:table-cell">{i === 0 ? "" : s.interval}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
