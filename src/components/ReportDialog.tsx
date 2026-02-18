import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportDialogProps {
  reportType: "driver" | "event";
  targetId: string;
  targetName: string;
}

const ReportDialog = ({ reportType, targetId, targetName }: ReportDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from("reports" as any).insert({
      report_type: reportType,
      target_id: targetId,
      reporter_id: session?.user?.id || null,
      message: message.trim(),
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
        <Button variant="outline" size="sm" className="gap-1.5">
          <Flag className="h-3.5 w-3.5" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report: {targetName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            If you notice incorrect information, please describe the issue below. An admin will review your report.
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what's incorrect…"
            rows={4}
          />
          <Button onClick={handleSubmit} disabled={submitting || !message.trim()} className="w-full">
            {submitting ? "Submitting…" : "Submit Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
