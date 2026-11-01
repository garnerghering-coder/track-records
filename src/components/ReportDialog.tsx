import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportDialogProps {
  reportType: string;
  targetId: string;
  targetName: string;
}

/** Compact uppercase action button used in page-header action rows. */
export const actionBtn =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded border bg-card px-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0";

const ReportDialog = ({ reportType, targetId, targetName }: ReportDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("reports" as any).insert({
      report_type: reportType,
      target_id: targetId,
      reporter_id: session?.user?.id || null,
      message: message.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    setSubmitting(false);
    if (error) {
      toast({ title: "Error submitting report", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Report submitted", description: "Thank you. An admin will review your report." });
      setMessage("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={actionBtn}>
          <Flag /> Report
        </button>
      </DialogTrigger>
      <DialogContent className="rounded sm:rounded">
        <DialogHeader>
          <div className="label-caps">Report an issue · {reportType}</div>
          <DialogTitle className="font-display text-xl font-bold uppercase tracking-wide">{targetName}</DialogTitle>
          <DialogDescription>
            Spotted incorrect or missing information? Describe it below and an admin will review your report.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Wrong finishing position at Sebring 2025 — should be P2 in GTD."
            rows={4}
            className="rounded"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            className="h-10 w-full rounded bg-signal font-display text-sm font-bold uppercase tracking-[0.12em] text-signal-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
