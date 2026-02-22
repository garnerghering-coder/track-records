import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileDown } from "lucide-react";

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
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setProgress(100);
      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        onOpenChange(false);
      }, 600);
    }
  };

  return (
    <Dialog open={open} onOpenChange={exporting ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            Export PDF
          </DialogTitle>
          <DialogDescription>
            Choose what to include in your PDF export.
          </DialogDescription>
        </DialogHeader>

        {exporting ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Generating PDF…</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{Math.round(progress)}%</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <Button variant="outline" className="justify-start h-auto py-3 px-4" onClick={() => handleExport("single")}>
              <div className="text-left">
                <p className="font-medium text-sm">This session only</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sessionName}</p>
              </div>
            </Button>
            {hasMultipleSessions && (
              <Button variant="outline" className="justify-start h-auto py-3 px-4" onClick={() => handleExport("all")}>
                <div className="text-left">
                  <p className="font-medium text-sm">All sessions from this event</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Each session on a new page</p>
                </div>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
