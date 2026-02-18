import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CountrySelect from "@/components/CountrySelect";
import { checkFieldsForProfanity } from "@/lib/profanity-filter";

const RACING_CATEGORIES = [
  "karting", "single_seater", "gt", "touring_car", "sports_car",
  "rally", "endurance", "formula", "stock_car", "other",
] as const;

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

interface EntryRow {
  key: string;
  finishing_position: string;
  driver_names: string;
  team_name: string;
  car_number: string;
  race_class: string;
  status: string;
}

const emptyEntry = (): EntryRow => ({
  key: crypto.randomUUID(),
  finishing_position: "",
  driver_names: "",
  team_name: "",
  car_number: "",
  race_class: "",
  status: "",
});

const ContributePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Add Race Results
  const [seriesName, setSeriesName] = useState("");
  const [eventName, setEventName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear().toString());
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [eventCategory, setEventCategory] = useState("other");
  const [entries, setEntries] = useState<EntryRow[]>([emptyEntry()]);
  const [submittingResults, setSubmittingResults] = useState(false);

  // Add Driver
  const [driverFirst, setDriverFirst] = useState("");
  const [driverLast, setDriverLast] = useState("");
  const [driverNationality, setDriverNationality] = useState("");
  const [driverCategory, setDriverCategory] = useState("other");
  const [driverBio, setDriverBio] = useState("");
  const [submittingDriver, setSubmittingDriver] = useState(false);

  // Add Team
  const [teamName, setTeamName] = useState("");
  const [teamNationality, setTeamNationality] = useState("");
  const [teamCategory, setTeamCategory] = useState("other");
  const [teamWebsite, setTeamWebsite] = useState("");
  const [teamBio, setTeamBio] = useState("");
  const [submittingTeam, setSubmittingTeam] = useState(false);

  // Edit Existing
  const [editSearch, setEditSearch] = useState("");
  const [editResults, setEditResults] = useState<any[]>([]);
  const [editSearching, setEditSearching] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingType, setEditingType] = useState<string>("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // My Contributions
  const [myContributions, setMyContributions] = useState<any[]>([]);
  const [loadingContributions, setLoadingContributions] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
      if (!s) navigate("/auth");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) navigate("/auth");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchContributions = async () => {
    if (!session) return;
    setLoadingContributions(true);
    const { data } = await supabase
      .from("edit_queue" as any)
      .select("*")
      .eq("submitted_by", session.user.id)
      .order("created_at", { ascending: false });
    setMyContributions(data ?? []);
    setLoadingContributions(false);
  };

  const profanityCheck = (fields: Record<string, string | null | undefined>): boolean => {
    const badField = checkFieldsForProfanity(fields);
    if (badField) {
      toast({ title: "Inappropriate content detected", description: `Please remove inappropriate language from the "${badField}" field.`, variant: "destructive" });
      return true;
    }
    return false;
  };

  // Submit Race Results
  const handleSubmitResults = async () => {
    if (!session || !seriesName.trim() || !eventName.trim()) return;
    const allFields: Record<string, string | null> = { seriesName, eventName, location };
    for (const entry of entries) {
      Object.assign(allFields, { [`driver_${entry.key}`]: entry.driver_names, [`team_${entry.key}`]: entry.team_name });
    }
    if (profanityCheck(allFields)) return;

    setSubmittingResults(true);

    // Submit event creation
    await supabase.from("edit_queue" as any).insert({
      submitted_by: session.user.id,
      edit_type: "create_event",
      target_table: "race_events",
      proposed_data: {
        event_name: eventName,
        series_name: seriesName,
        season_year: parseInt(seasonYear) || new Date().getFullYear(),
        event_date: eventDate || null,
        location: location || null,
        category: eventCategory,
        entries: entries.map(e => ({
          finishing_position: e.finishing_position ? parseInt(e.finishing_position) : null,
          driver_names: e.driver_names.split(",").map(n => n.trim()).filter(Boolean),
          team_name: e.team_name || null,
          car_number: e.car_number || null,
          race_class: e.race_class || null,
          status: e.status || null,
        })),
      },
    });

    setSubmittingResults(false);
    toast({ title: "Results submitted", description: "Your contribution is pending admin review." });
    setSeriesName(""); setEventName(""); setEventDate(""); setLocation("");
    setEntries([emptyEntry()]);
  };

  // Submit Driver
  const handleSubmitDriver = async () => {
    if (!session || !driverFirst.trim() || !driverLast.trim()) return;
    if (profanityCheck({ first_name: driverFirst, last_name: driverLast, bio: driverBio })) return;

    setSubmittingDriver(true);
    await supabase.from("edit_queue" as any).insert({
      submitted_by: session.user.id,
      edit_type: "create_driver",
      target_table: "driver_profiles",
      proposed_data: {
        first_name: driverFirst,
        last_name: driverLast,
        nationality: driverNationality || null,
        primary_category: driverCategory,
        bio: driverBio || null,
      },
    });
    setSubmittingDriver(false);
    toast({ title: "Driver submitted", description: "Pending admin review." });
    setDriverFirst(""); setDriverLast(""); setDriverNationality(""); setDriverBio("");
  };

  // Submit Team
  const handleSubmitTeam = async () => {
    if (!session || !teamName.trim()) return;
    if (profanityCheck({ name: teamName, bio: teamBio, website: teamWebsite })) return;

    setSubmittingTeam(true);
    await supabase.from("edit_queue" as any).insert({
      submitted_by: session.user.id,
      edit_type: "create_team",
      target_table: "team_profiles",
      proposed_data: {
        name: teamName,
        nationality: teamNationality || null,
        primary_category: teamCategory,
        website: teamWebsite || null,
        bio: teamBio || null,
      },
    });
    setSubmittingTeam(false);
    toast({ title: "Team submitted", description: "Pending admin review." });
    setTeamName(""); setTeamNationality(""); setTeamBio(""); setTeamWebsite("");
  };

  // Search for editing
  const handleEditSearch = async () => {
    if (!editSearch.trim()) return;
    setEditSearching(true);
    const lower = `%${editSearch}%`;

    const [drivers, teams, events] = await Promise.all([
      supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category, bio").or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(10),
      supabase.from("team_profiles" as any).select("id, name, nationality, primary_category, bio, website").ilike("name", lower).limit(10) as any,
      supabase.from("race_events").select("id, event_name, series_name, season_year, category, location").or(`event_name.ilike.${lower},series_name.ilike.${lower}`).limit(10),
    ]);

    const results: any[] = [];
    (drivers.data || []).forEach((d: any) => results.push({ ...d, _type: "driver", _label: `${d.first_name} ${d.last_name}` }));
    ((teams as any).data || []).forEach((t: any) => results.push({ ...t, _type: "team", _label: t.name }));
    (events.data || []).forEach((e: any) => results.push({ ...e, _type: "event", _label: `${e.event_name} (${e.series_name} ${e.season_year})` }));
    setEditResults(results);
    setEditSearching(false);
  };

  const startEditing = (item: any) => {
    setEditingItem(item);
    setEditingType(item._type);
    const fields: Record<string, string> = {};
    if (item._type === "driver") {
      fields.first_name = item.first_name || "";
      fields.last_name = item.last_name || "";
      fields.nationality = item.nationality || "";
      fields.primary_category = item.primary_category || "other";
      fields.bio = item.bio || "";
    } else if (item._type === "team") {
      fields.name = item.name || "";
      fields.nationality = item.nationality || "";
      fields.primary_category = item.primary_category || "other";
      fields.bio = item.bio || "";
      fields.website = item.website || "";
    } else if (item._type === "event") {
      fields.event_name = item.event_name || "";
      fields.series_name = item.series_name || "";
      fields.season_year = String(item.season_year || "");
      fields.category = item.category || "other";
      fields.location = item.location || "";
    }
    setEditFields(fields);
  };

  const handleSubmitEdit = async () => {
    if (!session || !editingItem) return;
    if (profanityCheck(editFields)) return;

    setSubmittingEdit(true);
    const tableMap: Record<string, string> = { driver: "driver_profiles", team: "team_profiles", event: "race_events" };
    const editTypeMap: Record<string, string> = { driver: "edit_driver", team: "edit_team", event: "edit_event" };

    // Build previous_data snapshot
    const previousData: Record<string, any> = {};
    for (const key of Object.keys(editFields)) {
      previousData[key] = editingItem[key] ?? null;
    }

    await supabase.from("edit_queue" as any).insert({
      submitted_by: session.user.id,
      edit_type: editTypeMap[editingType],
      target_table: tableMap[editingType],
      target_id: editingItem.id,
      proposed_data: editFields,
      previous_data: previousData,
    });

    setSubmittingEdit(false);
    toast({ title: "Edit submitted", description: "Pending admin review." });
    setEditingItem(null);
    setEditFields({});
  };

  if (loading) {
    return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="pt-24 pb-10" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>Contribute</h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>Help build the motorsport database. All contributions are reviewed by admins.</p>
        </div>
      </section>

      <div className="container py-8">
        <Tabs defaultValue="add-results">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="add-results">Add Race Results</TabsTrigger>
            <TabsTrigger value="add-driver">Add Driver</TabsTrigger>
            <TabsTrigger value="add-team">Add Team</TabsTrigger>
            <TabsTrigger value="edit-existing">Edit Existing</TabsTrigger>
            <TabsTrigger value="my-contributions" onClick={fetchContributions}>My Contributions</TabsTrigger>
          </TabsList>

          {/* ADD RACE RESULTS */}
          <TabsContent value="add-results">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4 max-w-4xl">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Add Race Results</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-card-foreground text-xs">Series Name *</Label><Input value={seriesName} onChange={e => setSeriesName(e.target.value)} placeholder="e.g. IMSA WeatherTech" /></div>
                <div><Label className="text-card-foreground text-xs">Event Name *</Label><Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Rolex 24 at Daytona" /></div>
                <div><Label className="text-card-foreground text-xs">Season Year</Label><Input type="number" value={seasonYear} onChange={e => setSeasonYear(e.target.value)} /></div>
                <div><Label className="text-card-foreground text-xs">Event Date</Label><Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></div>
                <div><Label className="text-card-foreground text-xs">Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Daytona, FL" /></div>
                <div>
                  <Label className="text-card-foreground text-xs">Category</Label>
                  <Select value={eventCategory} onValueChange={setEventCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RACING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-card-foreground text-xs">Entries</Label>
                {entries.map((entry, i) => (
                  <div key={entry.key} className="grid grid-cols-6 gap-2 items-end">
                    <Input placeholder="Pos" value={entry.finishing_position} onChange={e => { const next = [...entries]; next[i] = { ...entry, finishing_position: e.target.value }; setEntries(next); }} />
                    <Input placeholder="Driver(s), comma-sep" className="col-span-2" value={entry.driver_names} onChange={e => { const next = [...entries]; next[i] = { ...entry, driver_names: e.target.value }; setEntries(next); }} />
                    <Input placeholder="Team" value={entry.team_name} onChange={e => { const next = [...entries]; next[i] = { ...entry, team_name: e.target.value }; setEntries(next); }} />
                    <Input placeholder="Class" value={entry.race_class} onChange={e => { const next = [...entries]; next[i] = { ...entry, race_class: e.target.value }; setEntries(next); }} />
                    <div className="flex gap-1">
                      <Input placeholder="Status" value={entry.status} onChange={e => { const next = [...entries]; next[i] = { ...entry, status: e.target.value }; setEntries(next); }} />
                      {entries.length > 1 && <Button variant="ghost" size="icon" onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEntries([...entries, emptyEntry()])} className="gap-1"><Plus className="h-3 w-3" /> Add Entry</Button>
              </div>

              <Button onClick={handleSubmitResults} disabled={submittingResults || !seriesName.trim() || !eventName.trim()}>
                {submittingResults ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Submitting…</> : "Submit Results"}
              </Button>
            </div>
          </TabsContent>

          {/* ADD DRIVER */}
          <TabsContent value="add-driver">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4 max-w-lg">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Add Driver</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-card-foreground text-xs">First Name *</Label><Input value={driverFirst} onChange={e => setDriverFirst(e.target.value)} /></div>
                <div><Label className="text-card-foreground text-xs">Last Name *</Label><Input value={driverLast} onChange={e => setDriverLast(e.target.value)} /></div>
              </div>
              <div><Label className="text-card-foreground text-xs">Nationality</Label><CountrySelect value={driverNationality} onChange={setDriverNationality} /></div>
              <div>
                <Label className="text-card-foreground text-xs">Primary Category</Label>
                <Select value={driverCategory} onValueChange={setDriverCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RACING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-card-foreground text-xs">Bio</Label><Textarea value={driverBio} onChange={e => setDriverBio(e.target.value)} rows={3} /></div>
              <Button onClick={handleSubmitDriver} disabled={submittingDriver || !driverFirst.trim() || !driverLast.trim()}>
                {submittingDriver ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Submitting…</> : "Submit Driver"}
              </Button>
            </div>
          </TabsContent>

          {/* ADD TEAM */}
          <TabsContent value="add-team">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4 max-w-lg">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Add Team</h2>
              <div><Label className="text-card-foreground text-xs">Team Name *</Label><Input value={teamName} onChange={e => setTeamName(e.target.value)} /></div>
              <div><Label className="text-card-foreground text-xs">Nationality</Label><CountrySelect value={teamNationality} onChange={setTeamNationality} /></div>
              <div>
                <Label className="text-card-foreground text-xs">Primary Category</Label>
                <Select value={teamCategory} onValueChange={setTeamCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RACING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-card-foreground text-xs">Website</Label><Input value={teamWebsite} onChange={e => setTeamWebsite(e.target.value)} placeholder="https://" /></div>
              <div><Label className="text-card-foreground text-xs">Bio</Label><Textarea value={teamBio} onChange={e => setTeamBio(e.target.value)} rows={3} /></div>
              <Button onClick={handleSubmitTeam} disabled={submittingTeam || !teamName.trim()}>
                {submittingTeam ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Submitting…</> : "Submit Team"}
              </Button>
            </div>
          </TabsContent>

          {/* EDIT EXISTING */}
          <TabsContent value="edit-existing">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4 max-w-2xl">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Edit Existing Data</h2>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search drivers, teams, or events…" value={editSearch} onChange={e => setEditSearch(e.target.value)} className="pl-10" onKeyDown={e => e.key === "Enter" && handleEditSearch()} />
                </div>
                <Button onClick={handleEditSearch} disabled={editSearching}>{editSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
              </div>

              {!editingItem && editResults.length > 0 && (
                <div className="space-y-2">
                  {editResults.map(item => (
                    <button key={`${item._type}-${item.id}`} onClick={() => startEditing(item)} className="w-full text-left rounded-lg border border-border p-3 hover:border-primary/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{item._type}</Badge>
                        <span className="text-sm font-medium text-card-foreground">{item._label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {editingItem && (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-card-foreground">
                      Editing: {editingItem._label}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingItem(null); setEditFields({}); }}>Cancel</Button>
                  </div>
                  {Object.entries(editFields).map(([key, value]) => (
                    <div key={key}>
                      <Label className="text-card-foreground text-xs capitalize">{key.replace(/_/g, " ")}</Label>
                      {key === "primary_category" || key === "category" ? (
                        <Select value={value} onValueChange={v => setEditFields({ ...editFields, [key]: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{RACING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : key === "nationality" ? (
                        <CountrySelect value={value} onChange={v => setEditFields({ ...editFields, [key]: v })} />
                      ) : key === "bio" ? (
                        <Textarea value={value} onChange={e => setEditFields({ ...editFields, [key]: e.target.value })} rows={3} />
                      ) : (
                        <Input value={value} onChange={e => setEditFields({ ...editFields, [key]: e.target.value })} />
                      )}
                    </div>
                  ))}
                  <Button onClick={handleSubmitEdit} disabled={submittingEdit}>
                    {submittingEdit ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Submitting…</> : "Submit Edit"}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* MY CONTRIBUTIONS */}
          <TabsContent value="my-contributions">
            <div className="rounded-lg border border-border bg-card p-6 max-w-2xl">
              <h2 className="font-display text-lg font-semibold text-card-foreground mb-4">My Contributions</h2>
              {loadingContributions ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : myContributions.length === 0 ? (
                <p className="text-muted-foreground text-sm">You haven't made any contributions yet.</p>
              ) : (
                <div className="space-y-2">
                  {myContributions.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{c.edit_type.replace(/_/g, " ")}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-card-foreground mt-1">
                          {c.target_table.replace(/_/g, " ")}
                          {c.proposed_data?.first_name ? `: ${c.proposed_data.first_name} ${c.proposed_data.last_name || ""}` : ""}
                          {c.proposed_data?.name ? `: ${c.proposed_data.name}` : ""}
                          {c.proposed_data?.event_name ? `: ${c.proposed_data.event_name}` : ""}
                        </p>
                        {c.admin_notes && <p className="text-xs text-muted-foreground mt-1">Admin: {c.admin_notes}</p>}
                      </div>
                      <div>
                        {c.status === "pending" && <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>}
                        {c.status === "approved" && <Badge className="gap-1 bg-primary text-primary-foreground"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>}
                        {c.status === "rejected" && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default ContributePage;
