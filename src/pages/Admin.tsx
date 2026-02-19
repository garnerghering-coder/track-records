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
import { Plus, Trash2, Pencil, Eye, Trash, Search, X, Check, Loader2, Sparkles, Clock, CheckCircle2, XCircle, Flag, MapPin, Globe, Link, ChevronDown, ChevronUp, Upload, Users, AlertTriangle, Zap, Calendar, Play, RefreshCw, Send, Ban, ClipboardCopy, FileJson, PenLine, Undo2, Car, Trophy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import CountrySelect from "@/components/CountrySelect";

import FlagImage from "@/components/FlagImage";
import DuplicatesTab from "@/components/DuplicatesTab";
import TeamDuplicatesTab from "@/components/TeamDuplicatesTab";
import CircuitDuplicatesTab from "@/components/CircuitDuplicatesTab";
import FlagsTab from "@/components/FlagsTab";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("drivers");

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
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);

  // All race events
  const [raceEvents, setRaceEvents] = useState<any[]>([]);

  // Reports
  const [reports, setReports] = useState<any[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [teamDuplicateCount, setTeamDuplicateCount] = useState(0);
  const [circuitDuplicateCount, setCircuitDuplicateCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);

  // Circuits
  const [allCircuits, setAllCircuits] = useState<any[]>([]);
  const [enrichingCircuitIds, setEnrichingCircuitIds] = useState<Set<string>>(new Set());
  const [bulkEnrichingCircuits, setBulkEnrichingCircuits] = useState(false);
  const [enrichingEventIds, setEnrichingEventIds] = useState<Set<string>>(new Set());

  // Series
  const [allSeries, setAllSeries] = useState<any[]>([]);
  const [enrichingSeriesIds, setEnrichingSeriesIds] = useState<Set<string>>(new Set());
  const [bulkEnrichingSeries, setBulkEnrichingSeries] = useState(false);

  // Driver editing on entries
  const [editingDriversEntryId, setEditingDriversEntryId] = useState<string | null>(null);
  const [driverSearchTerm, setDriverSearchTerm] = useState("");

  // AI Import
  const [importText, setImportText] = useState("");
  const [importEventHint, setImportEventHint] = useState("");
  const [importSeriesHint, setImportSeriesHint] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importPdfFile, setImportPdfFile] = useState<File | null>(null);

  // Direct JSON Import
  const [directJsonText, setDirectJsonText] = useState("");
  const [directImporting, setDirectImporting] = useState(false);
  const [directImportResult, setDirectImportResult] = useState<any>(null);

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
  const [enrichingTeamIds, setEnrichingTeamIds] = useState<Set<string>>(new Set());
  const [bulkEnrichingTeams, setBulkEnrichingTeams] = useState(false);
  const [seedingCircuits, setSeedingCircuits] = useState(false);
  const [seedingSeries, setSeedingSeries] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());

  // Cars
  const [allCars, setAllCars] = useState<any[]>([]);
  const [enrichingCarIds, setEnrichingCarIds] = useState<Set<string>>(new Set());
  const [bulkEnrichingCars, setBulkEnrichingCars] = useState(false);
  const [seedingCars, setSeedingCars] = useState(false);
  const [editingCarEntryId, setEditingCarEntryId] = useState<string | null>(null);
  const [carSearchTerm, setCarSearchTerm] = useState("");

  // Series Discovery (background jobs)
  const [discoverSeriesName, setDiscoverSeriesName] = useState("");
  const [discoverYear, setDiscoverYear] = useState(new Date().getFullYear().toString());
  const [submittingJob, setSubmittingJob] = useState(false);
  const [discoveryJobs, setDiscoveryJobs] = useState<any[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Import Sources
  const [importSources, setImportSources] = useState<any[]>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceSeries, setNewSourceSeries] = useState("");
  const [newSourceFrequency, setNewSourceFrequency] = useState("weekly");
  const [addingSource, setAddingSource] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);

  // Community Submissions
  const [communitySubmissions, setCommunitySubmissions] = useState<any[]>([]);
  const [approvingSubmission, setApprovingSubmission] = useState<string | null>(null);

  // Edit Queue
  const [editQueue, setEditQueue] = useState<any[]>([]);
  const [editQueueLoading, setEditQueueLoading] = useState(false);
  const [approvingQueueId, setApprovingQueueId] = useState<string | null>(null);

  // Bulk selection
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Bulk entry editing
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState("race_class");
  const [bulkValue, setBulkValue] = useState("");

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
  const [editingEventFields, setEditingEventFields] = useState<{ event_name: string; series_name: string; season_year: string; location: string; category: string; event_date: string }>({ event_name: "", series_name: "", season_year: "", location: "", category: "", event_date: "" });

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

  const BULK_EDITABLE_COLUMNS = [
    { value: "race_class", label: "Class" },
    { value: "status", label: "Status" },
    { value: "team_name", label: "Team" },
    { value: "car_number", label: "Car #" },
    { value: "gap_to_leader", label: "Gap to Leader" },
    { value: "gap_to_class_leader", label: "Gap to Class Leader" },
    { value: "notes", label: "Notes" },
    { value: "car_model_id", label: "Car Model" },
    { value: "finishing_position", label: "Position" },
    { value: "class_position", label: "Class Position" },
    { value: "laps_completed", label: "Laps" },
    { value: "pit_stops", label: "Pit Stops" },
  ];

  const handleBulkUpdateEntries = async (clearField = false) => {
    if (selectedEntryIds.size === 0) return;
    const numericFields = ["finishing_position", "class_position", "laps_completed", "pit_stops"];
    let value: any = clearField ? null : (bulkValue.trim() || null);
    if (!clearField && value && numericFields.includes(bulkField)) {
      value = parseInt(value);
      if (isNaN(value)) { toast({ title: "Invalid number", variant: "destructive" }); return; }
    }
    const { error } = await supabase
      .from("race_entries")
      .update({ [bulkField]: value } as any)
      .in("id", Array.from(selectedEntryIds));
    if (error) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: clearField ? "Field cleared" : "Bulk update applied", description: `${selectedEntryIds.size} entries updated.` });
      setSelectedEntryIds(new Set());
      setBulkValue("");
      fetchPendingEvents();
      if (expandedEventId) fetchExpandedEntries(expandedEventId);
    }
  };

  const startEditEvent = (ev: { id: string; event_name: string; series_name: string; season_year: number; location: string | null; category: string | null; event_date?: string | null }) => {
    setEditingEventId(ev.id);
    setEditingEventFields({ event_name: ev.event_name, series_name: ev.series_name, season_year: ev.season_year.toString(), location: ev.location || "", category: ev.category || "other", event_date: ev.event_date || "" });
  };

  const handleUpdateEvent = async () => {
    if (!editingEventId) return;
    const eventDate = editingEventFields.event_date || null;
    let seasonYear = parseInt(editingEventFields.season_year) || new Date().getFullYear();
    // Derive season_year from event_date if present
    if (eventDate) {
      const parsed = parseInt(eventDate.split("-")[0]);
      if (parsed) seasonYear = parsed;
    }
    const { error } = await supabase.from("race_events").update({
      event_name: editingEventFields.event_name,
      series_name: editingEventFields.series_name,
      season_year: seasonYear,
      location: editingEventFields.location || null,
      category: (editingEventFields.category || "other") as any,
      event_date: eventDate,
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
    fetchTeams();
    fetchCircuits();
    fetchSeries();
    fetchCars();
    fetchRoles();
    fetchClaims();
    fetchPendingEvents();
    fetchRaceEvents();
    fetchReports();
    fetchImportSources();
    fetchCommunitySubmissions();
    fetchEditQueue();
  };

  const fetchDrivers = async () => {
    const { data } = await supabase.from("driver_profiles").select("*").order("created_at", { ascending: false });
    if (data) setDrivers(data);
  };

  const fetchTeams = async () => {
    const { data } = await supabase.from("team_profiles" as any).select("*").order("name") as any;
    if (data) setAllTeams(data);
  };

  const fetchCircuits = async () => {
    const { data } = await supabase.from("circuits").select("*").order("name");
    if (data) setAllCircuits(data);
  };

  const fetchSeries = async () => {
    const { data } = await supabase.from("series").select("*").order("name");
    if (data) setAllSeries(data);
  };

  const fetchCars = async () => {
    const { data } = await supabase.from("car_models").select("*").order("name");
    if (data) setAllCars(data);
  };

  const handleEnrichCar = async (carId: string, force = false) => {
    setEnrichingCarIds(prev => new Set(prev).add(carId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-car-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ carModelId: carId, force }),
      });
      const result = await response.json();
      if (!response.ok) toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      else { const r = result.results?.[0]; toast({ title: `Enriched ${r?.name}`, description: `Updated: ${r?.fieldsUpdated?.join(", ") || "none"}` }); fetchCars(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setEnrichingCarIds(prev => { const n = new Set(prev); n.delete(carId); return n; });
  };

  const handleBulkEnrichCars = async () => {
    const missing = allCars.filter((c: any) => !c.description || !c.manufacturer);
    if (missing.length === 0) { toast({ title: "All cars already enriched" }); return; }
    setBulkEnrichingCars(true);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-car-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ carModelIds: missing.map((c: any) => c.id), force: false }),
    });
    const result = await response.json();
    if (!response.ok) toast({ title: "Bulk enrich failed", description: result.error, variant: "destructive" });
    else { const updated = result.results?.filter((r: any) => r.fieldsUpdated?.length > 0).length || 0; toast({ title: `Enriched ${updated} cars` }); fetchCars(); }
    setBulkEnrichingCars(false);
  };

  const handleSeedCars = async () => {
    setSeedingCars(true);
    try {
      // Find entries with car_model_id set, verify those cars exist in allCars
      const { data: entriesWithCars } = await supabase
        .from("race_entries")
        .select("car_model_id, car_models(id, name)")
        .not("car_model_id", "is", null);
      
      const uniqueCarIds = new Set((entriesWithCars || []).map((e: any) => e.car_model_id).filter(Boolean));
      const existingCarIds = new Set(allCars.map((c: any) => c.id));
      const missingCount = [...uniqueCarIds].filter(id => !existingCarIds.has(id)).length;
      
      // Count entries without car
      const { count } = await supabase
        .from("race_entries")
        .select("id", { count: "exact", head: true })
        .is("car_model_id", null);
      
      fetchCars();
      toast({
        title: "Cars summary",
        description: `${uniqueCarIds.size} unique cars linked to entries. ${count || 0} entries have no car assigned. Use "Enrich" on races to auto-fill car data.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSeedingCars(false);
  };

  const handleEnrichSeries = async (seriesId: string, force = false) => {
    setEnrichingSeriesIds(prev => new Set(prev).add(seriesId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-series`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ seriesId, force }),
      });
      const result = await response.json();
      if (!response.ok) toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      else { const r = result.results?.[0]; toast({ title: `Enriched ${r?.name}`, description: `Updated: ${r?.fieldsUpdated?.join(", ") || "none"}` }); fetchSeries(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setEnrichingSeriesIds(prev => { const n = new Set(prev); n.delete(seriesId); return n; });
  };

  const handleBulkEnrichSeries = async () => {
    const missing = allSeries.filter((s: any) => !s.description || !s.category);
    if (missing.length === 0) { toast({ title: "All series already enriched" }); return; }
    setBulkEnrichingSeries(true);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-series`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ seriesIds: missing.map((s: any) => s.id), force: false }),
    });
    const result = await response.json();
    if (!response.ok) toast({ title: "Bulk enrich failed", description: result.error, variant: "destructive" });
    else { const updated = result.results?.filter((r: any) => r.fieldsUpdated?.length > 0).length || 0; toast({ title: `Enriched ${updated} series` }); fetchSeries(); }
    setBulkEnrichingSeries(false);
  };

  const handleEnrichCircuit = async (circuitId: string, force = false) => {
    setEnrichingCircuitIds(prev => new Set(prev).add(circuitId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-circuit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ circuitId, force }),
      });
      const result = await response.json();
      if (!response.ok) toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      else { const r = result.results?.[0]; toast({ title: `Enriched ${r?.name}`, description: `Updated: ${r?.fieldsUpdated?.join(", ") || "none"}` }); fetchCircuits(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setEnrichingCircuitIds(prev => { const n = new Set(prev); n.delete(circuitId); return n; });
  };

  const handleBulkEnrichCircuits = async () => {
    const missing = allCircuits.filter((c: any) => !c.description || !c.country);
    if (missing.length === 0) { toast({ title: "All circuits already enriched" }); return; }
    setBulkEnrichingCircuits(true);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-circuit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ circuitIds: missing.map((c: any) => c.id), force: false }),
    });
    const result = await response.json();
    if (!response.ok) toast({ title: "Bulk enrich failed", description: result.error, variant: "destructive" });
    else { const updated = result.results?.filter((r: any) => r.fieldsUpdated?.length > 0).length || 0; toast({ title: `Enriched ${updated} circuits` }); fetchCircuits(); }
    setBulkEnrichingCircuits(false);
  };

  const handleEnrichEvent = async (eventId: string, force = false) => {
    setEnrichingEventIds(prev => new Set(prev).add(eventId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-race-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ eventId, force }),
      });
      const result = await response.json();
      if (!response.ok) toast({ title: "Enrichment failed", description: result.error, variant: "destructive" });
      else { const r = result.results?.[0]; toast({ title: `Enriched ${r?.name}`, description: `Updated: ${r?.fieldsUpdated?.join(", ") || "none"}` }); fetchRaceEvents(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setEnrichingEventIds(prev => { const n = new Set(prev); n.delete(eventId); return n; });
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

  const fetchImportSources = async () => {
    const { data } = await supabase.from("import_sources" as any).select("*").order("created_at", { ascending: false });
    if (data) setImportSources(data as any[]);
  };

  const fetchCommunitySubmissions = async () => {
    const { data } = await supabase.from("community_submissions" as any).select("*").order("created_at", { ascending: false });
    if (data) setCommunitySubmissions(data as any[]);
  };

  const fetchDiscoveryJobs = async () => {
    const { data } = await supabase
      .from("discovery_jobs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setDiscoveryJobs(data as any[]);
  };

  const handleCancelJob = async (jobId: string) => {
    const { error } = await supabase.from("discovery_jobs").update({ status: "cancelled" } as any).eq("id", jobId);
    if (error) toast({ title: "Error cancelling job", description: error.message, variant: "destructive" });
    else { toast({ title: "Job cancelled" }); fetchDiscoveryJobs(); }
  };

  const handleDeleteJob = async (jobId: string) => {
    const { error } = await supabase.from("discovery_jobs").delete().eq("id", jobId);
    if (error) toast({ title: "Error deleting job", description: error.message, variant: "destructive" });
    else { toast({ title: "Job removed" }); fetchDiscoveryJobs(); }
  };

  // Poll for running jobs
  useEffect(() => {
    if (!isAdmin) return;
    fetchDiscoveryJobs();
    const hasRunning = discoveryJobs.some((j: any) => j.status === "queued" || j.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(fetchDiscoveryJobs, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, discoveryJobs.some((j: any) => j.status === "queued" || j.status === "running")]);

  const handleDiscoverSeries = async () => {
    if (!discoverSeriesName.trim()) { toast({ title: "Enter a series name", variant: "destructive" }); return; }
    setSubmittingJob(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discover-series`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ seriesName: discoverSeriesName, seasonYear: parseInt(discoverYear) || new Date().getFullYear() }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Failed to queue job", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Job queued!", description: `${discoverSeriesName} ${discoverYear} is now processing in the background.` });
        setDiscoverSeriesName("");
        fetchDiscoveryJobs();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmittingJob(false);
  };

  const handleAddImportSource = async () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) { toast({ title: "Name and URL required", variant: "destructive" }); return; }
    setAddingSource(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("import_sources" as any).insert({
      name: newSourceName, url: newSourceUrl, series_hint: newSourceSeries || null,
      frequency: newSourceFrequency, is_active: true, created_by: session?.user?.id,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Import source added" }); setNewSourceName(""); setNewSourceUrl(""); setNewSourceSeries(""); fetchImportSources(); }
    setAddingSource(false);
  };

  const handleDeleteImportSource = async (id: string) => {
    const { error } = await supabase.from("import_sources" as any).delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Source deleted" }); fetchImportSources(); }
  };

  const handleToggleSourceActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("import_sources" as any).update({ is_active: !isActive } as any).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else fetchImportSources();
  };

  const handleRunSource = async (sourceId: string) => {
    setRunningSourceId(sourceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scheduled-import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ sourceId }),
        }
      );
      const result = await response.json();
      if (!response.ok) { toast({ title: "Import failed", description: result.error, variant: "destructive" }); }
      else { toast({ title: "Import complete", description: `Processed ${result.sourcesProcessed} source(s)` }); fetchImportSources(); fetchPendingEvents(); fetchRaceEvents(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setRunningSourceId(null);
  };

  const handleApproveSubmission = async (submission: any) => {
    setApprovingSubmission(submission.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Use import-race-results to actually import the parsed data
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-race-results`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ rawText: submission.raw_data, eventHint: submission.event_name, seriesHint: submission.series_name }),
        }
      );
      const result = await response.json();
      if (!response.ok) { toast({ title: "Import failed", description: result.error, variant: "destructive" }); }
      else {
        // Update submission status
        await supabase.from("community_submissions" as any).update({ status: "approved", reviewed_by: session?.user?.id, reviewed_at: new Date().toISOString() } as any).eq("id", submission.id);
        toast({ title: "Submission approved & imported!", description: `${result.entriesCount} entries created.` });
        fetchCommunitySubmissions();
        fetchPendingEvents();
        fetchRaceEvents();
      }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setApprovingSubmission(null);
  };

  const handleRejectSubmission = async (submissionId: string, notes: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("community_submissions" as any).update({
      status: "rejected", admin_notes: notes || "Rejected", reviewed_by: session?.user?.id, reviewed_at: new Date().toISOString(),
    } as any).eq("id", submissionId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Submission rejected" }); fetchCommunitySubmissions(); }
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
      .select("*, race_events(*), race_entry_drivers(*, driver_profiles(*)), car_models(*)")
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
      .select("*, race_entry_drivers(*, driver_profiles(*)), car_models(*)")
      .eq("race_event_id", eventId)
      .order("finishing_position", { ascending: true, nullsFirst: false });
    setExpandedEntries(rawEntries || []);
    setLoadingExpanded(false);
  };

  const toggleExpandEvent = (eventId: string) => {
    setSelectedEntryIds(new Set());
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

  const DIRECT_IMPORT_TEMPLATE = `Parse these race results into this exact JSON format. Return ONLY valid JSON, no explanation:

{
  "event_name": "string",
  "series_name": "string",
  "season_year": number,
  "event_date": "YYYY-MM-DD or null",
  "location": "string or null",
  "category": "one of: karting, single_seater, gt, touring_car, sports_car, rally, endurance, formula, stock_car, other",
  "entries": [
    {
      "finishing_position": number or null,
      "class_position": number or null,
      "car_number": "string or null",
      "team_name": "string or null",
      "car_model_name": "string or null (e.g. 'Cadillac V-Series.R', 'Porsche 963', 'Ferrari 296 GT3')",
      "driver_names": ["array of full driver name strings"],
      "race_class": "string or null",
      "laps_completed": number or null,
      "gap_to_leader": "string or null",
      "gap_to_class_leader": "string or null",
      "pit_stops": number or null,
      "status": "Finished, DNF, DNS, or DSQ"
    }
  ]
}

Here are the results to parse:
[PASTE YOUR RESULTS HERE]`;

  const handleDirectImport = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(directJsonText);
    } catch {
      toast({ title: "Invalid JSON", description: "Please paste valid JSON.", variant: "destructive" });
      return;
    }
    if (!parsed.event_name || !parsed.series_name || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      toast({ title: "Invalid structure", description: "JSON must have event_name, series_name, and a non-empty entries array.", variant: "destructive" });
      return;
    }
    setDirectImporting(true);
    setDirectImportResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/direct-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: directJsonText,
        }
      );
      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Import failed", description: result.error || "Unknown error", variant: "destructive" });
      } else {
        setDirectImportResult(result);
        toast({ title: "Results imported!", description: `${result.entriesCount} entries added as pending.` });
        setDirectJsonText("");
        fetchPendingEvents();
        fetchRaceEvents();
        fetchDrivers();
      }
    } catch (err: any) {
      toast({ title: "Import error", description: err.message, variant: "destructive" });
    }
    setDirectImporting(false);
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

  const fetchEditQueue = async () => {
    setEditQueueLoading(true);
    const { data } = await supabase.from("edit_queue" as any).select("*").order("created_at", { ascending: false });
    if (data) setEditQueue(data as any[]);
    setEditQueueLoading(false);
  };

  const handleApproveQueueItem = async (item: any) => {
    setApprovingQueueId(item.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (item.edit_type === "create_driver") {
        await supabase.from("driver_profiles").insert({
          first_name: item.proposed_data.first_name,
          last_name: item.proposed_data.last_name,
          nationality: item.proposed_data.nationality || null,
          primary_category: item.proposed_data.primary_category || "other",
          bio: item.proposed_data.bio || null,
          is_claimed: false,
        });
      } else if (item.edit_type === "create_team") {
        await supabase.from("team_profiles" as any).insert({
          name: item.proposed_data.name,
          nationality: item.proposed_data.nationality || null,
          primary_category: item.proposed_data.primary_category || "other",
          bio: item.proposed_data.bio || null,
          website: item.proposed_data.website || null,
        });
      } else if (item.edit_type === "create_event") {
        const eventData = item.proposed_data;
        const { data: newEvent } = await supabase.from("race_events").insert({
          event_name: eventData.event_name,
          series_name: eventData.series_name,
          season_year: eventData.season_year,
          event_date: eventData.event_date || null,
          location: eventData.location || null,
          category: eventData.category || "other",
        }).select("id").single();

        if (newEvent && eventData.entries) {
          for (const entry of eventData.entries) {
            await supabase.from("race_entries").insert({
              race_event_id: newEvent.id,
              finishing_position: entry.finishing_position ?? null,
              team_name: entry.team_name || null,
              car_number: entry.car_number || null,
              race_class: entry.race_class || null,
              status: entry.status || null,
              verification_status: "pending",
            });
          }
        }
      } else if (item.edit_type.startsWith("edit_") && item.target_id) {
        const tableMap: Record<string, string> = { edit_driver: "driver_profiles", edit_team: "team_profiles", edit_event: "race_events" };
        const table = tableMap[item.edit_type];
        if (table) {
          await supabase.from(table as any).update(item.proposed_data as any).eq("id", item.target_id);
        }
      }

      await supabase.from("edit_queue" as any).update({ status: "approved", reviewed_by: session.user.id, reviewed_at: new Date().toISOString() } as any).eq("id", item.id);
      toast({ title: "Contribution approved" });
      fetchEditQueue();
      fetchDrivers();
      fetchRaceEvents();
    } catch (err: any) {
      toast({ title: "Error approving", description: err.message, variant: "destructive" });
    }
    setApprovingQueueId(null);
  };

  const handleRejectQueueItem = async (itemId: string, notes: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("edit_queue" as any).update({ status: "rejected", reviewed_by: session.user.id, reviewed_at: new Date().toISOString(), admin_notes: notes || null } as any).eq("id", itemId);
    toast({ title: "Contribution rejected" });
    fetchEditQueue();
  };

  const handleUndoQueueItem = async (item: any) => {
    if (!item.previous_data || !item.target_id) return;
    const tableMap: Record<string, string> = { edit_driver: "driver_profiles", edit_team: "team_profiles", edit_event: "race_events" };
    const table = tableMap[item.edit_type];
    if (table) {
      await supabase.from(table as any).update(item.previous_data as any).eq("id", item.target_id);
      await supabase.from("edit_queue" as any).update({ status: "pending" } as any).eq("id", item.id);
      toast({ title: "Edit undone" });
      fetchEditQueue();
    }
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

  const handleEnrichTeam = async (teamId: string, force = false) => {
    setEnrichingTeamIds(prev => new Set(prev).add(teamId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-team-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ teamProfileId: teamId, force }),
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
              <Button variant="outline" size="sm" onClick={() => handleEnrichTeam(teamId, true)}>
                Force Re-enrich
              </Button>
            ),
          });
        } else {
          toast({ title: `No new data for ${r.name}` });
        }
        fetchTeams();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setEnrichingTeamIds(prev => { const n = new Set(prev); n.delete(teamId); return n; });
  };

  const handleBulkEnrichTeams = async () => {
    const needsEnrich = allTeams.filter((t: any) => !t.nationality || !t.bio);
    if (needsEnrich.length === 0) {
      toast({ title: "All teams already enriched" });
      return;
    }
    setBulkEnrichingTeams(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-team-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ teamProfileIds: needsEnrich.map((t: any) => t.id) }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Bulk team enrichment failed", description: result.error, variant: "destructive" });
      } else {
        const updated = result.results?.filter((r: any) => r.fieldsUpdated?.length > 0).length || 0;
        toast({ title: "Bulk team enrichment complete", description: `${updated} of ${needsEnrich.length} teams updated.` });
        fetchTeams();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBulkEnrichingTeams(false);
  };

  const handleSeedCircuits = async () => {
    setSeedingCircuits(true);
    try {
      const { data: events } = await supabase.from("race_events").select("location").not("location", "is", null);
      if (!events || events.length === 0) { toast({ title: "No locations found" }); setSeedingCircuits(false); return; }
      
      const locationMap = new Map<string, number>();
      for (const e of events) {
        if (!e.location) continue;
        const key = e.location.trim().toLowerCase();
        locationMap.set(key, (locationMap.get(key) || 0) + 1);
      }
      
      // Get existing circuits
      const { data: existing } = await supabase.from("circuits").select("name");
      const existingNames = new Set((existing || []).map((c: any) => c.name.trim().toLowerCase()));
      
      let created = 0;
      for (const [key, count] of locationMap) {
        if (existingNames.has(key)) continue;
        // Use the most common casing from events
        const original = events.find(e => e.location?.trim().toLowerCase() === key)?.location || key;
        await supabase.from("circuits").insert({ name: original, location: original });
        created++;
      }
      
      toast({ title: "Circuits seeded", description: `${created} circuits created from ${locationMap.size} unique locations.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSeedingCircuits(false);
  };

  const handleSeedSeries = async () => {
    setSeedingSeries(true);
    try {
      const { data: events } = await supabase.from("race_events").select("series_name, category");
      if (!events || events.length === 0) { toast({ title: "No series found" }); setSeedingSeries(false); return; }
      
      const seriesMap = new Map<string, { name: string; category: string | null }>();
      for (const e of events) {
        const key = e.series_name.trim().toLowerCase();
        if (!seriesMap.has(key)) {
          seriesMap.set(key, { name: e.series_name, category: e.category });
        }
      }
      
      const { data: existing } = await supabase.from("series").select("name");
      const existingNames = new Set((existing || []).map((s: any) => s.name.trim().toLowerCase()));
      
      let created = 0;
      for (const [key, val] of seriesMap) {
        if (existingNames.has(key)) continue;
        await supabase.from("series").insert({ name: val.name, category: val.category } as any);
        created++;
      }
      
      toast({ title: "Series seeded", description: `${created} series created from ${seriesMap.size} unique series names.` });
      fetchSeries();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSeedingSeries(false);
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

  const handleRemoveDriver = async (entryId: string, driverProfileId: string) => {
    const { error } = await supabase.from("race_entry_drivers").delete()
      .eq("race_entry_id", entryId).eq("driver_profile_id", driverProfileId);
    if (error) {
      toast({ title: "Error removing driver", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver removed from entry" });
      fetchPendingEvents();
      if (expandedEventId) fetchExpandedEntries(expandedEventId);
    }
  };

  const handleAddDriverToEntry = async (entryId: string, driverProfileId: string) => {
    const { error } = await supabase.from("race_entry_drivers").insert({
      race_entry_id: entryId,
      driver_profile_id: driverProfileId,
    });
    if (error) {
      toast({ title: "Error adding driver", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver added to entry" });
      setDriverSearchTerm("");
      fetchPendingEvents();
      if (expandedEventId) fetchExpandedEntries(expandedEventId);
    }
  };

  const renderDriverCell = (entry: any) => {
    const currentDrivers = entry.race_entry_drivers || [];
    const currentIds = new Set(currentDrivers.map((red: any) => red.driver_profile_id));
    const isEditing = editingDriversEntryId === entry.id;
    const filteredDrivers = driverSearchTerm.trim()
      ? drivers.filter(d =>
          !currentIds.has(d.id) &&
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearchTerm.toLowerCase())
        ).slice(0, 8)
      : [];

    return (
      <td className="px-3 py-2">
        <Popover open={isEditing} onOpenChange={(open) => { if (!open) { setEditingDriversEntryId(null); setDriverSearchTerm(""); } }}>
          <PopoverTrigger asChild>
            <button
              className="text-left w-full cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 transition-colors"
              onClick={() => setEditingDriversEntryId(entry.id)}
            >
              {currentDrivers.length > 0
                ? currentDrivers.map((red: any) =>
                    red.driver_profiles ? `${red.driver_profiles.first_name} ${red.driver_profiles.last_name}` : "?"
                  ).join(", ")
                : <span className="text-muted-foreground italic">No matched drivers</span>
              }
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-card-foreground">Linked Drivers</p>
              {currentDrivers.length === 0 && <p className="text-xs text-muted-foreground italic">None</p>}
              {currentDrivers.map((red: any) => (
                <div key={red.driver_profile_id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-card-foreground truncate">
                    {red.driver_profiles ? `${red.driver_profiles.first_name} ${red.driver_profiles.last_name}` : red.driver_profile_id.slice(0, 8)}
                  </span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive/80" onClick={() => handleRemoveDriver(entry.id, red.driver_profile_id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2">
                <Input
                  value={driverSearchTerm}
                  onChange={(e) => setDriverSearchTerm(e.target.value)}
                  placeholder="Search drivers to add…"
                  className="h-7 text-xs"
                  autoFocus
                />
                {filteredDrivers.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                    {filteredDrivers.map(d => (
                      <button
                        key={d.id}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-card-foreground"
                        onClick={() => handleAddDriverToEntry(entry.id, d.id)}
                      >
                        {d.first_name} {d.last_name}
                        {d.nationality && <span className="text-muted-foreground ml-1">({d.nationality})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {driverSearchTerm.trim() && filteredDrivers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1 px-1">No matching drivers</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </td>
    );
  };

  const renderCarCell = (entry: any) => {
    const currentCar = entry.car_models;
    const isEditing = editingCarEntryId === entry.id;
    const filteredCars = carSearchTerm.trim()
      ? allCars.filter((c: any) =>
          c.name.toLowerCase().includes(carSearchTerm.toLowerCase())
        ).slice(0, 8)
      : [];

    const handleSelectCar = async (carId: string) => {
      const { error } = await supabase.from("race_entries").update({ car_model_id: carId }).eq("id", entry.id);
      if (error) {
        toast({ title: "Error updating car", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Car updated" });
        setCarSearchTerm("");
        setEditingCarEntryId(null);
        fetchPendingEvents();
        if (expandedEventId) fetchExpandedEntries(expandedEventId);
      }
    };

    const handleClearCar = async () => {
      const { error } = await supabase.from("race_entries").update({ car_model_id: null }).eq("id", entry.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Car cleared" });
        setEditingCarEntryId(null);
        fetchPendingEvents();
        if (expandedEventId) fetchExpandedEntries(expandedEventId);
      }
    };

    return (
      <td className="px-3 py-2">
        <Popover open={isEditing} onOpenChange={(open) => { if (!open) { setEditingCarEntryId(null); setCarSearchTerm(""); } }}>
          <PopoverTrigger asChild>
            <button
              className="text-left w-full cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 transition-colors"
              onClick={() => setEditingCarEntryId(entry.id)}
            >
              {currentCar?.name
                ? <span className="text-card-foreground">{currentCar.name}</span>
                : <span className="text-muted-foreground italic">No car</span>
              }
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-card-foreground">Car Model</p>
              {currentCar && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-card-foreground truncate">{currentCar.name}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive/80" onClick={handleClearCar}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="border-t border-border pt-2 mt-2">
                <Input
                  value={carSearchTerm}
                  onChange={(e) => setCarSearchTerm(e.target.value)}
                  placeholder="Search cars…"
                  className="h-7 text-xs"
                  autoFocus
                />
                {filteredCars.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                    {filteredCars.map((c: any) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-card-foreground"
                        onClick={() => handleSelectCar(c.id)}
                      >
                        {c.name}
                        {c.manufacturer && <span className="text-muted-foreground ml-1">({c.manufacturer})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {carSearchTerm.trim() && filteredCars.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1 px-1">No matching cars</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </td>
    );
  };

  // Shared entries table for pending and expanded All Races
  const renderEntriesTable = (entries: any[]) => {
    const entryIds = entries.map((e: any) => e.id);
    const allSelected = entryIds.length > 0 && entryIds.every(id => selectedEntryIds.has(id));
    const someSelected = entryIds.some(id => selectedEntryIds.has(id));

    return (
      <div className="overflow-x-auto">
        {someSelected && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b border-border flex-wrap">
            <span className="text-xs font-medium text-card-foreground">{selectedEntryIds.size} selected</span>
            <Select value={bulkField} onValueChange={setBulkField}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULK_EDITABLE_COLUMNS.map(col => (
                  <SelectItem key={col.value} value={col.value}>{col.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bulkField === "status" ? (
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="New value" /></SelectTrigger>
                <SelectContent>
                  {["Finished", "DNF", "DNS", "DSQ"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder="New value"
                className="h-7 text-xs w-32"
                type={["finishing_position", "class_position", "laps_completed", "pit_stops"].includes(bulkField) ? "number" : "text"}
              />
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkUpdateEntries(false)} disabled={!bulkValue.trim()}>
              Apply
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleBulkUpdateEntries(true)}>
              Clear Field
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedEntryIds(new Set())}>
              Deselect All
            </Button>
          </div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-2 py-2 w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedEntryIds(prev => {
                        const next = new Set(prev);
                        entryIds.forEach(id => next.add(id));
                        return next;
                      });
                    } else {
                      setSelectedEntryIds(prev => {
                        const next = new Set(prev);
                        entryIds.forEach(id => next.delete(id));
                        return next;
                      });
                    }
                  }}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pos</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Car #</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Team</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Driver(s)</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Car</th>
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
                <tr key={entry.id} className={`border-b border-border/50 ${selectedEntryIds.has(entry.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-2 py-2">
                    <Checkbox
                      checked={selectedEntryIds.has(entry.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedEntryIds);
                        if (checked) next.add(entry.id); else next.delete(entry.id);
                        setSelectedEntryIds(next);
                      }}
                    />
                  </td>
                  {renderCell(entry, "finishing_position", entry.finishing_position, "text-card-foreground font-medium")}
                  {renderCell(entry, "car_number", entry.car_number)}
                  {renderCell(entry, "team_name", entry.team_name, "text-card-foreground")}
                  {renderDriverCell(entry)}
                  {renderCarCell(entry)}
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

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedEntryIds(new Set()); }} className="w-full">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="drivers">All Drivers ({drivers.length})</TabsTrigger>
            <TabsTrigger value="all-teams">
              <Car className="h-3.5 w-3.5 mr-1" /> All Teams ({allTeams.length})
            </TabsTrigger>
            <TabsTrigger value="all-circuits">
              <MapPin className="h-3.5 w-3.5 mr-1" /> All Circuits ({allCircuits.length})
            </TabsTrigger>
            <TabsTrigger value="all-series">
              <Trophy className="h-3.5 w-3.5 mr-1" /> All Series ({allSeries.length})
            </TabsTrigger>
            <TabsTrigger value="all-cars">
              <Car className="h-3.5 w-3.5 mr-1" /> All Cars ({allCars.length})
            </TabsTrigger>
            <TabsTrigger value="all-races">All Races ({raceEvents.length})</TabsTrigger>
            <TabsTrigger value="ai-import">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Race Import
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending {pendingEvents.length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{pendingEvents.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="duplicates">
              <Users className="h-3.5 w-3.5 mr-1" /> Duplicates {(duplicateCount + teamDuplicateCount + circuitDuplicateCount) > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{duplicateCount + teamDuplicateCount + circuitDuplicateCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="claims">
              Claims {pendingClaims.length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{pendingClaims.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="flags">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Flags {flagCount > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs">{flagCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="reports">
              <Flag className="h-3.5 w-3.5 mr-1" /> Reports {reports.filter((r: any) => r.status === "pending").length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{reports.filter((r: any) => r.status === "pending").length}</span>}
            </TabsTrigger>
            <TabsTrigger value="import-sources">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sources ({importSources.length})
            </TabsTrigger>
            <TabsTrigger value="community">
              <Send className="h-3.5 w-3.5 mr-1" /> Community {communitySubmissions.filter((s: any) => s.status === "pending").length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{communitySubmissions.filter((s: any) => s.status === "pending").length}</span>}
            </TabsTrigger>
            <TabsTrigger value="edit-queue">
              <PenLine className="h-3.5 w-3.5 mr-1" /> Edit Queue {editQueue.filter((e: any) => e.status === "pending").length > 0 && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{editQueue.filter((e: any) => e.status === "pending").length}</span>}
            </TabsTrigger>
            <TabsTrigger value="roles">Manage Roles</TabsTrigger>
          </TabsList>


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
