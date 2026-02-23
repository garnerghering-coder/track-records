import { useState, useEffect, useRef } from "react";
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
import SEOHead from "@/components/SEOHead";
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

const STATUS_OPTIONS = ["Finished", "DNF", "DNS", "DSQ", "DQ", "Running"];

interface EntryRow {
  key: string;
  finishing_position: string;
  class_position: string;
  car_number: string;
  team_name: string;
  driver_names: string;
  car_model_name: string;
  laps_completed: string;
  gap_to_leader: string;
  gap_to_class_leader: string;
  pit_stops: string;
  race_class: string;
  status: string;
}

const emptyEntry = (): EntryRow => ({
  key: crypto.randomUUID(),
  finishing_position: "",
  class_position: "",
  car_number: "",
  team_name: "",
  driver_names: "",
  car_model_name: "",
  laps_completed: "",
  gap_to_leader: "",
  gap_to_class_leader: "",
  pit_stops: "",
  race_class: "",
  status: "",
});

// Autocomplete hook
function useAutocomplete(fetchFn: (q: string) => Promise<string[]>) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  const onChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      const results = await fetchFn(val.trim());
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 250);
  };

  const select = (val: string) => {
    setQuery(val);
    setOpen(false);
  };

  const close = () => setOpen(false);

  return { query, setQuery, suggestions, open, onChange, select, close };
}

// Autocomplete input component
function AutocompleteInput({ value, onValueChange, placeholder, fetchFn, className }: {
  value: string; onValueChange: (v: string) => void; placeholder?: string; fetchFn: (q: string) => Promise<string[]>; className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = (val: string) => {
    onValueChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      const results = await fetchFn(val.trim());
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 250);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input value={value} onChange={e => handleChange(e.target.value)} placeholder={placeholder} className={className} />
      {open && suggestions.length > 0 && (
        <div className="absolute z-[9999] top-full left-0 min-w-[220px] mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-lg" style={{ position: "absolute" }}>
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors text-popover-foreground" onClick={() => { onValueChange(s); setOpen(false); }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [driverSocialWebsite, setDriverSocialWebsite] = useState("");
  const [driverSocialInstagram, setDriverSocialInstagram] = useState("");
  const [driverSocialTwitter, setDriverSocialTwitter] = useState("");
  const [driverSocialLinkedin, setDriverSocialLinkedin] = useState("");
  const [submittingDriver, setSubmittingDriver] = useState(false);

  // Add Team
  const [teamName, setTeamName] = useState("");
  const [teamNationality, setTeamNationality] = useState("");
  const [teamCategory, setTeamCategory] = useState("other");
  const [teamWebsite, setTeamWebsite] = useState("");
  const [teamBio, setTeamBio] = useState("");
  const [teamSocialInstagram, setTeamSocialInstagram] = useState("");
  const [teamSocialTwitter, setTeamSocialTwitter] = useState("");
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

  // Autocomplete fetchers
  const fetchDriverSuggestions = async (q: string): Promise<string[]> => {
    const lower = `%${q}%`;
    const { data } = await supabase.from("driver_profiles").select("first_name, last_name").or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(8);
    return (data || []).map((d: any) => `${d.first_name} ${d.last_name}`);
  };

  const fetchTeamSuggestions = async (q: string): Promise<string[]> => {
    const { data } = await supabase.from("team_profiles" as any).select("name").ilike("name", `%${q}%`).limit(8) as any;
    return ((data || []) as any[]).map((t: any) => t.name);
  };

  const fetchSeriesSuggestions = async (q: string): Promise<string[]> => {
    const { data } = await supabase.from("race_events").select("series_name").ilike("series_name", `%${q}%`).limit(20);
    if (!data) return [];
    const unique = [...new Set(data.map((e: any) => e.series_name))];
    return unique.slice(0, 8);
  };

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

  const updateEntry = (index: number, field: keyof EntryRow, value: string) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
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
          class_position: e.class_position ? parseInt(e.class_position) : null,
          car_number: e.car_number || null,
          team_name: e.team_name || null,
          driver_names: e.driver_names.split(",").map(n => n.trim()).filter(Boolean),
          car_model_name: e.car_model_name || null,
          laps_completed: e.laps_completed ? parseInt(e.laps_completed) : null,
          gap_to_leader: e.gap_to_leader || null,
          gap_to_class_leader: e.gap_to_class_leader || null,
          pit_stops: e.pit_stops ? parseInt(e.pit_stops) : null,
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
        social_website: driverSocialWebsite || null,
        social_instagram: driverSocialInstagram || null,
        social_twitter: driverSocialTwitter || null,
        social_linkedin: driverSocialLinkedin || null,
      },
    });
    setSubmittingDriver(false);
    toast({ title: "Driver submitted", description: "Pending admin review." });
    setDriverFirst(""); setDriverLast(""); setDriverNationality(""); setDriverBio("");
    setDriverSocialWebsite(""); setDriverSocialInstagram(""); setDriverSocialTwitter(""); setDriverSocialLinkedin("");
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
        social_instagram: teamSocialInstagram || null,
        social_twitter: teamSocialTwitter || null,
      },
    });
    setSubmittingTeam(false);
    toast({ title: "Team submitted", description: "Pending admin review." });
    setTeamName(""); setTeamNationality(""); setTeamBio(""); setTeamWebsite("");
    setTeamSocialInstagram(""); setTeamSocialTwitter("");
  };

  // Search for editing
  const handleEditSearch = async () => {
    if (!editSearch.trim()) return;
    setEditSearching(true);
    const lower = `%${editSearch}%`;

    const [drivers, teams, events] = await Promise.all([
      supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category, bio, social_website, social_instagram, social_twitter, social_linkedin").or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(10),
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
      fields.social_website = item.social_website || "";
      fields.social_instagram = item.social_instagram || "";
      fields.social_twitter = item.social_twitter || "";
      fields.social_linkedin = item.social_linkedin || "";
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
      <SEOHead title="Contribute" description="Help build the motorsport database. Add results, drivers, or teams." canonical="/contribute" />
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
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Add Race Results</h2>
              <div className="grid grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <Label className="text-card-foreground text-xs">Series Name *</Label>
                  <AutocompleteInput value={seriesName} onValueChange={setSeriesName} placeholder="e.g. IMSA WeatherTech" fetchFn={fetchSeriesSuggestions} />
                </div>
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
                <div className="overflow-x-auto" style={{ overflow: "visible" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left py-1 px-1 font-medium w-14">Pos</th>
                        <th className="text-left py-1 px-1 font-medium w-14">Cls Pos</th>
                        <th className="text-left py-1 px-1 font-medium w-16">Car #</th>
                        <th className="text-left py-1 px-1 font-medium w-40">Team</th>
                        <th className="text-left py-1 px-1 font-medium min-w-[200px]">Driver(s) *</th>
                        <th className="text-left py-1 px-1 font-medium w-36">Car</th>
                        <th className="text-left py-1 px-1 font-medium w-16">Laps</th>
                        <th className="text-left py-1 px-1 font-medium w-20">Gap</th>
                        <th className="text-left py-1 px-1 font-medium w-20">Cls Gap</th>
                        <th className="text-left py-1 px-1 font-medium w-14">Pits</th>
                        <th className="text-left py-1 px-1 font-medium w-20">Class</th>
                        <th className="text-left py-1 px-1 font-medium w-28">Status</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, i) => (
                        <tr key={entry.key} className="border-b border-border/50">
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Pos" value={entry.finishing_position} onChange={e => updateEntry(i, "finishing_position", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Cls" value={entry.class_position} onChange={e => updateEntry(i, "class_position", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="#" value={entry.car_number} onChange={e => updateEntry(i, "car_number", e.target.value)} /></td>
                          <td className="py-1 px-1">
                            <AutocompleteInput value={entry.team_name} onValueChange={v => updateEntry(i, "team_name", v)} placeholder="Team" fetchFn={fetchTeamSuggestions} className="h-8 text-xs" />
                          </td>
                          <td className="py-1 px-1">
                            <AutocompleteInput value={entry.driver_names} onValueChange={v => updateEntry(i, "driver_names", v)} placeholder="Driver(s), comma-sep" fetchFn={fetchDriverSuggestions} className="h-8 text-xs" />
                          </td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="e.g. Porsche 963" value={entry.car_model_name} onChange={e => updateEntry(i, "car_model_name", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Laps" value={entry.laps_completed} onChange={e => updateEntry(i, "laps_completed", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Gap" value={entry.gap_to_leader} onChange={e => updateEntry(i, "gap_to_leader", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Cls Gap" value={entry.gap_to_class_leader} onChange={e => updateEntry(i, "gap_to_class_leader", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Pits" value={entry.pit_stops} onChange={e => updateEntry(i, "pit_stops", e.target.value)} /></td>
                          <td className="py-1 px-1"><Input className="h-8 text-xs" placeholder="Class" value={entry.race_class} onChange={e => updateEntry(i, "race_class", e.target.value)} /></td>
                          <td className="py-1 px-1">
                            <Select value={entry.status} onValueChange={v => updateEntry(i, "status", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 px-1">
                            {entries.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <div className="space-y-2">
                <Label className="text-card-foreground text-xs">Social Links</Label>
                <Input placeholder="Website URL" value={driverSocialWebsite} onChange={e => setDriverSocialWebsite(e.target.value)} />
                <Input placeholder="Instagram URL" value={driverSocialInstagram} onChange={e => setDriverSocialInstagram(e.target.value)} />
                <Input placeholder="Twitter / X URL" value={driverSocialTwitter} onChange={e => setDriverSocialTwitter(e.target.value)} />
                <Input placeholder="LinkedIn URL" value={driverSocialLinkedin} onChange={e => setDriverSocialLinkedin(e.target.value)} />
              </div>
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
              <div className="space-y-2">
                <Label className="text-card-foreground text-xs">Social Links</Label>
                <Input placeholder="Instagram URL" value={teamSocialInstagram} onChange={e => setTeamSocialInstagram(e.target.value)} />
                <Input placeholder="Twitter / X URL" value={teamSocialTwitter} onChange={e => setTeamSocialTwitter(e.target.value)} />
              </div>
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
