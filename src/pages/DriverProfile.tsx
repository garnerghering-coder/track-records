import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Globe, Instagram, Twitter, Linkedin, ArrowLeft, Loader2, Pencil, Plus, Trash2, ShieldCheck } from "lucide-react";
import ReportDialog from "@/components/ReportDialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CountrySelect from "@/components/CountrySelect";

import FlagImage from "@/components/FlagImage";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;
type RaceResult = Tables<"race_results">;

const RACING_CATEGORIES = [
"karting", "single_seater", "gt", "touring_car", "sports_car",
"rally", "endurance", "formula", "stock_car", "other"] as
const;

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other"
};

const VerificationBadge = ({ status }: {status: string;}) => {
  if (status === "verified") return <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"><CheckCircle className="h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
};

const DriverProfilePage = () => {
  const { id } = useParams<{id: string;}>();
  const { toast } = useToast();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Claim state
  const [claimMessage, setClaimMessage] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [existingClaim, setExistingClaim] = useState<any>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editNationality, setEditNationality] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const [editSocialWebsite, setEditSocialWebsite] = useState("");
  const [editSocialInstagram, setEditSocialInstagram] = useState("");
  const [editSocialTwitter, setEditSocialTwitter] = useState("");
  const [editSocialLinkedin, setEditSocialLinkedin] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Add result state
  const [addingResult, setAddingResult] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear().toString());
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newFinishPos, setNewFinishPos] = useState("");
  const [newChampPos, setNewChampPos] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [submittingResult, setSubmittingResult] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) checkAdmin(s.user.id);
    });
  }, []);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    setIsAdmin(!!data && data.length > 0);
  };

  const [eventResults, setEventResults] = useState<any[]>([]);

  const fetchData = async () => {
    if (!id) return;
    const [profileRes, resultsRes] = await Promise.all([
    supabase.from("driver_profiles").select("*").eq("id", id).single(),
    supabase.from("race_results").select("*").eq("driver_profile_id", id).order("season_year", { ascending: false })]
    );
    setProfile(profileRes.data);
    setResults(resultsRes.data ?? []);

    // Fetch events from new tables
    const { data: junctions } = await supabase.
    from("race_entry_drivers").
    select("race_entry_id, race_entries(id, race_event_id, team_name, car_number, race_class, finishing_position, class_position, laps_completed, status, race_events(id, event_name, series_name, season_year, category, location, event_date))").
    eq("driver_profile_id", id);

    const evResults = (junctions || []).
    map((j: any) => j.race_entries).
    filter(Boolean).
    sort((a: any, b: any) => {
      const dateA = a.race_events?.event_date || "";
      const dateB = b.race_events?.event_date || "";
      if (dateA || dateB) return dateB.localeCompare(dateA);
      return (b.race_events?.season_year || 0) - (a.race_events?.season_year || 0);
    });
    setEventResults(evResults);

    setLoading(false);
  };

  useEffect(() => {fetchData();}, [id]);

  useEffect(() => {
    if (!session || !id) return;
    supabase.from("profile_claim_requests").select("*").
    eq("driver_profile_id", id).eq("user_id", session.user.id).
    maybeSingle().then(({ data }) => setExistingClaim(data));
  }, [session, id]);

  const isOwner = profile?.is_claimed && session && profile.user_id === session.user.id;

  const openEditMode = () => {
    if (!profile) return;
    setEditBio(profile.bio || "");
    setEditNationality(profile.nationality || "");
    setEditCategory(profile.primary_category || "other");

    setEditSocialWebsite(profile.social_website || "");
    setEditSocialInstagram(profile.social_instagram || "");
    setEditSocialTwitter(profile.social_twitter || "");
    setEditSocialLinkedin(profile.social_linkedin || "");
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    const { error } = await supabase.from("driver_profiles").update({
      bio: editBio || null,
      nationality: editNationality || null,
      primary_category: editCategory as any,

      social_website: editSocialWebsite || null,
      social_instagram: editSocialInstagram || null,
      social_twitter: editSocialTwitter || null,
      social_linkedin: editSocialLinkedin || null
    }).eq("id", profile.id);
    setSavingProfile(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      setEditing(false);
      fetchData();
    }
  };

  const handleAddResult = async () => {
    if (!profile || !newSeriesName.trim()) return;
    setSubmittingResult(true);
    const { error } = await supabase.from("race_results").insert({
      driver_profile_id: profile.id,
      season_year: parseInt(newSeasonYear) || new Date().getFullYear(),
      series_name: newSeriesName,
      event_name: newEventName || null,
      category: newCategory as any,
      finishing_position: newFinishPos ? parseInt(newFinishPos) : null,
      championship_position: newChampPos ? parseInt(newChampPos) : null,
      notes: newNotes || null,
      submitted_by: session?.user.id || null,
      verification_status: "pending" as const
    });
    setSubmittingResult(false);
    if (error) {
      toast({ title: "Error adding result", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Result added", description: "It will appear as pending until verified by an admin." });
      setAddingResult(false);
      setNewSeriesName("");setNewEventName("");setNewCategory("other");setNewFinishPos("");setNewChampPos("");setNewNotes("");
      setNewSeasonYear(new Date().getFullYear().toString());
      fetchData();
    }
  };

  const handleVerifyResult = async (resultId: string, status: "verified" | "rejected") => {
    const { error } = await supabase.from("race_results").update({
      verification_status: status,
      verified_by: session?.user.id || null,
      verified_at: new Date().toISOString()
    }).eq("id", resultId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Result ${status}` });
      fetchData();
    }
  };

  const handleSubmitClaim = async () => {
    if (!session || !id) return;
    setClaimSubmitting(true);
    let documentUrl: string | null = null;
    if (claimFile) {
      const ext = claimFile.name.split(".").pop();
      const path = `${session.user.id}/${id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("claim-documents").upload(path, claimFile, { upsert: true });
      if (uploadError) {toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });setClaimSubmitting(false);return;}
      const { data: signedData } = await supabase.storage.from("claim-documents").createSignedUrl(path, 60 * 60 * 24 * 30);
      documentUrl = signedData?.signedUrl || null;
    }
    const { error } = await supabase.from("profile_claim_requests").insert({
      driver_profile_id: id, user_id: session.user.id, message: claimMessage || null, document_url: documentUrl
    });
    setClaimSubmitting(false);
    if (error) {toast({ title: "Error submitting claim", description: error.message, variant: "destructive" });} else
    {toast({ title: "Claim submitted", description: "An admin will review your request." });setClaimDialogOpen(false);setExistingClaim({ status: "pending" });}
  };

  if (loading) {
    return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading profile…</p></div></div>;
  }
  if (!profile) {
    return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Driver profile not found.</p><Link to="/search"><Button variant="outline">Back to Search</Button></Link></div></div>;
  }

  const verifiedCount = results.filter((r) => r.verification_status === "verified").length;
  const flag = null; // replaced by FlagImage component

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="pt-24 pb-12" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <Link to="/search" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/20 text-primary font-display text-3xl font-bold">
                {profile.first_name[0]}{profile.last_name[0]}
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
                    {profile.first_name} {profile.last_name}
                  </h1>
                  
                </div>
                <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                  {profile.nationality && <span className="inline-flex items-center gap-1"><FlagImage nationality={profile.nationality} size={16} /> {profile.nationality}</span>}
                  {profile.primary_category && <span>{categoryLabels[profile.primary_category] || profile.primary_category}</span>}
                  {profile.license_grade && <span>License: {profile.license_grade}</span>}
                  
                </div>
              </div>
            </div>
            {isOwner && !editing &&
            <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button variant="outline" size="sm" onClick={openEditMode} className="border-white/20 text-white hover:bg-white/10 hover:text-white">
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit Profile
                </Button>
              </div>
            }
            {!isOwner && profile &&
            <div className="self-start sm:self-auto">
                <ReportDialog reportType="driver" targetId={profile.id} targetName={`${profile.first_name} ${profile.last_name}`} />
              </div>
            }
          </div>
        </div>
      </section>

      <div className="container py-10 grid gap-10 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Edit Profile Panel */}
          {editing && isOwner &&
          <div className="rounded-lg border-2 border-primary/30 bg-card p-5 space-y-4">
              <h3 className="font-display text-sm font-semibold text-card-foreground">Edit Profile</h3>
              <div>
                <Label className="text-card-foreground text-xs">Bio</Label>
                <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} />
              </div>
              <div>
                <Label className="text-card-foreground text-xs">Nationality</Label>
                <CountrySelect value={editNationality} onChange={setEditNationality} />
              </div>
              <div>
                <Label className="text-card-foreground text-xs">Primary Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RACING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-card-foreground text-xs">Social Links</Label>
                <Input placeholder="Website URL" value={editSocialWebsite} onChange={(e) => setEditSocialWebsite(e.target.value)} />
                <Input placeholder="Instagram URL" value={editSocialInstagram} onChange={(e) => setEditSocialInstagram(e.target.value)} />
                <Input placeholder="Twitter / X URL" value={editSocialTwitter} onChange={(e) => setEditSocialTwitter(e.target.value)} />
                <Input placeholder="LinkedIn URL" value={editSocialLinkedin} onChange={(e) => setEditSocialLinkedin(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="flex-1">
                  {savingProfile ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          }

          {!editing && profile.bio &&
          <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
            </div>
          }

          {!editing && (profile.license_type || profile.license_grade || profile.license_issuing_body) &&
          <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Racing License</h3>
              <dl className="space-y-1 text-sm">
                {profile.license_type && <div className="flex justify-between"><dt className="text-muted-foreground">Type</dt><dd className="text-card-foreground">{profile.license_type}</dd></div>}
                {profile.license_grade && <div className="flex justify-between"><dt className="text-muted-foreground">Grade</dt><dd className="text-card-foreground">{profile.license_grade}</dd></div>}
                {profile.license_issuing_body && <div className="flex justify-between"><dt className="text-muted-foreground">Issued By</dt><dd className="text-card-foreground">{profile.license_issuing_body}</dd></div>}
              </dl>
            </div>
          }

          {!editing && (profile.social_website || profile.social_instagram || profile.social_twitter || profile.social_linkedin) &&
          <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Links</h3>
              <div className="flex gap-3">
                {profile.social_website && <a href={profile.social_website} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Globe className="h-5 w-5" /></a>}
                {profile.social_instagram && <a href={profile.social_instagram} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Instagram className="h-5 w-5" /></a>}
                {profile.social_twitter && <a href={profile.social_twitter} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Twitter className="h-5 w-5" /></a>}
                {profile.social_linkedin && <a href={profile.social_linkedin} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary"><Linkedin className="h-5 w-5" /></a>}
              </div>
            </div>
          }

          {/* Claim section */}
          {!profile.is_claimed &&
          <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 text-center">
              <p className="text-sm text-muted-foreground mb-3">Is this your profile?</p>
              {!session ?
            <Link to="/auth?signup=true"><Button size="sm">Sign Up to Claim</Button></Link> :
            existingClaim ?
            <p className="text-xs text-muted-foreground">Your claim is <span className="font-medium text-primary">{existingClaim.status}</span>.</p> :

            <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
                  <DialogTrigger asChild><Button size="sm">Claim This Profile</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Claim Profile: {profile.first_name} {profile.last_name}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <p className="text-sm text-muted-foreground">Upload a document (racing license, ID, or similar) to verify your identity.</p>
                      <div>
                        <Label className="text-card-foreground">Verification Document</Label>
                        <div className="mt-1 flex items-center justify-center rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileRef.current?.click()}>
                          {claimFile ? <span className="text-sm text-card-foreground">{claimFile.name}</span> : <span className="text-sm text-muted-foreground">Click to upload (PDF, JPG, PNG)</span>}
                          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setClaimFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                      <div><Label className="text-card-foreground">Message (optional)</Label><Input value={claimMessage} onChange={(e) => setClaimMessage(e.target.value)} placeholder="Any additional info…" /></div>
                      <Button onClick={handleSubmitClaim} disabled={claimSubmitting || !claimFile} className="w-full">
                        {claimSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Submit Claim"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
            }
            </div>
          }
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-foreground">Race Results</h2>
            {isOwner &&
            <Button size="sm" variant="outline" onClick={() => setAddingResult(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Result
              </Button>
            }
          </div>

          {/* Add Result Form */}
          {addingResult && isOwner &&
          <div className="rounded-lg border-2 border-primary/30 bg-card p-5 mb-4 space-y-3">
              <h3 className="font-display text-sm font-semibold text-card-foreground">New Race Result</h3>
              <p className="text-xs text-muted-foreground">Results you add will be marked as "Pending" until verified by an admin.</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground">Season Year</Label><Input value={newSeasonYear} onChange={(e) => setNewSeasonYear(e.target.value)} type="number" /></div>
                <div><Label className="text-xs text-muted-foreground">Series Name</Label><Input value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} placeholder="e.g. F4 British" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground">Event Name</Label><Input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Optional" /></div>
                <div><Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RACING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground">Finishing Position</Label><Input value={newFinishPos} onChange={(e) => setNewFinishPos(e.target.value)} type="number" placeholder="Optional" /></div>
                <div><Label className="text-xs text-muted-foreground">Championship Position</Label><Input value={newChampPos} onChange={(e) => setNewChampPos(e.target.value)} type="number" placeholder="Optional" /></div>
              </div>
              <div><Label className="text-xs text-muted-foreground">Notes</Label><Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Optional" /></div>
              <div className="flex gap-2">
                <Button onClick={handleAddResult} disabled={submittingResult || !newSeriesName.trim()} className="flex-1">
                  {submittingResult ? "Adding…" : "Add Result"}
                </Button>
                <Button variant="outline" onClick={() => setAddingResult(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          }

          {results.length === 0 && eventResults.length === 0 ?
          <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No race results yet.</p>
            </div> :
          results.length === 0 ? null :
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
                    {isAdmin && <TableHead className="text-right">Admin</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) =>
                <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.season_year}</TableCell>
                      <TableCell>{r.series_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.event_name || "—"}</TableCell>
                      <TableCell className="text-center">{r.finishing_position ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.championship_position ?? "—"}</TableCell>
                      <TableCell className="text-right"><VerificationBadge status={r.verification_status} /></TableCell>
                      {isAdmin &&
                  <TableCell className="text-right">
                          {r.verification_status !== "verified" &&
                    <Button size="sm" variant="ghost" onClick={() => handleVerifyResult(r.id, "verified")} className="text-green-400 hover:text-green-300 gap-1">
                              <ShieldCheck className="h-3.5 w-3.5" /> Verify
                            </Button>
                    }
                          {r.verification_status !== "rejected" && r.verification_status !== "verified" &&
                    <Button size="sm" variant="ghost" onClick={() => handleVerifyResult(r.id, "rejected")} className="text-destructive hover:text-destructive/80 gap-1">
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                    }
                        </TableCell>
                  }
                    </TableRow>
                )}
                </TableBody>
              </Table>
            </div>
          }

          {/* Event-based results */}
          {eventResults.length > 0 &&
          <div className="mt-6">
              <div className="space-y-3">
                {eventResults.map((entry: any) => {
                const ev = entry.race_events;
                if (!ev) return null;
                const catLabel = ev.category ? categoryLabels[ev.category] || ev.category : null;
                return (
                  <Link
                    key={entry.id}
                    to={`/event/${ev.id}`}
                    className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors">

                      <div className="w-10 text-center shrink-0">
                        {entry.finishing_position != null ?
                      <span className={`font-display text-lg font-bold ${entry.finishing_position === 1 ? "text-primary" : "text-card-foreground"}`}>
                            P{entry.finishing_position}
                          </span> :

                      <span className="text-muted-foreground text-sm">—</span>
                      }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">{ev.event_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ev.series_name} • {ev.season_year}
                          {ev.event_date && <span className="ml-1">• {new Date(ev.event_date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
                        </p>
                      </div>
                      {entry.team_name && <span className="text-xs text-muted-foreground hidden sm:block">{entry.team_name}</span>}
                      {entry.car_number && <span className="text-xs font-mono text-muted-foreground">#{entry.car_number}</span>}
                      {entry.race_class && <Badge variant="secondary" className="text-xs">{entry.race_class}</Badge>}
                      {catLabel && <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{catLabel}</Badge>}
                    </Link>);

              })}
              </div>
            </div>
          }
        </div>
      </div>

      <Footer />
    </div>);

};

export default DriverProfilePage;