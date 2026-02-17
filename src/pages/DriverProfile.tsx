import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Globe, Instagram, Twitter, Linkedin, ArrowLeft, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getFlagForCountry } from "@/lib/countries";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;
type RaceResult = Tables<"race_results">;

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

const VerificationBadge = ({ status }: { status: string }) => {
  if (status === "verified") return <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"><CheckCircle className="h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
};

const DriverProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [existingClaim, setExistingClaim] = useState<any>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [profileRes, resultsRes] = await Promise.all([
        supabase.from("driver_profiles").select("*").eq("id", id).single(),
        supabase.from("race_results").select("*").eq("driver_profile_id", id).order("season_year", { ascending: false }),
      ]);
      setProfile(profileRes.data);
      setResults(resultsRes.data ?? []);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  // Check if current user already submitted a claim
  useEffect(() => {
    if (!session || !id) return;
    supabase.from("profile_claim_requests")
      .select("*")
      .eq("driver_profile_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setExistingClaim(data));
  }, [session, id]);

  const handleSubmitClaim = async () => {
    if (!session || !id) return;
    setClaimSubmitting(true);

    let documentUrl: string | null = null;
    if (claimFile) {
      const ext = claimFile.name.split(".").pop();
      const path = `${session.user.id}/${id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("claim-documents").upload(path, claimFile, { upsert: true });
      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        setClaimSubmitting(false);
        return;
      }
      // Generate a signed URL for admin to view
      const { data: signedData } = await supabase.storage.from("claim-documents").createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
      documentUrl = signedData?.signedUrl || null;
    }

    const { error } = await supabase.from("profile_claim_requests").insert({
      driver_profile_id: id,
      user_id: session.user.id,
      message: claimMessage || null,
      document_url: documentUrl,
    });

    setClaimSubmitting(false);
    if (error) {
      toast({ title: "Error submitting claim", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Claim submitted", description: "An admin will review your request." });
      setClaimDialogOpen(false);
      setExistingClaim({ status: "pending" });
    }
  };

  if (loading) {
    return (<div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading profile…</p></div></div>);
  }

  if (!profile) {
    return (<div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Driver profile not found.</p><Link to="/search"><Button variant="outline">Back to Search</Button></Link></div></div>);
  }

  const verifiedCount = results.filter(r => r.verification_status === "verified").length;
  const flag = getFlagForCountry(profile.nationality);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="pt-24 pb-12" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <Link to="/search" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={`${profile.first_name} ${profile.last_name}`} className="h-24 w-24 rounded-xl object-cover border-2 border-primary/30" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/20 text-primary font-display text-3xl font-bold">
                {profile.first_name[0]}{profile.last_name[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
                  {profile.first_name} {profile.last_name}
                </h1>
                {!profile.is_claimed && <Badge variant="secondary" className="text-xs">Unclaimed</Badge>}
              </div>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                {profile.nationality && <span>{flag ?? "🌍"} {profile.nationality}</span>}
                {profile.primary_category && <span>{categoryLabels[profile.primary_category] || profile.primary_category}</span>}
                {profile.license_grade && <span>License: {profile.license_grade}</span>}
                <span>{verifiedCount} verified result{verifiedCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10 grid gap-10 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-6">
          {profile.bio && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {(profile.license_type || profile.license_grade || profile.license_issuing_body) && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Racing License</h3>
              <dl className="space-y-1 text-sm">
                {profile.license_type && <div className="flex justify-between"><dt className="text-muted-foreground">Type</dt><dd className="text-card-foreground">{profile.license_type}</dd></div>}
                {profile.license_grade && <div className="flex justify-between"><dt className="text-muted-foreground">Grade</dt><dd className="text-card-foreground">{profile.license_grade}</dd></div>}
                {profile.license_issuing_body && <div className="flex justify-between"><dt className="text-muted-foreground">Issued By</dt><dd className="text-card-foreground">{profile.license_issuing_body}</dd></div>}
              </dl>
            </div>
          )}

          {(profile.social_website || profile.social_instagram || profile.social_twitter || profile.social_linkedin) && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Links</h3>
              <div className="flex gap-3">
                {profile.social_website && <a href={profile.social_website} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Globe className="h-5 w-5" /></a>}
                {profile.social_instagram && <a href={profile.social_instagram} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Instagram className="h-5 w-5" /></a>}
                {profile.social_twitter && <a href={profile.social_twitter} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Twitter className="h-5 w-5" /></a>}
                {profile.social_linkedin && <a href={profile.social_linkedin} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Linkedin className="h-5 w-5" /></a>}
              </div>
            </div>
          )}

          {/* Claim section */}
          {!profile.is_claimed && (
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 text-center">
              <p className="text-sm text-muted-foreground mb-3">Is this your profile?</p>
              {!session ? (
                <Link to="/auth?signup=true"><Button size="sm">Sign Up to Claim</Button></Link>
              ) : existingClaim ? (
                <p className="text-xs text-muted-foreground">
                  Your claim is <span className="font-medium text-primary">{existingClaim.status}</span>.
                </p>
              ) : (
                <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">Claim This Profile</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Claim Profile: {profile.first_name} {profile.last_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <p className="text-sm text-muted-foreground">Upload a document (racing license, ID, or similar) to verify your identity. An admin will review your request.</p>
                      <div>
                        <Label className="text-card-foreground">Verification Document</Label>
                        <div
                          className="mt-1 flex items-center justify-center rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => fileRef.current?.click()}
                        >
                          {claimFile ? (
                            <span className="text-sm text-card-foreground">{claimFile.name}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Click to upload (PDF, JPG, PNG)</span>
                          )}
                          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setClaimFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-card-foreground">Message (optional)</Label>
                        <Input value={claimMessage} onChange={(e) => setClaimMessage(e.target.value)} placeholder="Any additional info…" />
                      </div>
                      <Button onClick={handleSubmitClaim} disabled={claimSubmitting || !claimFile} className="w-full">
                        {claimSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Submit Claim"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl font-bold text-foreground mb-4">Race Results</h2>
          {results.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No race results yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Season</TableHead>
                    <TableHead>Series</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-center">Pos.</TableHead>
                    <TableHead className="text-center">Champ.</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.season_year}</TableCell>
                      <TableCell>{r.series_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.event_name || "—"}</TableCell>
                      <TableCell className="text-center">{r.finishing_position ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.championship_position ?? "—"}</TableCell>
                      <TableCell className="text-right"><VerificationBadge status={r.verification_status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default DriverProfilePage;
