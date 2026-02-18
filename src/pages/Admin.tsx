import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Plus, Trash2, Pencil, Eye, Trash, Search, X, Check, Loader2, Sparkles, Clock, CheckCircle2, XCircle, Flag, MapPin, Globe, Link, ChevronDown, ChevronUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import CountrySelect from "@/components/CountrySelect";

import FlagImage from "@/components/FlagImage";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("create-driver");

  // Create driver form
  const [driverFirst, setDriverFirst] = useState("");
  const [driverLast, setDriverLast] = useState("");
  const [driverNationality, setDriverNationality] = useState("");
  const [driverCategory, setDriverCategory] = useState<string>("other");
  const [driverBio, setDriverBio] = useState("");
  
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [raceResults, setRaceResults] = useState<RaceResultRow[]>([]);

  // Edit driver
  const [editingDriver, setEditingDriver] = useState<DriverProfile | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editNationality, setEditNationality] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editBio, setEditBio] = useState("");
  
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

  // AI Import
  const [importText, setImportText] = useState("");
  const [importEventHint, setImportEventHint] = useState("");
  const [importSeriesHint, setImportSeriesHint] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importPdfFile, setImportPdfFile] = useState<File | null>(null);

  // Generate Race
  const [generateRaceName, setGenerateRaceName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<any>(null);

  // Import from URL
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [importUrlResult, setImportUrlResult] = useState<any>(null);

  // Enrich
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  
  const [bulkEnriching, setBulkEnriching] = useState(false);

  // Bulk selection
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

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

  // Inline editing for entries (shared between pending and all-races)
  const [editingCell, setEditingCell] = useState<{ entryId: string; field: string } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventFields, setEditingEventFields] = useState<{ event_name: string; series_name: string; season_year: string; location: string; category: string }>({ event_name: "", series_name: "", season_year: "", location: "", category: "" });

  // Expanded event editing in All Races tab
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<any[]>([]);
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  const startEditCell = (entryId: string, field: string, currentValue: string | number | null) => {
    setEditingCell({ entryId, field });
    setEditingCellValue(currentValue?.toString() ?? "");
  };

  const handleUpdateEntry = async () => {
    if (!editingCell) return;
    const { entryId, field } = editingCell;
    let value: any = editingCellValue.trim() || null;
    if (field === "finishing_position" || field === "class_position" || field === "laps_completed" || field === "pit_stops") {
      value = value ? parseInt(value) : null;
    }
    const { error } = await supabase.from("race_entries").update({ [field]: value }).eq("id", entryId);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entry updated" });
      fetchPendingEvents();
      // Also refresh expanded entries if viewing All Races
      if (expandedEventId) fetchExpandedEntries(expandedEventId);
    }
    setEditingCell(null);
  };

  const startEditEvent = (ev: { id: string; event_name: string; series_name: string; season_year: number; location: string | null; category: string | null }) => {
    setEditingEventId(ev.id);
    setEditingEventFields({ event_name: ev.event_name, series_name: ev.series_name, season_year: ev.season_year.toString(), location: ev.location || "", category: ev.category || "other" });
  };

  const handleUpdateEvent = async () => {
    if (!editingEventId) return;
    const { error } = await supabase.from("race_events").update({
      event_name: editingEventFields.event_name,
      series_name: editingEventFields.series_name,
      season_year: parseInt(editingEventFields.season_year) || new Date().getFullYear(),
      location: editingEventFields.location || null,
      category: (editingEventFields.category || "other") as any,
    }).eq("id", editingEventId);
    if (error) {
      toast({ title: "Error saving event", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event updated" });
      fetchPendingEvents();
      fetchRaceEvents();
    }
    setEditingEventId(null);
  };

  useEffect(() => { checkAdmin(); }, []);

  // Handle ?edit=eventId URL param
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && isAdmin) {
      setActiveTab("all-races");
      toggleExpandEvent(editId);
    }
  }, [isAdmin, searchParams]);

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
      if (expandedEventId === eventId) setExpandedEventId(null);
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
    setDriverFirst(""); setDriverLast(""); setDriverNationality(""); setDriverCategory("other"); setDriverBio("");
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
    
  };

  const handleSaveEdit = async () => {
    if (!editingDriver) return;
    setSaving(true);
    const { error } = await supabase.from("driver_profiles").update({
      first_name: editFirst, last_name: editLast,
      nationality: editNationality || null,
      primary_category: editCategory as any,
      bio: editBio || null,
      
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
      await supabase.from("driver_profiles").update({
        user_id: userId,
        is_claimed: true,
      }).eq("id", driverProfileId);
    }

    toast({ title: `Claim ${action}` });
    fetchClaims();
    fetchDrivers();
  };

  // ── AI Import & Approval Queue ──

  const fetchPendingEvents = async () => {
    const { data: entries } = await supabase
      .from("race_entries")
      .select("*, race_events(*), race_entry_drivers(*, driver_profiles(*))")
      .eq("verification_status", "pending");

    if (!entries || entries.length === 0) {
      setPendingEvents([]);
      return;
    }

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

  // Fetch entries for expanded event in All Races tab
  const fetchExpandedEntries = async (eventId: string) => {
    setLoadingExpanded(true);
    const { data: rawEntries } = await supabase
      .from("race_entries")
      .select("*, race_entry_drivers(*, driver_profiles(*))")
      .eq("race_event_id", eventId)
      .order("finishing_position", { ascending: true, nullsFirst: false });
    setExpandedEntries(rawEntries || []);
    setLoadingExpanded(false);
  };

  const toggleExpandEvent = (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      setExpandedEntries([]);
    } else {
      setExpandedEventId(eventId);
      fetchExpandedEntries(eventId);
    }
  };

  const handleImportResults = async () => {
    if (!importText.trim() && !importPdfFile) {
      toast({ title: "Paste race results text or upload a PDF", variant: "destructive" });
      return;
    }
    setImporting(true);
    setImportResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      let pdfBase64: string | undefined;
      if (importPdfFile) {
        const buffer = await importPdfFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      }

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
            rawText: importText || undefined,
            pdfBase64,
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
      setImportPdfFile(null);
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

  const handleImportFromUrl = async () => {
    if (!importUrl.trim() || !importUrl.startsWith("http")) {
      toast({ title: "Enter a valid URL", variant: "destructive" });
      return;
    }
    setImportingUrl(true);
    setImportUrlResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-race-results`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ url: importUrl }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Import failed", description: result.error || "Unknown error", variant: "destructive" });
        setImportingUrl(false);
        return;
      }

      setImportUrlResult(result);
      toast({ title: "Results imported from URL!", description: `${result.entriesCount} entries created as pending.` });
      setImportUrl("");
      fetchPendingEvents();
      fetchRaceEvents();
      fetchDrivers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setImportingUrl(false);
  };

  const handleEnrichDriver = async (driverId: string, force = false) => {
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
          body: JSON.stringify({ driverProfileId: driverId, force }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      } else {
        const r = result.results?.[0];
        const fields = r?.fieldsUpdated?.length || 0;
        if (fields > 0) {
          toast({ title: `Enriched ${r.name}`, description: `Updated: ${r.fieldsUpdated.join(", ")}` });
        } else if (!force) {
          toast({
            title: `No new data for ${r.name}`,
            description: "Try force re-enrich to overwrite existing data.",
            action: (
              <Button variant="outline" size="sm" onClick={() => handleEnrichDriver(driverId, true)}>
                Force Re-enrich
              </Button>
            ),
          });
        } else {
          toast({ title: `No new data for ${r.name}`, description: "AI returned no additional information." });
        }
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
    try {
      const { data: entries } = await supabase
        .from("race_entries")
        .select("id")
        .eq("race_event_id", eventId);
      const entryIds = (entries || []).map(e => e.id);

      let driverProfileIds: string[] = [];
      if (entryIds.length > 0) {
        const { data: junctions } = await supabase
          .from("race_entry_drivers")
          .select("driver_profile_id")
          .in("race_entry_id", entryIds);
        driverProfileIds = [...new Set((junctions || []).map(j => j.driver_profile_id))];
        await supabase.from("race_entry_drivers").delete().in("race_entry_id", entryIds);
      }

      await supabase.from("race_entries").delete().eq("race_event_id", eventId);
      await supabase.from("race_events").delete().eq("id", eventId);

      for (const driverId of driverProfileIds) {
        const { data: driver } = await supabase
          .from("driver_profiles")
          .select("is_claimed")
          .eq("id", driverId)
          .single();
        if (driver && !driver.is_claimed) {
          const { data: remaining } = await supabase
            .from("race_entry_drivers")
            .select("id")
            .eq("driver_profile_id", driverId)
            .limit(1);
          if (!remaining || remaining.length === 0) {
            await supabase.from("driver_profiles").delete().eq("id", driverId);
          }
        }
      }

      toast({ title: "Event rejected and fully deleted" });
      fetchPendingEvents();
      fetchRaceEvents();
      fetchDrivers();
    } catch (err: any) {
      toast({ title: "Error rejecting", description: err.message, variant: "destructive" });
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

  // Shared renderCell helper for inline editing
  const renderCell = (entry: any, field: string, value: any, extraClass?: string) => {
    const isEditing = editingCell?.entryId === entry.id && editingCell?.field === field;
    if (isEditing) {
      if (field === "status") {
        return (
          <td className="px-1 py-1">
            <div className="flex items-center gap-1">
              <Select value={editingCellValue} onValueChange={(v) => setEditingCellValue(v)}>
                <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Finished", "DNF", "DNS", "DSQ"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingCell(null)}><X className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleUpdateEntry}><Check className="h-3 w-3" /></Button>
            </div>
          </td>
        );
      }
      return (
        <td className="px-1 py-1">
          <Input
            value={editingCellValue}
            onChange={(e) => setEditingCellValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleUpdateEntry(); if (e.key === "Escape") setEditingCell(null); }}
            onBlur={handleUpdateEntry}
            autoFocus
            className="h-7 text-xs w-full min-w-[60px]"
            type={field === "finishing_position" ? "number" : "text"}
          />
        </td>
      );
    }
    return (
      <td
        className={`px-3 py-2 cursor-pointer hover:bg-accent/50 rounded transition-colors ${extraClass || "text-muted-foreground"}`}
        onClick={() => startEditCell(entry.id, field, value)}
      >
        {value ?? "—"}
      </td>
    );
  };

  // Shared entries table for pending and expanded All Races
  const renderEntriesTable = (entries: any[]) => (
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
          {entries
            .sort((a: any, b: any) => (a.finishing_position || 999) - (b.finishing_position || 999))
            .map((entry: any) => (
              <tr key={entry.id} className="border-b border-border/50">
                {renderCell(entry, "finishing_position", entry.finishing_position, "text-card-foreground font-medium")}
                {renderCell(entry, "car_number", entry.car_number)}
                {renderCell(entry, "team_name", entry.team_name, "text-card-foreground")}
                <td className="px-3 py-2 text-card-foreground">
                  {entry.race_entry_drivers?.length > 0
                    ? entry.race_entry_drivers.map((red: any) =>
                        red.driver_profiles ? `${red.driver_profiles.first_name} ${red.driver_profiles.last_name}` : "?"
                      ).join(", ")
                    : <span className="text-muted-foreground italic">No matched drivers</span>
                  }
                </td>
                {renderCell(entry, "race_class", entry.race_class)}
                {renderCell(entry, "gap_to_leader", entry.gap_to_leader)}
                {renderCell(entry, "status", entry.status)}
                {renderCell(entry, "notes", entry.notes)}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="create-driver">Create Driver</TabsTrigger>
            <TabsTrigger value="drivers">All Drivers ({drivers.length})</TabsTrigger>
            <TabsTrigger value="claims">
              Claims {pendingClaims.length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{pendingClaims.length}</span>}
            </TabsTrigger>
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-display text-xl font-bold text-foreground">All Drivers</h2>
              <div className="flex items-center gap-2">
                {selectedDriverIds.size > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedDriverIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedDriverIds.size} driver(s)?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the selected driver profiles. This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          for (const dId of selectedDriverIds) {
                            await handleDelete(dId);
                          }
                          setSelectedDriverIds(new Set());
                        }}>Delete All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button variant="outline" size="sm" onClick={handleBulkEnrich} disabled={bulkEnriching}>
                  {bulkEnriching ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Enriching…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Bulk Enrich Missing</>}
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-2 py-3 w-10">
                      <Checkbox
                        checked={drivers.length > 0 && selectedDriverIds.size === drivers.length}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedDriverIds(new Set(drivers.map(d => d.id)));
                          else setSelectedDriverIds(new Set());
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Driver</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Nationality</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Claimed</th>
                    <th className="px-4 py-3 text-right font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-3">
                        <Checkbox
                          checked={selectedDriverIds.has(d.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedDriverIds);
                            if (checked) next.add(d.id); else next.delete(d.id);
                            setSelectedDriverIds(next);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{d.first_name[0]}{d.last_name[0]}</div>
                          <span className="text-card-foreground font-medium">{d.first_name} {d.last_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{d.primary_category?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground"><span className="inline-flex items-center gap-1"><FlagImage nationality={d.nationality} size={16} /> {d.nationality ?? "—"}</span></td>
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
                  ))}
                  {drivers.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No drivers yet.</td></tr>}
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

              {/* Import from URL */}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold text-card-foreground">Import from URL</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Paste a URL from a timing/results page. The AI will scrape the page and extract structured race results.</p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://results.example.com/race-results"
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && !importingUrl && handleImportFromUrl()}
                    />
                  </div>
                  <Button onClick={handleImportFromUrl} disabled={importingUrl || !importUrl.trim()}>
                    {importingUrl ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scraping…</> : <><Globe className="h-4 w-4 mr-2" /> Import</>}
                  </Button>
                </div>
                {importUrlResult && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                    <h3 className="font-semibold text-card-foreground mb-2">Import Summary</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Event:</div>
                      <div className="text-card-foreground">{importUrlResult.eventName}</div>
                      <div className="text-muted-foreground">Series:</div>
                      <div className="text-card-foreground">{importUrlResult.seriesName}</div>
                      <div className="text-muted-foreground">Entries:</div>
                      <div className="text-card-foreground">{importUrlResult.entriesCount}</div>
                      <div className="text-muted-foreground">Drivers matched:</div>
                      <div className="text-card-foreground">{importUrlResult.matchedDrivers}</div>
                      <div className="text-muted-foreground">Drivers created:</div>
                      <div className="text-card-foreground">{importUrlResult.createdDrivers}</div>
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
                  <Label className="text-card-foreground">Upload PDF (optional)</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-card cursor-pointer hover:bg-muted transition-colors text-sm">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-card-foreground">{importPdfFile ? importPdfFile.name : "Choose PDF file"}</span>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 20 * 1024 * 1024) {
                              toast({ title: "File too large", description: "Max 20MB", variant: "destructive" });
                              return;
                            }
                            setImportPdfFile(file);
                            setImportText(""); // Clear text when PDF is selected
                          }
                        }}
                      />
                    </label>
                    {importPdfFile && (
                      <Button variant="ghost" size="sm" onClick={() => setImportPdfFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {!importPdfFile && (
                <div>
                  <Label className="text-card-foreground">Or Paste Raw Results Text</Label>
                  <Textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste race results here…&#10;&#10;Example:&#10;1. Max Verstappen - Red Bull Racing - 58 laps&#10;2. Lewis Hamilton - Mercedes - +5.023s&#10;..."
                    className="min-h-[200px] font-mono text-xs"
                  />
                </div>
                )}
                <Button onClick={handleImportResults} disabled={importing || (!importText.trim() && !importPdfFile)} className="w-full">
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
                  <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    {editingEventId === pe.id ? (
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 mr-4">
                        <Input value={editingEventFields.event_name} onChange={(e) => setEditingEventFields(f => ({ ...f, event_name: e.target.value }))} placeholder="Event Name" className="h-8 text-sm" />
                        <Input value={editingEventFields.series_name} onChange={(e) => setEditingEventFields(f => ({ ...f, series_name: e.target.value }))} placeholder="Series" className="h-8 text-sm" />
                        <Input value={editingEventFields.season_year} onChange={(e) => setEditingEventFields(f => ({ ...f, season_year: e.target.value }))} placeholder="Year" className="h-8 text-sm w-20" type="number" />
                        <Input value={editingEventFields.location} onChange={(e) => setEditingEventFields(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="h-8 text-sm" />
                        <Select value={editingEventFields.category} onValueChange={(v) => setEditingEventFields(f => ({ ...f, category: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{RACING_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-semibold text-card-foreground">{pe.event_name}</h3>
                        <p className="text-sm text-muted-foreground">{pe.series_name} · {pe.season_year}{pe.location ? ` · ${pe.location}` : ""}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingEventId === pe.id ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditingEventId(null)} className="gap-1"><X className="h-3 w-3" /> Cancel</Button>
                          <Button size="sm" onClick={handleUpdateEvent} className="gap-1"><Check className="h-3 w-3" /> Save</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEditEvent(pe)} className="gap-1"><Pencil className="h-3 w-3" /> Edit</Button>
                      )}
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
                  {renderEntriesTable(pe.entries)}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── All Races ── */}
          <TabsContent value="all-races">
            {selectedEventIds.size > 0 && (
              <div className="mb-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedEventIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedEventIds.size} event(s)?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete the selected events and all their entries. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                        for (const eId of selectedEventIds) {
                          await handleDeleteEvent(eId);
                        }
                        setSelectedEventIds(new Set());
                      }}>Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-2 py-3 w-10">
                      <Checkbox
                        checked={raceEvents.length > 0 && selectedEventIds.size === raceEvents.length}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedEventIds(new Set(raceEvents.map((ev: any) => ev.id)));
                          else setSelectedEventIds(new Set());
                        }}
                      />
                    </th>
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
                    <>
                      <tr key={ev.id} className={`border-b border-border/50 hover:bg-muted/30 ${expandedEventId === ev.id ? "bg-muted/40" : ""}`}>
                        <td className="px-2 py-3">
                          <Checkbox
                            checked={selectedEventIds.has(ev.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedEventIds);
                              if (checked) next.add(ev.id); else next.delete(ev.id);
                              setSelectedEventIds(next);
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-card-foreground font-medium">{ev.event_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ev.series_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ev.season_year}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{ev.category?.replace(/_/g, " ") ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ev.location ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{ev.race_entries?.length ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => toggleExpandEvent(ev.id)} title="Edit entries">
                              {expandedEventId === ev.id ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </Button>
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
                      {expandedEventId === ev.id && (
                        <tr key={`${ev.id}-expanded`}>
                          <td colSpan={8} className="p-0">
                            <div className="border-t border-border bg-muted/20">
                              {/* Event edit header */}
                              <div className="p-3 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
                                {editingEventId === ev.id ? (
                                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 mr-4">
                                    <Input value={editingEventFields.event_name} onChange={(e) => setEditingEventFields(f => ({ ...f, event_name: e.target.value }))} placeholder="Event Name" className="h-8 text-sm" />
                                    <Input value={editingEventFields.series_name} onChange={(e) => setEditingEventFields(f => ({ ...f, series_name: e.target.value }))} placeholder="Series" className="h-8 text-sm" />
                                    <Input value={editingEventFields.season_year} onChange={(e) => setEditingEventFields(f => ({ ...f, season_year: e.target.value }))} placeholder="Year" className="h-8 text-sm w-20" type="number" />
                                    <Input value={editingEventFields.location} onChange={(e) => setEditingEventFields(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="h-8 text-sm" />
                                    <Select value={editingEventFields.category} onValueChange={(v) => setEditingEventFields(f => ({ ...f, category: v }))}>
                                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                      <SelectContent>{RACING_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Editing entries for <strong className="text-card-foreground">{ev.event_name}</strong></span>
                                )}
                                <div className="flex items-center gap-2">
                                  {editingEventId === ev.id ? (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => setEditingEventId(null)} className="gap-1"><X className="h-3 w-3" /> Cancel</Button>
                                      <Button size="sm" onClick={handleUpdateEvent} className="gap-1"><Check className="h-3 w-3" /> Save</Button>
                                    </>
                                  ) : (
                                    <Button size="sm" variant="ghost" onClick={() => startEditEvent(ev)} className="gap-1"><Pencil className="h-3 w-3" /> Edit Event</Button>
                                  )}
                                </div>
                              </div>
                              {loadingExpanded ? (
                                <div className="p-6 text-center">
                                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                                </div>
                              ) : expandedEntries.length === 0 ? (
                                <div className="p-6 text-center text-muted-foreground text-sm">No entries for this event.</div>
                              ) : (
                                renderEntriesTable(expandedEntries)
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {raceEvents.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No race events yet.</td></tr>}
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
