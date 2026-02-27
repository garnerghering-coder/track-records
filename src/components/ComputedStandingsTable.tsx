import { useState, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
}

export default function ComputedStandingsTable({
  standings,
  timeLabel,
  isMulticlass,
  weather,
  event,
  parentSession,
}: ComputedStandingsTableProps) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  // Get unique classes
  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of standings) {
      if (s.className) set.add(s.className);
    }
    return Array.from(set).sort();
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

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-card-foreground uppercase tracking-wide">
            Standings at {timeLabel}
          </h4>
          {weather && <WeatherBubble weather={weather} />}
        </div>
        <div className="flex items-center gap-2">
          {isMulticlass && classes.length > 1 && (
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-7 w-[130px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[11px]">All Classes</SelectItem>
                {classes.map(cls => (
                  <SelectItem key={cls} value={cls} className="text-[11px]">{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="text-[10px]">Computed from lap data</Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={handleExportPdf}
            disabled={exporting}
          >
            <FileDown className="h-3 w-3" />
            PDF
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12">Pos</TableHead>
            {isMulticlass && <TableHead className="w-12">PIC</TableHead>}
            {isMulticlass && <TableHead>Class</TableHead>}
            <TableHead className="w-14">No.</TableHead>
            <TableHead>Driver(s)</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Car</TableHead>
            <TableHead className="text-center">Laps</TableHead>
            <TableHead>Gap</TableHead>
            <TableHead>Int</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredStandings.map((s, i) => (
            <TableRow key={s.carNumber} className={i % 2 === 0 ? "" : "bg-muted/20"}>
              <TableCell className="font-bold text-center">{classFilter !== "all" ? s.classPosition : s.position}</TableCell>
              {isMulticlass && <TableCell className="text-xs">{s.classPosition}</TableCell>}
              {isMulticlass && <TableCell className="text-xs">{s.className || "—"}</TableCell>}
              <TableCell className="text-center font-mono text-xs">{s.carNumber}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">
                {s.drivers.length === 0 ? "—" : (
                  <div className="flex flex-col">
                    {s.drivers.map((d, idx) => (
                      <span key={idx} className="leading-[22px] whitespace-nowrap">
                        {d.id ? (
                          <Link to={`/driver/${d.id}`} className="hover:text-primary transition-colors inline-flex items-center gap-1">
                            <FlagImage nationality={d.nationality} size={14} />
                            {d.name}
                          </Link>
                        ) : d.name}
                      </span>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {s.teamId ? (
                  <Link to={`/team/${s.teamId}`} className="hover:text-primary transition-colors">{s.teamName}</Link>
                ) : s.teamName || "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.carLabel || "—"}</TableCell>
              <TableCell className="text-center text-xs">{s.lapsCompleted}</TableCell>
              <TableCell className="font-mono text-xs">{i === 0 && classFilter === "all" ? "Leader" : computeGap(s, i)}</TableCell>
              <TableCell className="font-mono text-xs">{i === 0 ? "" : s.interval}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
