import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn, pgQuote } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, Clock, CheckCircle2, XCircle, Loader2, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import CountrySelect from "@/components/CountrySelect";
import { checkFieldsForProfanity } from "@/lib/profanity-filter";
import { EmptyState, PageHeader, RowsSkeleton } from "@/components/tr/primitives";

const INPUT = "h-10 rounded bg-background focus-visible:ring-1 focus-visible:ring-offset-0";
const TEXTAREA = "rounded bg-background focus-visible:ring-1 focus-visible:ring-offset-0";
const PRIMARY_BTN =
  "h-10 rounded bg-signal px-5 font-display text-sm font-bold uppercase tracking-[0.14em] text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100";
const SECONDARY_BTN = "h-9 gap-1.5 rounded font-display text-xs font-semibold uppercase tracking-[0.1em]";

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
function AutocompleteInput({ id, value, onValueChange, placeholder, fetchFn, className }: {
  id?: string; value: string; onValueChange: (v: string) => void; placeholder?: string; fetchFn: (q: string) => Promise<string[]>; className?: string;
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
      <Input id={id} value={value} onChange={e => handleChange(e.target.value)} placeholder={placeholder} className={cn(INPUT, className)} />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded border bg-popover py-1">
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="block w-full truncate px-3 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent" onClick={() => { onValueChange(s); setOpen(false); }}>
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
    const { data } = await supabase.from("driver_profiles").select("first_name, last_name").or(`first_name.ilike.${pgQuote(lower)},last_name.ilike.${pgQuote(lower)}`).limit(8);
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
      supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category, bio, social_website, social_instagram, social_twitter, social_linkedin").or(`first_name.ilike.${pgQuote(lower)},last_name.ilike.${pgQuote(lower)}`).limit(10),
      supabase.from("team_profiles" as any).select("id, name, nationality, primary_category, bio, website").ilike("name", lower).limit(10) as any,
      supabase.from("race_events").select("id, event_name, series_name, season_year, category, location").or(`event_name.ilike.${pgQuote(lower)},series_name.ilike.${pgQuote(lower)}`).limit(10),
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
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const categoryOptions = RACING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>);
  const spinner = (label: string) => <><Loader2 className="animate-spin" /> {label}</>;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Contribute" description="Help build the motorsport database. Add results, drivers, or teams." canonical="/contribute" />
      <Header />

      <PageHeader
        kicker={<><span className="h-1.5 w-1.5 rounded-full bg-signal" /> Community</>}
        title="Contribute"
        meta={<span>Help build the motorsport database. Every contribution is reviewed by an admin before it goes live.</span>}
      />

      <main className="container py-6 md:py-8">
        <Tabs defaultValue="add-results">
          <div className="-mx-4 mb-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max justify-start gap-1 rounded-none bg-transparent p-0">
              {[
                ["add-results", "Add results"],
                ["add-driver", "Add driver"],
                ["add-team", "Add team"],
                ["edit-existing", "Edit existing"],
                ["my-contributions", "My contributions"],
              ].map(([v, label]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  onClick={v === "my-contributions" ? fetchContributions : undefined}
                  className="-mb-px rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ADD RACE RESULTS */}
          <TabsContent value="add-results" className="mt-0">
            <div className="rounded border bg-card">
              <FormSection n="01" title="Event">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field id="c-series" label="Series name" required>
                    <AutocompleteInput id="c-series" value={seriesName} onValueChange={setSeriesName} placeholder="e.g. IMSA WeatherTech" fetchFn={fetchSeriesSuggestions} />
                  </Field>
                  <Field id="c-event" label="Event name" required>
                    <Input id="c-event" className={INPUT} value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Rolex 24 at Daytona" />
                  </Field>
                  <Field id="c-location" label="Location">
                    <Input id="c-location" className={INPUT} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Daytona, FL" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-3 lg:grid-cols-3">
                    <Field id="c-year" label="Season year">
                      <Input id="c-year" className={cn(INPUT, "num")} type="number" value={seasonYear} onChange={e => setSeasonYear(e.target.value)} />
                    </Field>
                    <Field id="c-date" label="Event date">
                      <Input id="c-date" className={cn(INPUT, "num")} type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                    </Field>
                    <Field id="c-cat" label="Category" className="col-span-2 lg:col-span-1">
                      <Select value={eventCategory} onValueChange={setEventCategory}>
                        <SelectTrigger id="c-cat" className={INPUT}><SelectValue /></SelectTrigger>
                        <SelectContent>{categoryOptions}</SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection
                n="02"
                title="Entries"
                right={<span className="label-caps"><span className="num text-foreground">{entries.length}</span> {entries.length === 1 ? "entry" : "entries"}</span>}
              >
                {/* Column heads (wide screens only) */}
                <div className={cn(ENTRY_GRID, "hidden border-b pb-2 xl:grid")}>
                  {ENTRY_COLS.map(c => <div key={c} className="label-caps truncate">{c}</div>)}
                  <div />
                </div>
                <div className="space-y-3 xl:space-y-1.5">
                  {entries.map((entry, i) => {
                    const remove = () => setEntries(entries.filter((_, idx) => idx !== i));
                    const cell = (field: keyof EntryRow, label: string, placeholder: string, span = "") => (
                      <EntryCell label={label} className={span}>
                        <Input className={cn(ENTRY_INPUT, "num")} placeholder={placeholder} value={entry[field]} onChange={e => updateEntry(i, field, e.target.value)} aria-label={label} />
                      </EntryCell>
                    );
                    return (
                      <div key={entry.key} className="rounded border bg-background/40 p-3 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
                        <div className="mb-3 flex items-center justify-between xl:hidden">
                          <span className="label-caps">Entry <span className="num text-foreground">{String(i + 1).padStart(2, "0")}</span></span>
                          {entries.length > 1 && (
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-dnf" onClick={remove}>
                              <Trash2 className="!size-3.5" /> Remove
                            </Button>
                          )}
                        </div>
                        <div className={cn(ENTRY_GRID, "grid-cols-3 sm:grid-cols-6")}>
                          {cell("finishing_position", "Pos", "Pos")}
                          {cell("class_position", "Cls pos", "Cls")}
                          {cell("car_number", "Car #", "#")}
                          <EntryCell label="Team" className="col-span-3 sm:col-span-3 xl:col-span-1">
                            <AutocompleteInput value={entry.team_name} onValueChange={v => updateEntry(i, "team_name", v)} placeholder="Team" fetchFn={fetchTeamSuggestions} className={ENTRY_INPUT} />
                          </EntryCell>
                          <EntryCell label="Driver(s) *" className="col-span-3 sm:col-span-3 xl:col-span-1">
                            <AutocompleteInput value={entry.driver_names} onValueChange={v => updateEntry(i, "driver_names", v)} placeholder="Driver(s), comma-sep" fetchFn={fetchDriverSuggestions} className={ENTRY_INPUT} />
                          </EntryCell>
                          <EntryCell label="Car" className="col-span-3 sm:col-span-3 xl:col-span-1">
                            <Input className={ENTRY_INPUT} placeholder="e.g. Porsche 963" value={entry.car_model_name} onChange={e => updateEntry(i, "car_model_name", e.target.value)} aria-label="Car" />
                          </EntryCell>
                          {cell("laps_completed", "Laps", "Laps")}
                          {cell("gap_to_leader", "Gap", "Gap")}
                          {cell("gap_to_class_leader", "Cls gap", "Cls gap")}
                          {cell("pit_stops", "Pits", "Pits")}
                          <EntryCell label="Class">
                            <Input className={ENTRY_INPUT} placeholder="Class" value={entry.race_class} onChange={e => updateEntry(i, "race_class", e.target.value)} aria-label="Class" />
                          </EntryCell>
                          <EntryCell label="Status">
                            <Select value={entry.status} onValueChange={v => updateEntry(i, "status", v)}>
                              <SelectTrigger className={ENTRY_INPUT} aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </EntryCell>
                          <div className="hidden items-center justify-center xl:flex">
                            {entries.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-dnf" onClick={remove} aria-label={`Remove entry ${i + 1}`}>
                                <Trash2 className="!size-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" size="sm" onClick={() => setEntries([...entries, emptyEntry()])} className={SECONDARY_BTN}>
                  <Plus className="!size-3.5" /> Add entry
                </Button>
              </FormSection>

              <ActionBar>
                <Button onClick={handleSubmitResults} disabled={submittingResults || !seriesName.trim() || !eventName.trim()} className={PRIMARY_BTN}>
                  {submittingResults ? spinner("Submitting…") : "Submit results"}
                </Button>
              </ActionBar>
            </div>
          </TabsContent>

          {/* ADD DRIVER */}
          <TabsContent value="add-driver" className="mt-0">
            <div className="max-w-2xl rounded border bg-card">
              <FormSection n="01" title="Driver">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="d-first" label="First name" required><Input id="d-first" className={INPUT} value={driverFirst} onChange={e => setDriverFirst(e.target.value)} /></Field>
                  <Field id="d-last" label="Last name" required><Input id="d-last" className={INPUT} value={driverLast} onChange={e => setDriverLast(e.target.value)} /></Field>
                  <Field id="d-nat" label="Nationality"><CountrySelect value={driverNationality} onChange={setDriverNationality} /></Field>
                  <Field id="d-cat" label="Primary category">
                    <Select value={driverCategory} onValueChange={setDriverCategory}>
                      <SelectTrigger id="d-cat" className={INPUT}><SelectValue /></SelectTrigger>
                      <SelectContent>{categoryOptions}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field id="d-bio" label="Bio"><Textarea id="d-bio" className={TEXTAREA} value={driverBio} onChange={e => setDriverBio(e.target.value)} rows={3} /></Field>
              </FormSection>
              <FormSection n="02" title="Links">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="d-web" label="Website"><Input id="d-web" className={INPUT} placeholder="https://" value={driverSocialWebsite} onChange={e => setDriverSocialWebsite(e.target.value)} /></Field>
                  <Field id="d-ig" label="Instagram"><Input id="d-ig" className={INPUT} placeholder="Instagram URL" value={driverSocialInstagram} onChange={e => setDriverSocialInstagram(e.target.value)} /></Field>
                  <Field id="d-x" label="Twitter / X"><Input id="d-x" className={INPUT} placeholder="Twitter / X URL" value={driverSocialTwitter} onChange={e => setDriverSocialTwitter(e.target.value)} /></Field>
                  <Field id="d-li" label="LinkedIn"><Input id="d-li" className={INPUT} placeholder="LinkedIn URL" value={driverSocialLinkedin} onChange={e => setDriverSocialLinkedin(e.target.value)} /></Field>
                </div>
              </FormSection>
              <ActionBar>
                <Button onClick={handleSubmitDriver} disabled={submittingDriver || !driverFirst.trim() || !driverLast.trim()} className={PRIMARY_BTN}>
                  {submittingDriver ? spinner("Submitting…") : "Submit driver"}
                </Button>
              </ActionBar>
            </div>
          </TabsContent>

          {/* ADD TEAM */}
          <TabsContent value="add-team" className="mt-0">
            <div className="max-w-2xl rounded border bg-card">
              <FormSection n="01" title="Team">
                <Field id="t-name" label="Team name" required><Input id="t-name" className={INPUT} value={teamName} onChange={e => setTeamName(e.target.value)} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="t-nat" label="Nationality"><CountrySelect value={teamNationality} onChange={setTeamNationality} /></Field>
                  <Field id="t-cat" label="Primary category">
                    <Select value={teamCategory} onValueChange={setTeamCategory}>
                      <SelectTrigger id="t-cat" className={INPUT}><SelectValue /></SelectTrigger>
                      <SelectContent>{categoryOptions}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field id="t-bio" label="Bio"><Textarea id="t-bio" className={TEXTAREA} value={teamBio} onChange={e => setTeamBio(e.target.value)} rows={3} /></Field>
              </FormSection>
              <FormSection n="02" title="Links">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="t-web" label="Website" className="sm:col-span-2"><Input id="t-web" className={INPUT} value={teamWebsite} onChange={e => setTeamWebsite(e.target.value)} placeholder="https://" /></Field>
                  <Field id="t-ig" label="Instagram"><Input id="t-ig" className={INPUT} placeholder="Instagram URL" value={teamSocialInstagram} onChange={e => setTeamSocialInstagram(e.target.value)} /></Field>
                  <Field id="t-x" label="Twitter / X"><Input id="t-x" className={INPUT} placeholder="Twitter / X URL" value={teamSocialTwitter} onChange={e => setTeamSocialTwitter(e.target.value)} /></Field>
                </div>
              </FormSection>
              <ActionBar>
                <Button onClick={handleSubmitTeam} disabled={submittingTeam || !teamName.trim()} className={PRIMARY_BTN}>
                  {submittingTeam ? spinner("Submitting…") : "Submit team"}
                </Button>
              </ActionBar>
            </div>
          </TabsContent>

          {/* EDIT EXISTING */}
          <TabsContent value="edit-existing" className="mt-0">
            <div className="max-w-2xl rounded border bg-card">
              <FormSection n="01" title="Find a record">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search drivers, teams, or events…" value={editSearch} onChange={e => setEditSearch(e.target.value)} className={cn(INPUT, "pl-9")} onKeyDown={e => e.key === "Enter" && handleEditSearch()} aria-label="Search records" />
                  </div>
                  <Button onClick={handleEditSearch} disabled={editSearching} className={cn(SECONDARY_BTN, "h-10 px-4")} variant="outline">
                    {editSearching ? <Loader2 className="animate-spin" /> : "Search"}
                  </Button>
                </div>

                {!editingItem && editResults.length > 0 && (
                  <div className="divide-y overflow-hidden rounded border">
                    {editResults.map(item => (
                      <button key={`${item._type}-${item.id}`} onClick={() => startEditing(item)} className="flex w-full items-center gap-3 bg-background/40 px-3 py-2.5 text-left transition-colors hover:bg-accent">
                        <span className="label-caps w-12 shrink-0">{item._type}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item._label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </FormSection>

              {editingItem && (
                <>
                  <FormSection
                    n="02"
                    title={`Editing ${editingItem._type}`}
                    right={<Button variant="ghost" size="sm" className="h-7 px-2 font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground" onClick={() => { setEditingItem(null); setEditFields({}); }}>Cancel</Button>}
                  >
                    <p className="-mt-2 truncate text-sm text-muted-foreground">{editingItem._label}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {Object.entries(editFields).map(([key, value]) => {
                        const id = `e-${key}`;
                        const wide = key === "bio";
                        return (
                          <Field key={key} id={id} label={key.replace(/_/g, " ")} className={wide ? "sm:col-span-2" : undefined}>
                            {key === "primary_category" || key === "category" ? (
                              <Select value={value} onValueChange={v => setEditFields({ ...editFields, [key]: v })}>
                                <SelectTrigger id={id} className={INPUT}><SelectValue /></SelectTrigger>
                                <SelectContent>{categoryOptions}</SelectContent>
                              </Select>
                            ) : key === "nationality" ? (
                              <CountrySelect value={value} onChange={v => setEditFields({ ...editFields, [key]: v })} />
                            ) : key === "bio" ? (
                              <Textarea id={id} className={TEXTAREA} value={value} onChange={e => setEditFields({ ...editFields, [key]: e.target.value })} rows={3} />
                            ) : (
                              <Input id={id} className={INPUT} value={value} onChange={e => setEditFields({ ...editFields, [key]: e.target.value })} />
                            )}
                          </Field>
                        );
                      })}
                    </div>
                  </FormSection>
                  <ActionBar>
                    <Button onClick={handleSubmitEdit} disabled={submittingEdit} className={PRIMARY_BTN}>
                      {submittingEdit ? spinner("Submitting…") : "Submit edit"}
                    </Button>
                  </ActionBar>
                </>
              )}
            </div>
          </TabsContent>

          {/* MY CONTRIBUTIONS */}
          <TabsContent value="my-contributions" className="mt-0">
            <div className="max-w-3xl">
              {loadingContributions ? (
                <RowsSkeleton rows={4} />
              ) : myContributions.length === 0 ? (
                <EmptyState title="No contributions yet" icon={<Clock className="h-5 w-5" />}>
                  Results, drivers, teams and edits you submit will appear here with their review status.
                </EmptyState>
              ) : (
                <div className="divide-y overflow-hidden rounded border bg-card">
                  {myContributions.map(c => (
                    <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0">
                        <div className="label-caps flex flex-wrap items-center gap-x-2">
                          <span className="text-foreground">{c.edit_type.replace(/_/g, " ")}</span>
                          <span aria-hidden>/</span>
                          <span className="num normal-case tracking-normal">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground">
                          <span className="capitalize text-muted-foreground">{c.target_table.replace(/_/g, " ")}</span>
                          {c.proposed_data?.first_name ? `: ${c.proposed_data.first_name} ${c.proposed_data.last_name || ""}` : ""}
                          {c.proposed_data?.name ? `: ${c.proposed_data.name}` : ""}
                          {c.proposed_data?.event_name ? `: ${c.proposed_data.event_name}` : ""}
                        </p>
                        {c.admin_notes && (
                          <p className="mt-2 border-l-2 pl-2.5 text-xs text-muted-foreground">
                            <span className="label-caps mr-1">Admin</span>{c.admin_notes}
                          </p>
                        )}
                      </div>
                      <StatusChip status={c.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
};

/* ── Layout helpers ───────────────────────────────────────────── */
const ENTRY_COLS = ["Pos", "Cls pos", "Car #", "Team", "Driver(s) *", "Car", "Laps", "Gap", "Cls gap", "Pits", "Class", "Status"];
const ENTRY_GRID =
  "grid gap-2 xl:grid-cols-[52px_56px_60px_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_56px_80px_80px_52px_72px_110px_32px] xl:gap-1.5";
const ENTRY_INPUT = "h-9 rounded bg-background px-2.5 text-sm focus-visible:ring-1 focus-visible:ring-offset-0 xl:h-8 xl:px-2 xl:text-xs";

function EntryCell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label-caps mb-1 xl:hidden">{label}</div>
      {children}
    </div>
  );
}

function FormSection({ n, title, right, children }: { n: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b px-4 py-5 last-of-type:border-b-0 sm:px-6 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2.5">
          <span className="num text-xs text-primary">{n}</span>
          <span className="font-display text-lg font-bold uppercase tracking-wide text-foreground">{title}</span>
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, required, className, children }: { id: string; label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="label-caps block text-[11px] font-semibold leading-none">
        {label}
        {required && <span className="ml-0.5 text-dnf">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b border-t bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-xs text-muted-foreground">
        <span className="text-dnf">*</span> Required. Reviewed by an admin before publishing.
      </p>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: ReactNode; label: string }> = {
    approved: { cls: "border-pb/40 text-pb", icon: <CheckCircle2 className="h-3 w-3" />, label: "Approved" },
    rejected: { cls: "border-dnf/40 text-dnf", icon: <XCircle className="h-3 w-3" />, label: "Rejected" },
    pending: { cls: "border-border text-muted-foreground", icon: <Clock className="h-3 w-3" />, label: "Pending" },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 font-display text-[11px] font-bold uppercase tracking-wider", m.cls)}>
      {m.icon}
      {m.label}
    </span>
  );
}

export default ContributePage;
