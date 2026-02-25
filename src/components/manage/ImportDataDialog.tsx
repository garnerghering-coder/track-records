import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, MessageSquare, CheckCircle, AlertTriangle, Bug, Wrench } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  seriesAliases: string[];
  onImportComplete: () => void;
  onF1Import: (url: string) => void;
}

export default function ImportDataDialog({ open, onOpenChange, eventId, seriesAliases, onImportComplete, onF1Import }: ImportDataDialogProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("import");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [matchedParser, setMatchedParser] = useState<any>(null);
  const [manualParserId, setManualParserId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  // Parser induction state (Parsers tab)
  const [induceUrl, setInduceUrl] = useState("");
  const [inducting, setInducting] = useState(false);
  const [inductionResult, setInductionResult] = useState<any>(null);

  // Debug chat state
  const [debugMessages, setDebugMessages] = useState<Array<{ role: string; content: string; suggestedConfig?: any }>>(
    [],
  );
  const [debugInput, setDebugInput] = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [selectedParser, setSelectedParser] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [applyingFix, setApplyingFix] = useState(false);

  // Load source definitions
  const { data: parsers = [] } = useQuery({
    queryKey: ["source_definitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("source_definitions" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  // Load recent import runs
  const { data: recentRuns = [] } = useQuery({
    queryKey: ["import_runs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_runs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as any[];
    },
    enabled: open && tab === "debug",
  });

  const hasAlias = (alias: string) => seriesAliases.includes(alias.toUpperCase());

  /** Auto-detect parser from URL */
  const detectParser = (inputUrl: string) => {
    if (!inputUrl) {
      setMatchedParser(null);
      return;
    }
    for (const p of parsers) {
      try {
        if (new RegExp(p.url_pattern, "i").test(inputUrl)) {
          setMatchedParser(p);
          setManualParserId(null);
          return;
        }
      } catch {
        /* invalid regex */
      }
    }
    setMatchedParser(null);
  };

  const handleUrlChange = (v: string) => {
    setUrl(v);
    detectParser(v);
    setResult(null);
    setPreviewData(null);
    setManualParserId(null);
  };

  /** Get the effective parser (auto-detected or manually selected) */
  const getEffectiveParser = () => {
    if (manualParserId) return parsers.find((p: any) => p.id === manualParserId) || null;
    return matchedParser;
  };

  /** Run import using matched parser — fully deterministic, no AI */
  const handleImport = async (mode: "preview" | "commit" = "preview") => {
    if (!url.trim()) return;
    const parser = getEffectiveParser();
    if (!parser) {
      toast.error("No parser selected. Go to the Parsers tab to create one for this source.");
      return;
    }

    setLoading(true);
    setResult(null);
    setPreviewData(null);

    try {
      if (parser.parser_type === "builtin_f1") {
        onF1Import(url.trim());
        onOpenChange(false);
        return;
      }

      if (parser.parser_type === "builtin_imsa") {
        const { data, error } = await supabase.functions.invoke("import-imsa-results", {
          body: { url: url.trim(), event_id: eventId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setResult(data);
        onImportComplete();
        toast.success(`Imported ${data.sessions_created} session(s) with ${data.total_entries} entries`);
        return;
      }

      // AI-induced parser — execute deterministically
      const { data, error } = await supabase.functions.invoke("execute-parser", {
        body: { url: url.trim(), source_definition_id: parser.id, event_id: eventId, mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (mode === "preview") {
        setPreviewData(data);
      } else {
        setResult(data);
        onImportComplete();
        toast.success(`Imported ${data.total_entries} entries`);
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  /** Induce a new parser from URL (Parsers tab) */
  const handleInduceParser = async () => {
    if (!induceUrl.trim()) return;
    setInducting(true);
    setInductionResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("induce-parser", {
        body: { url: induceUrl.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInductionResult(data);
      qc.invalidateQueries({ queryKey: ["source_definitions"] });
      toast.success(`Parser "${data.name}" created! Review the sample results below.`);
    } catch (e: any) {
      toast.error(e.message || "Parser induction failed");
      setInductionResult({ error: e.message });
    } finally {
      setInducting(false);
    }
  };

  /** Activate a draft parser */
  const handleActivateParser = async (parserId: string) => {
    const { error } = await supabase
      .from("source_definitions" as any)
      .update({ status: "active" })
      .eq("id", parserId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["source_definitions"] });
    toast.success("Parser activated!");
  };

  /** Apply a suggested config fix from AI debug — increments version */
  const handleApplyFix = async (suggestedConfig: any) => {
    if (!selectedParser || !suggestedConfig) return;
    setApplyingFix(true);
    try {
      const currentParser = parsers.find((p: any) => p.id === selectedParser);
      const currentVersion = currentParser?.version || 1;
      const currentConfig = (currentParser?.config as any) || {};

      // Merge suggested config into existing config
      const mergedConfig = { ...currentConfig, ...suggestedConfig };

      const { error } = await supabase
        .from("source_definitions" as any)
        .update({
          config: mergedConfig,
          version: currentVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedParser);

      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["source_definitions"] });
      setDebugMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `✅ Config updated to v${currentVersion + 1}. The fix has been applied.`,
        },
      ]);
      toast.success(`Parser updated to v${currentVersion + 1}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to apply fix");
    } finally {
      setApplyingFix(false);
    }
  };

  /** Send debug chat message */
  const handleDebugSend = async () => {
    if (!debugInput.trim() || !selectedParser) return;
    const userMsg = debugInput.trim();
    setDebugMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setDebugInput("");
    setDebugLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("repair-parser", {
        body: {
          source_definition_id: selectedParser,
          import_run_id: selectedRun,
          user_message: userMsg,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setDebugMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          suggestedConfig: data.suggested_config || null,
        },
      ]);
    } catch (e: any) {
      setDebugMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setDebugLoading(false);
    }
  };

  const resetState = () => {
    setUrl("");
    setResult(null);
    setMatchedParser(null);
    setManualParserId(null);
    setPreviewData(null);
    setInduceUrl("");
    setInductionResult(null);
    setDebugMessages([]);
    setSelectedParser(null);
    setSelectedRun(null);
  };

  const effectiveParser = getEffectiveParser();
  const activeParsers = parsers.filter((p: any) => p.status === "active" || p.parser_type?.startsWith("builtin"));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading && !inducting) {
          onOpenChange(v);
          if (!v) resetState();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="import">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Import
            </TabsTrigger>
            <TabsTrigger value="parsers">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Parsers
            </TabsTrigger>
            <TabsTrigger value="debug">
              <Bug className="h-3.5 w-3.5 mr-1.5" />
              Debug
            </TabsTrigger>
          </TabsList>

          {/* ───── IMPORT TAB (AI-free) ───── */}
          <TabsContent value="import" className="flex-1 overflow-auto space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a results URL. The system will auto-detect the parser, or pick one manually.
            </p>

            <div>
              <Label>Results URL</Label>
              <Input
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://results.example.com/race/2025/..."
                disabled={loading}
              />
            </div>

            {/* Auto-detected parser */}
            {matchedParser && !manualParserId && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span>
                  Auto-detected: <span className="font-medium">{matchedParser.name}</span>
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {matchedParser.parser_type}
                </Badge>
              </div>
            )}

            {/* No auto-match — show manual picker */}
            {url && !matchedParser && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>No parser auto-detected. Select one manually or create a new parser in the Parsers tab.</span>
                </div>
                {activeParsers.length > 0 && (
                  <div>
                    <Label>Select Parser</Label>
                    <Select value={manualParserId || ""} onValueChange={(v) => setManualParserId(v || null)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a parser…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeParsers.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} (v{p.version})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Manual override even when auto-detected */}
            {url && matchedParser && (
              <div>
                <button
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setManualParserId(manualParserId ? null : matchedParser?.id || "")}
                >
                  {manualParserId ? "Use auto-detected parser" : "Override parser selection"}
                </button>
                {manualParserId !== null && manualParserId !== matchedParser?.id && (
                  <div className="mt-2">
                    <Select value={manualParserId || ""} onValueChange={(v) => setManualParserId(v || null)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a parser…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeParsers.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} (v{p.version})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing data…
                </div>
                <Progress value={undefined} className="h-2" />
              </div>
            )}

            {/* Preview results */}
            {previewData && !previewData.error && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                  <p className="font-medium">Preview: {previewData.rows_extracted} rows extracted</p>
                  {previewData.validation_errors?.length > 0 && (
                    <div className="text-destructive">
                      {previewData.validation_errors.map((e: any, i: number) => (
                        <p key={i}>⚠ {e.type}: {JSON.stringify(e)}</p>
                      ))}
                    </div>
                  )}
                </div>
                <ScrollArea className="h-48">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="p-1 text-left">Pos</th>
                        <th className="p-1 text-left">Driver</th>
                        <th className="p-1 text-left">Team</th>
                        <th className="p-1 text-left">#</th>
                        <th className="p-1 text-left">Gap</th>
                        <th className="p-1 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.sample_results?.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="p-1">{r.position || "—"}</td>
                          <td className="p-1">{r.driver_name || "—"}</td>
                          <td className="p-1">{r.team_name || "—"}</td>
                          <td className="p-1">{r.car_number || "—"}</td>
                          <td className="p-1">{r.gap_to_leader || "—"}</td>
                          <td className="p-1">{r.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
                <Button onClick={() => handleImport("commit")} disabled={loading}>
                  Confirm & Import {previewData.rows_extracted} entries
                </Button>
              </div>
            )}

            {/* Final results */}
            {result && !result.error && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                <p className="font-medium text-foreground">✓ Import complete</p>
                <p>
                  {result.sessions_created || 1} session(s), {result.total_entries || result.entriesCount || 0} entries
                </p>
                {result.drivers_matched != null && (
                  <p>
                    {result.drivers_matched} drivers matched, {result.drivers_created} created
                  </p>
                )}
                {result.teams_matched != null && (
                  <p>
                    {result.teams_matched} teams matched, {result.teams_created} created
                  </p>
                )}
              </div>
            )}

            {result?.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {result.error}
              </div>
            )}

            <div className="flex gap-2">
              {(!result || result.error) && !previewData && (
                <Button
                  onClick={() =>
                    handleImport(effectiveParser?.parser_type === "ai_induced" ? "preview" : "commit")
                  }
                  disabled={!url.trim() || !effectiveParser || loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    "Import"
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* ───── PARSERS TAB (AI induction lives here) ───── */}
          <TabsContent value="parsers" className="flex-1 overflow-auto space-y-4">
            <p className="text-sm text-muted-foreground">
              Create new parsers using AI to analyze a sample page, or manage existing ones. Once created, parsers run deterministically without AI.
            </p>

            {/* Induce new parser */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Create New Parser
              </h3>
              <p className="text-xs text-muted-foreground">
                Paste a sample results URL. AI will analyze the page structure once to create a reusable, deterministic parser definition.
              </p>
              <div>
                <Label>Sample URL</Label>
                <Input
                  value={induceUrl}
                  onChange={(e) => setInduceUrl(e.target.value)}
                  placeholder="https://results.example.com/race/2025/..."
                  disabled={inducting}
                />
              </div>
              <Button onClick={handleInduceParser} disabled={!induceUrl.trim() || inducting}>
                {inducting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Analyze & Create Parser
                  </>
                )}
              </Button>

              {/* Induction result */}
              {inductionResult && !inductionResult.error && (
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2 text-sm">
                  <p className="font-medium">✓ Parser "{inductionResult.name}" created</p>
                  <p>
                    Method: {inductionResult.extraction_method}, {inductionResult.field_count} fields mapped
                  </p>
                  {inductionResult.sample_results?.length > 0 && (
                    <>
                      <p className="font-medium mt-2">Sample parse:</p>
                      <ScrollArea className="h-32">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="p-1 text-left">Pos</th>
                              <th className="p-1 text-left">Driver</th>
                              <th className="p-1 text-left">Team</th>
                              <th className="p-1 text-left">#</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inductionResult.sample_results.map((r: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="p-1">{r.position || "—"}</td>
                                <td className="p-1">{r.driver_name || "—"}</td>
                                <td className="p-1">{r.team_name || "—"}</td>
                                <td className="p-1">{r.car_number || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollArea>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleActivateParser(inductionResult.source_definition_id)}>
                          Approve & Activate
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {inductionResult?.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {inductionResult.error}
                </div>
              )}
            </div>

            {/* Existing parsers list */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Existing Parsers</h3>
              {parsers.length === 0 && <p className="text-sm text-muted-foreground">No parsers configured yet.</p>}
              {parsers.map((p: any) => (
                <div key={p.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {p.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {p.parser_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        v{p.version}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{p.url_pattern}</p>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  <div className="flex gap-2 pt-1">
                    {p.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleActivateParser(p.id)}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelectedParser(p.id);
                        setTab("debug");
                      }}
                    >
                      <Bug className="h-3 w-3 mr-1" />
                      Debug
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ───── DEBUG TAB ───── */}
          <TabsContent value="debug" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="space-y-2">
              <Label>Select Parser</Label>
              <Select value={selectedParser || ""} onValueChange={(v) => { setSelectedParser(v || null); setDebugMessages([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a parser…" />
                </SelectTrigger>
                <SelectContent>
                  {parsers
                    .filter((p) => p.parser_type !== "builtin_f1" && p.parser_type !== "builtin_imsa")
                    .map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (v{p.version})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedParser &&
              recentRuns.filter((r) => r.source_definition_id === selectedParser).length > 0 && (
                <div className="space-y-2">
                  <Label>Import Run (optional context)</Label>
                  <Select value={selectedRun || ""} onValueChange={(v) => setSelectedRun(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {recentRuns
                        .filter((r) => r.source_definition_id === selectedParser)
                        .map((r: any) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.url?.slice(0, 50)} — {r.status} ({new Date(r.created_at).toLocaleDateString()})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            <ScrollArea className="flex-1 min-h-[200px] rounded-lg border border-border p-3 space-y-2">
              {debugMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedParser
                    ? "Describe the issue you're seeing with this parser…"
                    : "Select a parser above to start debugging."}
                </p>
              )}
              {debugMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-sm p-2 rounded-lg mb-2 ${
                    msg.role === "user"
                      ? "bg-primary/10 ml-8"
                      : msg.role === "system"
                        ? "bg-accent/50"
                        : "bg-muted mr-8"
                  }`}
                >
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">
                    {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "AI"}
                  </p>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {/* Apply Fix button when AI suggests config changes */}
                  {msg.suggestedConfig && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => handleApplyFix(msg.suggestedConfig)}
                      disabled={applyingFix}
                    >
                      {applyingFix ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Wrench className="h-3 w-3 mr-1" />
                      )}
                      Apply Suggested Fix
                    </Button>
                  )}
                </div>
              ))}
              {debugLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                value={debugInput}
                onChange={(e) => setDebugInput(e.target.value)}
                placeholder={selectedParser ? "Describe the issue…" : "Select a parser first"}
                disabled={!selectedParser || debugLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleDebugSend();
                  }
                }}
              />
              <Button
                onClick={handleDebugSend}
                disabled={!selectedParser || !debugInput.trim() || debugLoading}
                size="icon"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetState();
            }}
            disabled={loading || inducting}
          >
            {result && !result.error ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
