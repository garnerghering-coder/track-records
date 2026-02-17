import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, Eye, Trash } from "lucide-react";
import Header from "@/components/Header";
import CountrySelect from "@/components/CountrySelect";
import DriverPhotoUpload from "@/components/DriverPhotoUpload";
import { getFlagForCountry } from "@/lib/countries";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;
type UserRole = Tables<"user_roles">;
type ClaimRequest = Tables<"profile_claim_requests">;

const RACING_CATEGORIES = [
  "karting", "single_seater", "gt", "touring_car", "sports_car",
  "rally", "endurance", "formula", "stock_car", "other",
] as const;

interface RaceResultRow {
  key: string;
  season_year: string;
  series_name: string;
  event_name: string;
  category: string;
  finishing_position: string;
  championship_position: string;
  notes: string;
}

const emptyResult = (): RaceResultRow => ({
  key: crypto.randomUUID(),
  season_year: new Date().getFullYear().toString(),
  series_name: "",
  event_name: "",
  category: "other",
  finishing_position: "",
  championship_position: "",
  notes: "",
});

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create driver form
  const [driverFirst, setDriverFirst] = useState("");
  const [driverLast, setDriverLast] = useState("");
  const [driverNationality, setDriverNationality] = useState("");
  const [driverCategory, setDriverCategory] = useState<string>("other");
  const [driverBio, setDriverBio] = useState("");
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [raceResults, setRaceResults] = useState<RaceResultRow[]>([]);

  // Edit driver
  const [editingDriver, setEditingDriver] = useState<DriverProfile | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editNationality, setEditNationality] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Role management
  const [roleEmail, setRoleEmail] = useState("");
  const [roleToGrant, setRoleToGrant] = useState<string>("driver");
  const [grantingRole, setGrantingRole] = useState(false);

  // Claim requests
  const [claims, setClaims] = useState<(ClaimRequest & { driver_name?: string })[]>([]);

  // Existing data
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);

  useEffect(() => { checkAdmin(); }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin");
    if (!data || data.length === 0) { navigate("/"); return; }
    setIsAdmin(true);
    setLoading(false);
    fetchDrivers();
    fetchRoles();
    fetchClaims();
  };

  const fetchDrivers = async () => {
    const { data } = await supabase.from("driver_profiles").select("*").order("created_at", { ascending: false });
    if (data) setDrivers(data);
  };

  const fetchRoles = async () => {
    const { data } = await supabase.from("user_roles").select("*");
    if (data) setRoles(data);
  };

  const fetchClaims = async () => {
    const { data } = await supabase
      .from("profile_claim_requests")
      .select("*, driver_profiles(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (data) {
      setClaims(data.map((c: any) => ({
        ...c,
        driver_name: c.driver_profiles ? `${c.driver_profiles.first_name} ${c.driver_profiles.last_name}` : "Unknown",
      })));
    }
  };

  const updateResult = (key: string, field: keyof RaceResultRow, value: string) => {
    setRaceResults(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const removeResult = (key: string) => {
    setRaceResults(prev => prev.filter(r => r.key !== key));
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingDriver(true);

    const { data: profile, error } = await supabase.from("driver_profiles").insert({
      first_name: driverFirst, last_name: driverLast,
      nationality: driverNationality || null,
      primary_category: driverCategory as any,
      bio: driverBio || null,
      photo_url: driverPhotoUrl,
    }).select("id").single();

    if (error || !profile) {
      toast({ title: "Error creating profile", description: error?.message, variant: "destructive" });
      setCreatingDriver(false);
      return;
    }

    const validResults = raceResults.filter(r => r.series_name.trim());
    if (validResults.length > 0) {
      const { error: resError } = await supabase.from("race_results").insert(
        validResults.map(r => ({
          driver_profile_id: profile.id,
          season_year: parseInt(r.season_year) || new Date().getFullYear(),
          series_name: r.series_name,
          event_name: r.event_name || null,
          category: (r.category || "other") as any,
          finishing_position: r.finishing_position ? parseInt(r.finishing_position) : null,
          championship_position: r.championship_position ? parseInt(r.championship_position) : null,
          notes: r.notes || null,
          verification_status: "verified" as const,
        }))
      );
      if (resError) toast({ title: "Driver created, but results failed", description: resError.message, variant: "destructive" });
    }

    toast({ title: "Driver profile created", description: `${driverFirst} ${driverLast}` });
    setDriverFirst(""); setDriverLast(""); setDriverNationality(""); setDriverCategory("other"); setDriverBio(""); setDriverPhotoUrl(null);
    setRaceResults([]);
    setCreatingDriver(false);
    fetchDrivers();
  };

  const openEdit = (d: DriverProfile) => {
    setEditingDriver(d);
    setEditFirst(d.first_name);
    setEditLast(d.last_name);
    setEditNationality(d.nationality || "");
    setEditCategory(d.primary_category || "other");
    setEditBio(d.bio || "");
    setEditPhotoUrl(d.photo_url);
  };

  const handleSaveEdit = async () => {
    if (!editingDriver) return;
    setSaving(true);
    const { error } = await supabase.from("driver_profiles").update({
      first_name: editFirst, last_name: editLast,
      nationality: editNationality || null,
      primary_category: editCategory as any,
      bio: editBio || null,
      photo_url: editPhotoUrl,
    }).eq("id", editingDriver.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      setEditingDriver(null);
      fetchDrivers();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("driver_profiles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver deleted" });
      fetchDrivers();
    }
  };

  const handleClaimAction = async (claimId: string, action: "approved" | "rejected", driverProfileId: string, userId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("profile_claim_requests").update({
      status: action,
      reviewed_by: session?.user.id || null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", claimId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (action === "approved") {
      // Link driver profile to user
      await supabase.from("driver_profiles").update({
        user_id: userId,
        is_claimed: true,
      }).eq("id", driverProfileId);
    }

    toast({ title: `Claim ${action}` });
    fetchClaims();
    fetchDrivers();
  };

  const handleGrantRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantingRole(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: roleEmail, role: roleToGrant as any });
    setGrantingRole(false);
    if (error) toast({ title: "Error granting role", description: error.message, variant: "destructive" });
    else { toast({ title: "Role granted successfully" }); setRoleEmail(""); fetchRoles(); }
  };

  if (loading) {
    return (<div className="min-h-screen bg-background"><Header /><div className="flex min-h-screen items-center justify-center pt-16"><p className="text-muted-foreground">Checking permissions…</p></div></div>);
  }
  if (!isAdmin) return null;

  const pendingClaims = claims.filter(c => c.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container pt-24 pb-16">
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground mb-8">Manage drivers, roles, and platform data.</p>

        <Tabs defaultValue="create-driver" className="w-full">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="create-driver">Create Driver</TabsTrigger>
            <TabsTrigger value="drivers">All Drivers ({drivers.length})</TabsTrigger>
            <TabsTrigger value="claims">
              Claims {pendingClaims.length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{pendingClaims.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="roles">Manage Roles</TabsTrigger>
          </TabsList>

          {/* ── Create Driver ── */}
          <TabsContent value="create-driver">
            <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold text-card-foreground mb-4">New Driver Profile</h2>
              <form onSubmit={handleCreateDriver} className="space-y-4">
                <div>
                  <Label className="text-card-foreground mb-2 block">Photo</Label>
                  <DriverPhotoUpload currentUrl={driverPhotoUrl} onUploaded={setDriverPhotoUrl} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="dFirst" className="text-card-foreground">First Name</Label><Input id="dFirst" value={driverFirst} onChange={(e) => setDriverFirst(e.target.value)} required /></div>
                  <div><Label htmlFor="dLast" className="text-card-foreground">Last Name</Label><Input id="dLast" value={driverLast} onChange={(e) => setDriverLast(e.target.value)} required /></div>
                </div>
                <div><Label className="text-card-foreground">Nationality</Label><CountrySelect value={driverNationality} onChange={setDriverNationality} /></div>
                <div>
                  <Label className="text-card-foreground">Primary Category</Label>
                  <Select value={driverCategory} onValueChange={setDriverCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RACING_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="dBio" className="text-card-foreground">Bio</Label><Input id="dBio" value={driverBio} onChange={(e) => setDriverBio(e.target.value)} placeholder="Optional" /></div>

                {/* Race Results */}
                <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-card-foreground font-semibold">Race Results</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRaceResults(prev => [...prev, emptyResult()])}><Plus className="h-4 w-4 mr-1" /> Add Result</Button>
                  </div>
                  {raceResults.length === 0 && <p className="text-sm text-muted-foreground">No results added yet.</p>}
                  <div className="space-y-4">
                    {raceResults.map((r, i) => (
                      <div key={r.key} className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-card-foreground">Result #{i + 1}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeResult(r.key)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs text-muted-foreground">Season Year</Label><Input value={r.season_year} onChange={(e) => updateResult(r.key, "season_year", e.target.value)} type="number" /></div>
                          <div><Label className="text-xs text-muted-foreground">Series Name</Label><Input value={r.series_name} onChange={(e) => updateResult(r.key, "series_name", e.target.value)} placeholder="e.g. F4 British" required /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs text-muted-foreground">Event Name</Label><Input value={r.event_name} onChange={(e) => updateResult(r.key, "event_name", e.target.value)} placeholder="Optional" /></div>
                          <div><Label className="text-xs text-muted-foreground">Category</Label>
                            <Select value={r.category} onValueChange={(v) => updateResult(r.key, "category", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RACING_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}</SelectContent></Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs text-muted-foreground">Finishing Position</Label><Input value={r.finishing_position} onChange={(e) => updateResult(r.key, "finishing_position", e.target.value)} type="number" placeholder="Optional" /></div>
                          <div><Label className="text-xs text-muted-foreground">Championship Position</Label><Input value={r.championship_position} onChange={(e) => updateResult(r.key, "championship_position", e.target.value)} type="number" placeholder="Optional" /></div>
                        </div>
                        <div><Label className="text-xs text-muted-foreground">Notes</Label><Input value={r.notes} onChange={(e) => updateResult(r.key, "notes", e.target.value)} placeholder="Optional" /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={creatingDriver} className="w-full mt-4">{creatingDriver ? "Creating…" : "Create Driver Profile"}</Button>
              </form>
            </div>
          </TabsContent>

          {/* ── All Drivers ── */}
          <TabsContent value="drivers">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Driver</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Nationality</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Claimed</th>
                    <th className="px-4 py-3 text-right font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => {
                    const flag = getFlagForCountry(d.nationality);
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {d.photo_url ? (
                              <img src={d.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{d.first_name[0]}{d.last_name[0]}</div>
                            )}
                            <span className="text-card-foreground font-medium">{d.first_name} {d.last_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{d.primary_category?.replace(/_/g, " ") ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{flag && <span className="mr-1">{flag}</span>}{d.nationality ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${d.is_claimed ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>{d.is_claimed ? "Yes" : "No"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/driver/${d.id}`)}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm"><Trash className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {d.first_name} {d.last_name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete this driver profile and cannot be undone. Race results linked to this driver will also be affected.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(d.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {drivers.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No drivers yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Claims ── */}
          <TabsContent value="claims">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Driver</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">User ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Message</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Document</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-4 py-3 text-card-foreground">{c.driver_name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.user_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{c.message || "—"}</td>
                      <td className="px-4 py-3">
                        {c.document_url ? (
                          <a href={c.document_url} target="_blank" rel="noopener" className="text-primary text-xs hover:underline">View doc</a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === "approved" ? "bg-green-500/20 text-green-400" :
                          c.status === "rejected" ? "bg-destructive/20 text-destructive" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {c.status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="text-green-400 border-green-400/30 hover:bg-green-500/10" onClick={() => handleClaimAction(c.id, "approved", c.driver_profile_id, c.user_id)}>Approve</Button>
                            <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleClaimAction(c.id, "rejected", c.driver_profile_id, c.user_id)}>Reject</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {claims.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No claim requests yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Manage Roles ── */}
          <TabsContent value="roles">
            <div className="max-w-lg rounded-xl border border-border bg-card p-6 mb-6">
              <h2 className="font-display text-xl font-bold text-card-foreground mb-4">Grant Role</h2>
              <form onSubmit={handleGrantRole} className="space-y-4">
                <div><Label htmlFor="rUserId" className="text-card-foreground">User ID</Label><Input id="rUserId" value={roleEmail} onChange={(e) => setRoleEmail(e.target.value)} placeholder="Paste user UUID" required /></div>
                <div>
                  <Label className="text-card-foreground">Role</Label>
                  <Select value={roleToGrant} onValueChange={setRoleToGrant}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="driver">Driver</SelectItem><SelectItem value="team_sponsor">Team / Sponsor</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select>
                </div>
                <Button type="submit" disabled={grantingRole} className="w-full">{grantingRole ? "Granting…" : "Grant Role"}</Button>
              </form>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50"><th className="px-4 py-3 text-left font-semibold text-card-foreground">User ID</th><th className="px-4 py-3 text-left font-semibold text-card-foreground">Role</th></tr></thead>
                <tbody>{roles.map((r) => (<tr key={r.id} className="border-b border-border/50"><td className="px-4 py-3 text-card-foreground font-mono text-xs">{r.user_id}</td><td className="px-4 py-3 text-muted-foreground capitalize">{r.role.replace(/_/g, " ")}</td></tr>))}</tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Edit Driver Dialog ── */}
      <Dialog open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Driver Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-card-foreground mb-2 block">Photo</Label>
              <DriverPhotoUpload currentUrl={editPhotoUrl} driverId={editingDriver?.id} onUploaded={setEditPhotoUrl} size="sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-card-foreground">First Name</Label><Input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} required /></div>
              <div><Label className="text-card-foreground">Last Name</Label><Input value={editLast} onChange={(e) => setEditLast(e.target.value)} required /></div>
            </div>
            <div><Label className="text-card-foreground">Nationality</Label><CountrySelect value={editNationality} onChange={setEditNationality} /></div>
            <div>
              <Label className="text-card-foreground">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RACING_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}</SelectContent></Select>
            </div>
            <div><Label className="text-card-foreground">Bio</Label><Input value={editBio} onChange={(e) => setEditBio(e.target.value)} /></div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">{saving ? "Saving…" : "Save Changes"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
