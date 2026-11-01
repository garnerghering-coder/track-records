import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { EmptyState, PageHeader, SectionHeader } from "@/components/tr/primitives";
import { cn } from "@/lib/utils";

const INPUT = "h-10 rounded bg-background focus-visible:ring-1 focus-visible:ring-offset-0";
const PRIMARY_BTN =
  "h-10 rounded bg-signal px-5 font-display text-sm font-bold uppercase tracking-[0.14em] text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100";

const RACING_CATEGORIES = [
  "karting", "single_seater", "gt", "touring_car", "sports_car",
  "rally", "endurance", "formula", "stock_car", "other",
] as const;

const Submit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [seriesName, setSeriesName] = useState("");
  const [eventName, setEventName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear().toString());
  const [eventDate, setEventDate] = useState("");
  const [category, setCategory] = useState("other");
  const [location, setLocation] = useState("");
  const [rawData, setRawData] = useState("");

  // User's past submissions
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    setLoading(false);
    fetchSubmissions(session.user.id);
  };

  const fetchSubmissions = async (userId: string) => {
    const { data } = await supabase
      .from("community_submissions" as any)
      .select("*")
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false });
    if (data) setSubmissions(data as any[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawData.trim() || rawData.trim().length < 10) {
      toast({ title: "Please paste race results (at least 10 characters)", variant: "destructive" });
      return;
    }
    if (!seriesName.trim()) {
      toast({ title: "Series name is required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-submission`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            eventName: eventName || undefined,
            seriesName,
            seasonYear: parseInt(seasonYear) || new Date().getFullYear(),
            eventDate: eventDate || undefined,
            category,
            location: location || undefined,
            rawData,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Submission failed", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Results submitted!", description: `${result.entriesCount} entries parsed. Awaiting admin review.` });
        setSeriesName("");
        setEventName("");
        setSeasonYear(new Date().getFullYear().toString());
        setEventDate("");
        setCategory("other");
        setLocation("");
        setRawData("");
        if (user) fetchSubmissions(user.id);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SEOHead title="Submit Race Results" description="Submit race results to the Track Records database." canonical="/submit" noIndex />
      <Header />

      <PageHeader
        kicker={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Community
          </>
        }
        title="Submit race results"
        meta={<span>Paste results from any timing sheet. We parse them automatically and an admin reviews them before they go live.</span>}
      />

      <main className="container flex-1 py-8 md:py-10">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
          {/* ── Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="rounded border bg-card">
            <FormSection n="01" title="Event">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="seriesName" label="Series name" required>
                  <Input
                    id="seriesName"
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    placeholder="e.g. IMSA SportsCar Championship"
                    required
                    className={INPUT}
                  />
                </Field>
                <Field id="eventName" label="Event name">
                  <Input
                    id="eventName"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g. Rolex 24 at Daytona"
                    className={INPUT}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field id="seasonYear" label="Season year" required>
                  <Input
                    id="seasonYear"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    type="number"
                    required
                    className={cn(INPUT, "num")}
                  />
                </Field>
                <Field id="eventDate" label="Event date">
                  <Input id="eventDate" value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" className={cn(INPUT, "num")} />
                </Field>
                <Field id="category" label="Category" className="col-span-2 sm:col-span-1">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RACING_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field id="location" label="Location">
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Daytona International Speedway"
                  className={INPUT}
                />
              </Field>
            </FormSection>

            <FormSection n="02" title="Results">
              <Field
                id="rawData"
                label="Race results"
                required
                hint="Paste from timing sheets, websites or any format. Our AI parses it automatically."
              >
                <Textarea
                  id="rawData"
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder={"Paste race results here…\n\nExample:\n1. Max Verstappen - Red Bull Racing - 58 laps\n2. Lewis Hamilton - Mercedes - +5.023s\n..."}
                  className="min-h-[240px] rounded bg-background font-mono text-xs leading-relaxed focus-visible:ring-1 focus-visible:ring-offset-0"
                  required
                />
              </Field>
            </FormSection>

            {/* Action bar */}
            <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b border-t bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-muted-foreground">
                <span className="text-dnf">*</span> Required. Submissions are reviewed by an admin.
              </p>
              <Button type="submit" disabled={submitting} className={PRIMARY_BTN}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <Send /> Submit for review
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* ── Past submissions ─────────────────────────────── */}
          <aside className="lg:sticky lg:top-20">
            <SectionHeader
              kicker="History"
              title="Your submissions"
              right={submissions.length > 0 ? <span className="label-caps num">{submissions.length}</span> : undefined}
            />
            {submissions.length === 0 ? (
              <EmptyState title="No submissions yet" icon={<Clock className="h-5 w-5" />}>
                Submit your first race results and track their review status here.
              </EmptyState>
            ) : (
              <div className="divide-y overflow-hidden rounded border bg-card">
                {submissions.map((s: any) => (
                  <div key={s.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-base font-bold uppercase leading-tight tracking-wide text-foreground">
                          {s.event_name || "Untitled event"}
                        </h3>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {s.series_name} <span aria-hidden>·</span> <span className="num">{s.season_year}</span>
                        </p>
                      </div>
                      <StatusChip status={s.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Submitted <span className="num">{new Date(s.created_at).toLocaleDateString()}</span>
                      {s.parsed_entries?.entries && (
                        <>
                          {" "}
                          · <span className="num">{s.parsed_entries.entries.length}</span> entries parsed
                        </>
                      )}
                    </p>
                    {s.admin_notes && (
                      <p className="mt-2 border-l-2 pl-2.5 text-xs text-muted-foreground">
                        <span className="label-caps mr-1">Admin</span>
                        {s.admin_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

/* ── Form helpers ─────────────────────────────────────────────── */
function FormSection({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-b px-4 py-5 last-of-type:border-b-0 sm:px-6 sm:py-6">
      <legend className="float-left mb-1 flex w-full items-baseline gap-2.5">
        <span className="num text-xs text-primary">{n}</span>
        <span className="font-display text-lg font-bold uppercase tracking-wide text-foreground">{title}</span>
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="label-caps block text-[11px] font-semibold leading-none">
        {label}
        {required && <span className="ml-0.5 text-dnf">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: ReactNode }> = {
    approved: { cls: "border-pb/40 text-pb", icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected: { cls: "border-dnf/40 text-dnf", icon: <XCircle className="h-3 w-3" /> },
    pending: { cls: "border-border text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  };
  const m = map[status] || map.pending;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 font-display text-[11px] font-bold uppercase tracking-wider",
        m.cls,
      )}
    >
      {m.icon}
      {status}
    </span>
  );
}

export default Submit;
