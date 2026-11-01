import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, FileDown } from "lucide-react";

interface PdfExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string;
  hasMultipleSessions: boolean;
  onExport: (mode: "single" | "all", onProgress: (pct: number) => void) => Promise<void>;
}

export default function PdfExportDialog({
  open,
  onOpenChange,
  sessionName,
  hasMultipleSessions,
  onExport,
}: PdfExportDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExport = async (mode: "single" | "all") => {
    setExporting(true);
    setProgress(5);
    try {
      await onExport(mode, setProgress);
      setProgress(100);
      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        onOpenChange(false);
      }, 800);
    } catch (e: any) {
      console.error("PDF export failed:", e);
      setExporting(false);
      setProgress(0);
      // Show the error to the user via an alert so it's not silent
      alert("PDF export failed: " + (e?.message || "Unknown error. Check console for details."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={exporting ? undefined : onOpenChange}>
      <DialogContent
        className="min-h-0 resize-none rounded border bg-card shadow-none sm:rounded"
        style={{ maxWidth: "min(28rem, calc(100vw - 2rem))", maxHeight: "90vh" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            <FileDown className="h-4 w-4 text-primary" />
            Export PDF
          </DialogTitle>
          <DialogDescription>
            Choose what to include in your PDF export.
          </DialogDescription>
        </DialogHeader>

        {exporting ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <p className="label-caps">Generating PDF…</p>
              <p className="num text-xs text-foreground">{Math.round(progress)}%</p>
            </div>
            <Progress value={progress} className="h-1 rounded-none" />
          </div>
        ) : (
          <div className="grid gap-px overflow-hidden rounded-sm border bg-border">
            {[
              { mode: "single" as const, title: "This session only", sub: sessionName, show: true },
              { mode: "all" as const, title: "All sessions from this event", sub: "Each session on a new page", show: hasMultipleSessions },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  onClick={() => handleExport(o.mode)}
                  className="group flex items-center justify-between gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{o.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.sub}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
