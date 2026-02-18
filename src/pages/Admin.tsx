import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, Eye, Trash, Search, X, Check, Loader2, Sparkles, Clock, CheckCircle2, XCircle, Flag, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import CountrySelect from "@/components/CountrySelect";
import DriverPhotoUpload from "@/components/DriverPhotoUpload";
import { getFlagForCountry } from "@/lib/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  // All race events
  const [raceEvents, setRaceEvents] = useState<any[]>([]);

  // Reports
  const [reports, setReports] = useState<any[]>([]);

  // Event-based race results (new tables)
  const [eventName, setEventName] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear().toString());
  const [eventCategory, setEventCategory] = useState<string>("other");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DriverProfile[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  interface EventResultEntry {
    key: string;
    drivers: DriverProfile[];
    team_name: string;
    car_number: string;
    race_class: string;
    finishing_position: string;
    class_position: string;
    laps_completed: string;
    gap_to_leader: string;
    gap_to_class_leader: string;
    pit_stops: string;
    status: string;
    notes: string;
  }
  const [eventEntries, setEventEntries] = useState<EventResultEntry[]>([]);
  const [savingEvent, setSavingEvent] = useState(false);
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);

  // AI Import
  const [importText, setImportText] = useState("");
  const [importEventHint, setImportEventHint] = useState("");
  const [importSeriesHint, setImportSeriesHint] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Generate Race
  const [generateRaceName, setGenerateRaceName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<any>(null);

  // Enrich
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [bulkEnriching, setBulkEnriching] = useState(false);

  // Pending approval queue
  interface PendingEvent {
    id: string;
    event_name: string;
    series_name: string;
    season_year: number;
    location: string | null;
    category: string | null;
    pendingCount: number;
    entries: any[];
  }
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [approvingEntries, setApprovingEntries] = useState<Set<string>>(new Set());

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
    fetchPendingEvents();
    fetchRaceEvents();
    fetchReports();
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

  const fetchRaceEvents = async () => {
    const { data } = await supabase
      .from("race_events")
      .select("*, race_entries(id)")
      .order("created_at", { ascending: false });
    if (data) setRaceEvents(data);
  };

  const fetchReports = async () => {
    const { data } = await supabase
      .from("reports" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setReports(data as any[]);
  };

  const handleDeleteEvent = async (eventId: string) => {
    // Delete entries first (cascade), then event
    await supabase.from("race_entry_drivers").delete().in(
      "race_entry_id",
      (await supabase.from("race_entries").select("id").eq("race_event_id", eventId)).data?.map((e: any) => e.id) || []
    );
    await supabase.from("race_entries").delete().eq("race_event_id", eventId);
    const { error } = await supabase.from("race_events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error deleting event", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      fetchRaceEvents();
    }
  };

  const handleUpdateReport = async (reportId: string, status: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("reports" as any).update({
      status,
      reviewed_by: session?.user?.id || null,
      reviewed_at: new Date().toISOString(),
    } as any).eq("id", reportId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Report ${status}` });
      fetchReports();
    }
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

  // Driver search for event results
  const handleDriverSearch = async (query: string) => {
    setDriverSearch(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const terms = query.trim().split(/\s+/);
    let q = supabase.from("driver_profiles").select("*");
    if (terms.length >= 2) {
      q = q.or(`first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[terms.length - 1]}%`);
    } else {
      q = q.or(`first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[0]}%`);
    }
    const { data } = await q.limit(10);
    setSearchResults(data || []);
    setSearching(false);
    setSearchOpen(true);
  };

  const addEntryRow = () => {
    setEventEntries(prev => [...prev, {
      key: crypto.randomUUID(),
      drivers: [],
      team_name: "",
      car_number: "",
      race_class: "",
      finishing_position: "",
      class_position: "",
      laps_completed: "",
      gap_to_leader: "",
      gap_to_class_leader: "",
      pit_stops: "",
      status: "Finished",
      notes: "",
    }]);
  };

  const addDriverToEntry = (entryKey: string, driver: DriverProfile) => {
    setEventEntries(prev => prev.map(e => {
      if (e.key !== entryKey) return e;
      if (e.drivers.some(d => d.id === driver.id)) return e;
      return { ...e, drivers: [...e.drivers, driver] };
    }));
    setDriverSearch("");
    setSearchResults([]);
    setSearchOpen(false);
    setActiveEntryKey(null);
  };

  const removeDriverFromEntry = (entryKey: string, driverId: string) => {
    setEventEntries(prev => prev.map(e => {
      if (e.key !== entryKey) return e;
      return { ...e, drivers: e.drivers.filter(d => d.id !== driverId) };
    }));
  };

  const updateEventEntry = (key: string, field: string, value: string) => {
    setEventEntries(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  };

  const removeEventEntry = (key: string) => {
    setEventEntries(prev => prev.filter(e => e.key !== key));
  };

  const handleSaveEventResults = async () => {
    if (!seriesName.trim() || !eventName.trim()) {
      toast({ title: "Event and series name required", variant: "destructive" });
      return;
    }
    if (eventEntries.length === 0) {
      toast({ title: "Add at least one entry", variant: "destructive" });
      return;
    }
    setSavingEvent(true);

    // 1. Create race_event
    const { data: raceEvent, error: eventError } = await supabase
      .from("race_events")
      .insert({
        event_name: eventName.trim(),
        series_name: seriesName.trim(),
        season_year: parseInt(seasonYear) || new Date().getFullYear(),
        category: (eventCategory || "other") as any,
        location: eventLocation.trim() || null,
        event_date: eventDate || null,
        notes: eventNotes.trim() || null,
      })
      .select("id")
      .single();

    if (eventError || !raceEvent) {
      toast({ title: "Error creating event", description: eventError?.message, variant: "destructive" });
      setSavingEvent(false);
      return;
    }

    // 2. Create entries
    const { data: insertedEntries, error: entriesError } = await supabase
      .from("race_entries")
      .insert(eventEntries.map(e => ({
        race_event_id: raceEvent.id,
        team_name: e.team_name.trim() || null,
        car_number: e.car_number.trim() || null,
        race_class: e.race_class.trim() || null,
        finishing_position: e.finishing_position ? parseInt(e.finishing_position) : null,
        class_position: e.class_position ? parseInt(e.class_position) : null,
        laps_completed: e.laps_completed ? parseInt(e.laps_completed) : null,
        gap_to_leader: e.gap_to_leader.trim() || null,
        gap_to_class_leader: e.gap_to_class_leader.trim() || null,
        pit_stops: e.pit_stops ? parseInt(e.pit_stops) : null,
        status: e.status.trim() || null,
        notes: e.notes.trim() || null,
        verification_status: "verified" as const,
      })))
      .select("id");

    if (entriesError || !insertedEntries) {
      toast({ title: "Event created but entries failed", description: entriesError?.message, variant: "destructive" });
      setSavingEvent(false);
      return;
    }

    // 3. Create driver junctions
    const junctions: { race_entry_id: string; driver_profile_id: string }[] = [];
    eventEntries.forEach((e, i) => {
      const entryId = insertedEntries[i]?.id;
      if (!entryId) return;
      e.drivers.forEach(d => {
        junctions.push({ race_entry_id: entryId, driver_profile_id: d.id });
      });
    });

    if (junctions.length > 0) {
      const { error: juncError } = await supabase.from("race_entry_drivers").insert(junctions);
      if (juncError) {
        toast({ title: "Entries saved but driver links failed", description: juncError.message, variant: "destructive" });
      }
    }

    setSavingEvent(false);
    toast({ title: "Event & results saved", description: `${eventEntries.length} entries added.` });
    setEventEntries([]);
    setEventName("");
    setSeriesName("");
    setSeasonYear(new Date().getFullYear().toString());
    setEventCategory("other");
    setEventLocation("");
    setEventDate("");
    setEventNotes("");
  };

  // ── AI Import & Approval Queue ──

  const fetchPendingEvents = async () => {
    // Get events that have at least one pending entry
    const { data: entries } = await supabase
      .from("race_entries")
      .select("*, race_events(*), race_entry_drivers(*, driver_profiles(*))")
      .eq("verification_status", "pending");

    if (!entries || entries.length === 0) {
      setPendingEvents([]);
      return;
    }

    // Group by event
    const eventMap = new Map<string, PendingEvent>();
    for (const entry of entries) {
      const evt = (entry as any).race_events;
      if (!evt) continue;
      if (!eventMap.has(evt.id)) {
        eventMap.set(evt.id, {
          id: evt.id,
          event_name: evt.event_name,
          series_name: evt.series_name,
          season_year: evt.season_year,
          location: evt.location,
          category: evt.category,
          pendingCount: 0,
          entries: [],
        });
      }
      const pe = eventMap.get(evt.id)!;
      pe.pendingCount++;
      pe.entries.push(entry);
    }
    setPendingEvents(Array.from(eventMap.values()));
  };

  const handleImportResults = async () => {
    if (!importText.trim()) {
      toast({ title: "Paste race results text first", variant: "destructive" });
      return;
    }
    setImporting(true);
    setImportResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-race-results`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            rawText: importText,
            eventHint: importEventHint || undefined,
            seriesHint: importSeriesHint || undefined,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Import failed", description: result.error || "Unknown error", variant: "destructive" });
        setImporting(false);
        return;
      }

      setImportResult(result);
      toast({ title: "Results imported!", description: `${result.entriesCount} entries added as pending. ${result.matchedDrivers} drivers matched.` });
      setImportText("");
      setImportEventHint("");
      setImportSeriesHint("");
      fetchPendingEvents();
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    }
    setImporting(false);
  };

  const handleGenerateRace = async () => {
    if (!generateRaceName.trim()) {
      toast({ title: "Enter a race name", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setGenerateResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-race-event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ eventName: generateRaceName }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Generation failed", description: result.error || "Unknown error", variant: "destructive" });
        setGenerating(false);
        return;
      }

      setGenerateResult(result);
      toast({ title: "Race generated!", description: `${result.entriesCount} entries created as pending.` });
      setGenerateRaceName("");
      fetchPendingEvents();
      fetchRaceEvents();
      fetchDrivers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleEnrichDriver = async (driverId: string) => {
    setEnrichingIds(prev => new Set(prev).add(driverId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-driver-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverProfileId: driverId }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      } else {
        const r = result.results?.[0];
        const fields = r?.fieldsUpdated?.length || 0;
        toast({ title: fields > 0 ? `Enriched ${r.name}` : `No new data for ${r.name}`, description: fields > 0 ? `Updated: ${r.fieldsUpdated.join(", ")}` : "All fields already populated." });
        fetchDrivers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setEnrichingIds(prev => { const n = new Set(prev); n.delete(driverId); return n; });
  };

  const handleBulkEnrich = async () => {
    const needsEnrich = drivers.filter(d => !d.nationality || !d.bio);
    if (needsEnrich.length === 0) {
      toast({ title: "All drivers already enriched" });
      return;
    }
    setBulkEnriching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-driver-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverProfileIds: needsEnrich.map(d => d.id) }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Bulk enrichment failed", description: result.error, variant: "destructive" });
      } else {
        const updated = result.results?.filter((r: any) => r.fieldsUpdated?.length > 0).length || 0;
        toast({ title: "Bulk enrichment complete", description: `${updated} of ${needsEnrich.length} drivers updated.` });
        fetchDrivers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBulkEnriching(false);
  };

  const handleApproveEvent = async (eventId: string) => {
    setApprovingEntries(prev => new Set(prev).add(eventId));
    const { error } = await supabase
      .from("race_entries")
      .update({ verification_status: "verified" as const })
      .eq("race_event_id", eventId)
      .eq("verification_status", "pending");

    if (error) {
      toast({ title: "Error approving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "All entries approved and published!" });
      fetchPendingEvents();
    }
    setApprovingEntries(prev => { const n = new Set(prev); n.delete(eventId); return n; });
  };

  const handleRejectEvent = async (eventId: string) => {
    setApprovingEntries(prev => new Set(prev).add(eventId));
    const { error } = await supabase
      .from("race_entries")
      .update({ verification_status: "rejected" as const })
      .eq("race_event_id", eventId)
      .eq("verification_status", "pending");

    if (error) {
      toast({ title: "Error rejecting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entries rejected" });
      fetchPendingEvents();
    }
    setApprovingEntries(prev => { const n = new Set(prev); n.delete(eventId); return n; });
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
            <TabsTrigger value="race-results">Race Results</TabsTrigger>
            <TabsTrigger value="ai-import">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Import
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending {pendingEvents.length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{pendingEvents.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="all-races">All Races ({raceEvents.length})</TabsTrigger>
            <TabsTrigger value="reports">
              <Flag className="h-3.5 w-3.5 mr-1" /> Reports {reports.filter((r: any) => r.status === "pending").length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{reports.filter((r: any) => r.status === "pending").length}</span>}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold text-foreground">All Drivers</h2>
              <Button variant="outline" size="sm" onClick={handleBulkEnrich} disabled={bulkEnriching}>
                {bulkEnriching ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Enriching…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Bulk Enrich Missing</>}
              </Button>
            </div>
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
                            <Button variant="ghost" size="sm" onClick={() => handleEnrichDriver(d.id)} disabled={enrichingIds.has(d.id)} title="Enrich with AI">
                              {enrichingIds.has(d.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </Button>
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

          {/* ── Race Results ── */}
          <TabsContent value="race-results">
            <div className="max-w-4xl rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold text-card-foreground mb-4">Enter Event Results</h2>
              <p className="text-sm text-muted-foreground mb-6">Create a race event with entries. Each entry can have multiple drivers (e.g. endurance co-drivers). Results are auto-verified.</p>

              {/* Event details */}
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-card-foreground">Event Name *</Label>
                    <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Rolex 24 at Daytona" />
                  </div>
                  <div>
                    <Label className="text-card-foreground">Series Name *</Label>
                    <Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. IMSA WeatherTech" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-card-foreground">Season Year</Label>
                    <Input value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} type="number" />
                  </div>
                  <div>
                    <Label className="text-card-foreground">Category</Label>
                    <Select value={eventCategory} onValueChange={setEventCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RACING_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-card-foreground">Event Date</Label>
                    <Input value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-card-foreground">Location</Label>
                    <Input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="e.g. Daytona International Speedway" />
                  </div>
                  <div>
                    <Label className="text-card-foreground">Event Notes</Label>
                    <Input value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Entries */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-card-foreground font-semibold">Race Entries</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addEntryRow}>
                    <Plus className="h-4 w-4 mr-1" /> Add Entry
                  </Button>
                </div>

                {eventEntries.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">Click "Add Entry" to add cars/teams to this event.</p>
                )}

                <div className="space-y-4">
                  {eventEntries.map((entry, i) => (
                    <div key={entry.key} className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-card-foreground">Entry #{i + 1}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeEventEntry(entry.key)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Car #</Label>
                          <Input value={entry.car_number} onChange={(e) => updateEventEntry(entry.key, "car_number", e.target.value)} placeholder="e.g. 31" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Team Name</Label>
                          <Input value={entry.team_name} onChange={(e) => updateEventEntry(entry.key, "team_name", e.target.value)} placeholder="e.g. Action Express" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Class</Label>
                          <Input value={entry.race_class} onChange={(e) => updateEventEntry(entry.key, "race_class", e.target.value)} placeholder="e.g. GTP, LMP2" />
                        </div>
                      </div>

                      {/* Driver search for this entry */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Drivers</Label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {entry.drivers.map(d => {
                            const flag = getFlagForCountry(d.nationality);
                            return (
                              <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1">
                                {flag && <span>{flag}</span>}
                                {d.first_name} {d.last_name}
                                <button type="button" onClick={() => removeDriverFromEntry(entry.key, d.id)} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
                              </span>
                            );
                          })}
                        </div>
                        <Popover open={activeEntryKey === entry.key && searchOpen && searchResults.length > 0} onOpenChange={(open) => { setSearchOpen(open); if (!open) setActiveEntryKey(null); }}>
                          <PopoverTrigger asChild>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={activeEntryKey === entry.key ? driverSearch : ""}
                                onFocus={() => setActiveEntryKey(entry.key)}
                                onChange={(e) => { setActiveEntryKey(entry.key); handleDriverSearch(e.target.value); }}
                                placeholder="Search driver…"
                                className="pl-9 h-8 text-xs"
                              />
                              {searching && activeEntryKey === entry.key && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground animate-spin" />}
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <div className="max-h-[200px] overflow-y-auto p-1">
                              {searchResults.map((d) => {
                                const flag = getFlagForCountry(d.nationality);
                                const alreadyAdded = entry.drivers.some(ed => ed.id === d.id);
                                return (
                                  <button
                                    key={d.id}
                                    disabled={alreadyAdded}
                                    onClick={() => addDriverToEntry(entry.key, d)}
                                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {d.photo_url ? (
                                      <img src={d.photo_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{d.first_name[0]}{d.last_name[0]}</div>
                                    )}
                                    <span className="font-medium text-popover-foreground text-xs">{d.first_name} {d.last_name}</span>
                                    {flag && <span className="text-sm">{flag}</span>}
                                    {alreadyAdded && <Check className="h-3 w-3 text-primary" />}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Finish Pos</Label>
                          <Input value={entry.finishing_position} onChange={(e) => updateEventEntry(entry.key, "finishing_position", e.target.value)} type="number" placeholder="1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Class Pos</Label>
                          <Input value={entry.class_position} onChange={(e) => updateEventEntry(entry.key, "class_position", e.target.value)} type="number" placeholder="1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Laps</Label>
                          <Input value={entry.laps_completed} onChange={(e) => updateEventEntry(entry.key, "laps_completed", e.target.value)} type="number" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Pit Stops</Label>
                          <Input value={entry.pit_stops} onChange={(e) => updateEventEntry(entry.key, "pit_stops", e.target.value)} type="number" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Gap to Leader</Label>
                          <Input value={entry.gap_to_leader} onChange={(e) => updateEventEntry(entry.key, "gap_to_leader", e.target.value)} placeholder="e.g. +1 Lap" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Gap to Class Leader</Label>
                          <Input value={entry.gap_to_class_leader} onChange={(e) => updateEventEntry(entry.key, "gap_to_class_leader", e.target.value)} placeholder="e.g. +32.4s" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select value={entry.status} onValueChange={(v) => updateEventEntry(entry.key, "status", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Finished">Finished</SelectItem>
                              <SelectItem value="DNF">DNF</SelectItem>
                              <SelectItem value="DNS">DNS</SelectItem>
                              <SelectItem value="DSQ">DSQ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <Input value={entry.notes} onChange={(e) => updateEventEntry(entry.key, "notes", e.target.value)} placeholder="Optional" />
                      </div>
                    </div>
                  ))}
                </div>

                {eventEntries.length > 0 && (
                  <Button onClick={handleSaveEventResults} disabled={savingEvent} className="w-full mt-4">
                    {savingEvent ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : `Save Event with ${eventEntries.length} Entry(ies)`}
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── AI Import ── */}
          <TabsContent value="ai-import">
            <div className="max-w-3xl space-y-6">
              {/* Generate Race from Name */}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold text-card-foreground">Generate Race from Name</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Just type a race name and the AI will research and generate the full results with all entries, drivers, teams, and classes.</p>
                <div className="flex gap-3">
                  <Input
                    value={generateRaceName}
                    onChange={(e) => setGenerateRaceName(e.target.value)}
                    placeholder='e.g. "2025 Rolex 24 at Daytona" or "2024 Monaco Grand Prix"'
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerateRace()}
                  />
                  <Button onClick={handleGenerateRace} disabled={generating || !generateRaceName.trim()}>
                    {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate</>}
                  </Button>
                </div>
                {generateResult && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                    <h3 className="font-semibold text-card-foreground mb-2">Generation Summary</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Event:</div>
                      <div className="text-card-foreground">{generateResult.eventName}</div>
                      <div className="text-muted-foreground">Series:</div>
                      <div className="text-card-foreground">{generateResult.seriesName}</div>
                      <div className="text-muted-foreground">Entries:</div>
                      <div className="text-card-foreground">{generateResult.entriesCount}</div>
                      <div className="text-muted-foreground">Drivers matched:</div>
                      <div className="text-card-foreground">{generateResult.matchedDrivers}</div>
                      <div className="text-muted-foreground">Drivers created:</div>
                      <div className="text-card-foreground">{generateResult.createdDrivers}</div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">Results are pending. Review and approve them in the "Pending" tab.</p>
                  </div>
                )}
              </div>

              {/* Advanced: Raw Text Import */}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-display text-xl font-bold text-card-foreground">Advanced: Raw Text Import</h2>
                </div>
              <p className="text-sm text-muted-foreground mb-6">Paste raw race results from a timing page, PDF, or any source. The AI will extract structured data and create pending entries for your review.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-card-foreground">Event Name Hint (optional)</Label>
                    <Input value={importEventHint} onChange={(e) => setImportEventHint(e.target.value)} placeholder="e.g. Monaco Grand Prix" />
                  </div>
                  <div>
                    <Label className="text-card-foreground">Series Hint (optional)</Label>
                    <Input value={importSeriesHint} onChange={(e) => setImportSeriesHint(e.target.value)} placeholder="e.g. Formula 1" />
                  </div>
                </div>
                <div>
                  <Label className="text-card-foreground">Raw Results Text *</Label>
                  <Textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste race results here…&#10;&#10;Example:&#10;1. Max Verstappen - Red Bull Racing - 58 laps&#10;2. Lewis Hamilton - Mercedes - +5.023s&#10;..."
                    className="min-h-[200px] font-mono text-xs"
                  />
                </div>
                <Button onClick={handleImportResults} disabled={importing || !importText.trim()} className="w-full">
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing with AI…</> : <><Sparkles className="h-4 w-4 mr-2" /> Process with AI</>}
                </Button>
              </div>

              {importResult && (
                <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="font-semibold text-card-foreground mb-2">Import Summary</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Event:</div>
                    <div className="text-card-foreground">{importResult.eventName}</div>
                    <div className="text-muted-foreground">Entries created:</div>
                    <div className="text-card-foreground">{importResult.entriesCount}</div>
                    <div className="text-muted-foreground">Drivers matched:</div>
                    <div className="text-card-foreground">{importResult.matchedDrivers}</div>
                    <div className="text-muted-foreground">Drivers unmatched:</div>
                    <div className="text-card-foreground">{importResult.unmatchedDrivers}</div>
                  </div>
                  {importResult.unmatchedNames?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Unmatched driver names (stored in entry notes):</p>
                      <div className="flex flex-wrap gap-1">
                        {importResult.unmatchedNames.map((n: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{n}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">Results are pending. Review and approve them in the "Pending" tab.</p>
                </div>
              )}
              </div>
            </div>
          </TabsContent>

          {/* ── Pending Approval ── */}
          <TabsContent value="pending">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Pending Approval</h2>
                  <p className="text-sm text-muted-foreground">Review AI-imported results before they go live.</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchPendingEvents}>
                  <Loader2 className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              {pendingEvents.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No pending results to review.</p>
                </div>
              )}

              {pendingEvents.map((pe) => (
                <div key={pe.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-card-foreground">{pe.event_name}</h3>
                      <p className="text-sm text-muted-foreground">{pe.series_name} · {pe.season_year}{pe.location ? ` · ${pe.location}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{pe.pendingCount} pending</Badge>
                      <Button
                        size="sm"
                        onClick={() => handleApproveEvent(pe.id)}
                        disabled={approvingEntries.has(pe.id)}
                        className="gap-1"
                      >
                        {approvingEntries.has(pe.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Approve All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectEvent(pe.id)}
                        disabled={approvingEntries.has(pe.id)}
                        className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        <XCircle className="h-3 w-3" /> Reject All
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pos</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Car #</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Team</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Driver(s)</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Class</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Gap</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pe.entries
                          .sort((a: any, b: any) => (a.finishing_position || 999) - (b.finishing_position || 999))
                          .map((entry: any) => (
                          <tr key={entry.id} className="border-b border-border/50">
                            <td className="px-3 py-2 text-card-foreground font-medium">{entry.finishing_position ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.car_number ?? "—"}</td>
                            <td className="px-3 py-2 text-card-foreground">{entry.team_name ?? "—"}</td>
                            <td className="px-3 py-2 text-card-foreground">
                              {entry.race_entry_drivers?.length > 0
                                ? entry.race_entry_drivers.map((red: any) =>
                                    red.driver_profiles ? `${red.driver_profiles.first_name} ${red.driver_profiles.last_name}` : "?"
                                  ).join(", ")
                                : <span className="text-muted-foreground italic">No matched drivers</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.race_class ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.gap_to_leader ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.status ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{entry.notes ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── All Races ── */}
          <TabsContent value="all-races">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Event</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Series</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Year</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Location</th>
                    <th className="px-4 py-3 text-center font-semibold text-card-foreground">Entries</th>
                    <th className="px-4 py-3 text-right font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {raceEvents.map((ev: any) => (
                    <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 text-card-foreground font-medium">{ev.event_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ev.series_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ev.season_year}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{ev.category?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ev.location ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{ev.race_entries?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/event/${ev.id}`)}><Eye className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm"><Trash className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {ev.event_name}?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete this race event and all its entries. This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteEvent(ev.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {raceEvents.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No race events yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Reports ── */}
          <TabsContent value="reports">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Target ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Message</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs capitalize">{r.report_type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate(r.report_type === "driver" ? `/driver/${r.target_id}` : `/event/${r.target_id}`)}>
                          View {r.report_type}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[300px]">{r.message}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "reviewed" ? "bg-green-500/20 text-green-400" :
                          r.status === "dismissed" ? "bg-muted text-muted-foreground" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {r.status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="text-green-400 border-green-400/30 hover:bg-green-500/10" onClick={() => handleUpdateReport(r.id, "reviewed")}>Reviewed</Button>
                            <Button size="sm" variant="outline" className="text-muted-foreground border-border hover:bg-muted" onClick={() => handleUpdateReport(r.id, "dismissed")}>Dismiss</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {reports.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No reports yet.</td></tr>}
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
