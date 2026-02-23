import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

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
        <div className="flex min-h-screen items-center justify-center pt-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Submit Race Results" description="Submit race results to the Track Records database." canonical="/submit" noIndex />
      <Header />
      <main className="flex-1 container pt-24 pb-16">
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Submit Race Results</h1>
        <p className="text-muted-foreground mb-8">Help us build the most complete racing database. Submit results and an admin will review them.</p>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-bold text-card-foreground mb-4">New Submission</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-card-foreground">Series Name *</Label>
                  <Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. IMSA SportsCar Championship" required />
                </div>
                <div>
                  <Label className="text-card-foreground">Event Name</Label>
                  <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Rolex 24 at Daytona" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-card-foreground">Season Year *</Label>
                  <Input value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} type="number" required />
                </div>
                <div>
                  <Label className="text-card-foreground">Event Date</Label>
                  <Input value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" />
                </div>
                <div>
                  <Label className="text-card-foreground">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RACING_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-card-foreground">Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Daytona International Speedway" />
              </div>

              <div>
                <Label className="text-card-foreground">Race Results *</Label>
                <Textarea
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder={"Paste race results here…\n\nExample:\n1. Max Verstappen - Red Bull Racing - 58 laps\n2. Lewis Hamilton - Mercedes - +5.023s\n..."}
                  className="min-h-[200px] font-mono text-xs"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Paste results from timing sheets, websites, or any format. Our AI will parse them automatically.</p>
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</> : <><Send className="h-4 w-4 mr-2" /> Submit for Review</>}
              </Button>
            </form>
          </div>

          {/* Past Submissions */}
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-4">Your Submissions</h2>
            {submissions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No submissions yet. Submit your first race results!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map((s: any) => (
                  <div key={s.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-card-foreground">{s.event_name || "Untitled Event"}</h3>
                        <p className="text-sm text-muted-foreground">{s.series_name} · {s.season_year}</p>
                      </div>
                      <Badge
                        variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {s.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                        {s.status === "rejected" && <XCircle className="h-3 w-3" />}
                        {s.status === "pending" && <Clock className="h-3 w-3" />}
                        {s.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Submitted {new Date(s.created_at).toLocaleDateString()}
                      {s.parsed_entries?.entries && ` · ${s.parsed_entries.entries.length} entries parsed`}
                    </p>
                    {s.admin_notes && (
                      <p className="text-xs text-muted-foreground mt-1 border-t border-border pt-1">
                        Admin notes: {s.admin_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Submit;
