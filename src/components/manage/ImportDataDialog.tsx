import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Download, Sparkles, MessageSquare, CheckCircle, AlertTriangle, Bug } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  seriesAliases: string[];
  onImportComplete: () => void;
  /** Pass through existing F1 import handler */
  onF1Import: (url: string) => void;
}

export default function ImportDataDialog({ open, onOpenChange, eventId, seriesAliases, onImportComplete, onF1Import }: ImportDataDialogProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("import");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [matchedParser, setMatchedParser] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  // Parser induction state
  const [inducting, setInducting] = useState(false);
  const [inductionResult, setInductionResult] = useState<any>(null);

  // Debug chat state
  const [debugMessages, setDebugMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [debugInput, setDebugInput] = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [selectedParser, setSelectedParser] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

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
      const { data, error } = await supabase.from("import_runs" as any).select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data as any[];
    },
    enabled: open && tab === "debug",
  });

  const hasAlias = (alias: string) => seriesAliases.includes(alias.toUpperCase());

  /** Auto-detect parser from URL */
  const detectParser = (inputUrl: string) => {
    if (!inputUrl) { setMatchedParser(null); return; }
    for (const p of parsers) {
      try {
        if (new RegExp(p.url_pattern, "i").test(inputUrl)) {
          setMatchedParser(p);
          return;
        }
      } catch { /* invalid regex */ }
    }
    setMatchedParser(null);
  };

  const handleUrlChange = (v: string) => {
    setUrl(v);
    detectParser(v);
    setResult(null);
    setPreviewData(null);
  };

  /** Run import using matched parser */
  const handleImport = async (mode: "preview" | "commit" = "preview") => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setPreviewData(null);

    try {
      if (matchedParser) {
        if (matchedParser.parser_type === "builtin_f1") {
          // Route to existing F1 importer
          onF1Import(url.trim());
          onOpenChange(false);
          return;
        }

        if (matchedParser.parser_type === "builtin_imsa") {
          // Route to existing IMSA importer
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

        // AI-induced parser - use execute-parser
        const { data, error } = await supabase.functions.invoke("execute-parser", {
          body: { url: url.trim(), source_definition_id: matchedParser.id, event_id: eventId, mode },
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
      } else {
        // No parser matched - try AI scrape fallback
        const { data, error } = await supabase.functions.invoke("scrape-race-results", {
          body: { url: url.trim() },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setResult(data);
        onImportComplete();
        toast.success(`Imported ${data.entriesCount} entries via AI scrape`);
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  /** Induce a new parser from URL */
  const handleInduceParser = async () => {
    if (!url.trim()) return;
    setInducting(true);
    setInductionResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("induce-parser", {
        body: { url: url.trim() },
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
    const { error } = await supabase.from("source_definitions" as any).update({ status: "active" }).eq("id", parserId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["source_definitions"] });
    toast.success("Parser activated!");
  };

  /** Send debug chat message */
  const handleDebugSend = async () => {
    if (!debugInput.trim() || !selectedParser) return;
    const userMsg = debugInput.trim();
    setDebugMessages(prev => [...prev, { role: "user", content: userMsg }]);
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
      setDebugMessages(prev => [...prev, { role: "assistant", content: data.reply }]);

      // If there's a suggested config, offer to apply it
      if (data.suggested_config) {
        setDebugMessages(prev => [...prev, {
          role: "system",
          content: `💡 Suggested config changes detected. Use "Apply suggested fix" button to update the parser.`,
        }]);
      }
    } catch (e: any) {
      setDebugMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setDebugLoading(false);
    }
  };

  const resetState = () => {
    setUrl("");
    setResult(null);
    setMatchedParser(null);
    setPreviewData(null);
    setInductionResult(null);
    setDebugMessages([]);
    setSelectedParser(null);
    setSelectedRun(null);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!loading && !inducting) { onOpenChange(v); if (!v) resetState(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Import Data</DialogTitle></DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="import"><Download className="h-3.5 w-3.5 mr-1.5" />Import</TabsTrigger>
            <TabsTrigger value="parsers"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Parsers</TabsTrigger>
            <TabsTrigger value="debug"><Bug className="h-3.5 w-3.5 mr-1.5" />Debug</TabsTrigger>
          </TabsList>

          {/* IMPORT TAB */}
          <TabsContent value="import" className="flex-1 overflow-auto space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a results URL. The system will auto-detect the parser to use, or you can create a new one.
            </p>

            <div>
              <Label>Results URL</Label>
              <Input
                value={url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="https://results.example.com/race/2025/..."
                disabled={loading}
              />
            </div>

            {matchedParser && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Matched parser: <span className="font-medium">{matchedParser.name}</span></span>
                <Badge variant="outline" className="text-[10px]">{matchedParser.parser_type}</Badge>
              </div>
            )}

            {url && !matchedParser && parsers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>No parser matches this URL. You can import via AI scrape or create a new parser.</span>
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
                    <div className="text-amber-600">
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
                <p>{result.sessions_created || 1} session(s), {result.total_entries || result.entriesCount || 0} entries</p>
                {result.drivers_matched != null && <p>{result.drivers_matched} drivers matched, {result.drivers_created} created</p>}
                {result.teams_matched != null && <p>{result.teams_matched} teams matched, {result.teams_created} created</p>}
              </div>
            )}

            {result?.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {result.error}
              </div>
            )}

            <div className="flex gap-2">
              {(!result || result.error) && !previewData && (
                <>
                  <Button
                    onClick={() => handleImport(matchedParser?.parser_type === "ai_induced" ? "preview" : "commit")}
                    disabled={!url.trim() || loading}
                  >
                    {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : matchedParser ? "Import" : "AI Scrape Import"}
                  </Button>
                  {!matchedParser && url.trim() && (
                    <Button variant="outline" onClick={handleInduceParser} disabled={inducting || loading}>
                      {inducting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analyzing…</> : <><Sparkles className="h-4 w-4 mr-1" />Create Parser</>}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Induction result */}
            {inductionResult && !inductionResult.error && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2 text-sm">
                <p className="font-medium">✓ Parser "{inductionResult.name}" created</p>
                <p>Method: {inductionResult.extraction_method}, {inductionResult.field_count} fields mapped</p>
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
                        Approve & Activate Parser
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setMatchedParser({ ...inductionResult, id: inductionResult.source_definition_id, parser_type: "ai_induced" }); setInductionResult(null); }}>
                        Test Import with this Parser
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
          </TabsContent>

          {/* PARSERS TAB */}
          <TabsContent value="parsers" className="flex-1 overflow-auto space-y-3">
            <p className="text-sm text-muted-foreground">
              Manage saved parser definitions. Active parsers are auto-detected when you paste a URL.
            </p>
            {parsers.length === 0 && <p className="text-sm text-muted-foreground">No parsers configured yet.</p>}
            {parsers.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">{p.status}</Badge>
                    <Badge variant="outline" className="text-[10px]">{p.parser_type}</Badge>
                    <Badge variant="outline" className="text-[10px]">v{p.version}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{p.url_pattern}</p>
                {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                <div className="flex gap-2 pt-1">
                  {p.status === "draft" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleActivateParser(p.id)}>
                      Activate
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedParser(p.id); setTab("debug"); }}>
                    <Bug className="h-3 w-3 mr-1" />Debug
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* DEBUG TAB */}
          <TabsContent value="debug" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="space-y-2">
              <Label>Select Parser</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedParser || ""}
                onChange={e => { setSelectedParser(e.target.value || null); setDebugMessages([]); }}
              >
                <option value="">Choose a parser…</option>
                {parsers.filter(p => p.parser_type !== "builtin_f1" && p.parser_type !== "builtin_imsa").map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>
                ))}
              </select>
            </div>

            {selectedParser && recentRuns.filter(r => r.source_definition_id === selectedParser).length > 0 && (
              <div className="space-y-2">
                <Label>Import Run (optional context)</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedRun || ""}
                  onChange={e => setSelectedRun(e.target.value || null)}
                >
                  <option value="">None</option>
                  {recentRuns.filter(r => r.source_definition_id === selectedParser).map((r: any) => (
                    <option key={r.id} value={r.id}>{r.url?.slice(0, 50)} — {r.status} ({new Date(r.created_at).toLocaleDateString()})</option>
                  ))}
                </select>
              </div>
            )}

            <ScrollArea className="flex-1 min-h-[200px] rounded-lg border border-border p-3 space-y-2">
              {debugMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedParser ? "Describe the issue you're seeing with this parser…" : "Select a parser above to start debugging."}
                </p>
              )}
              {debugMessages.map((msg, i) => (
                <div key={i} className={`text-sm p-2 rounded-lg mb-2 ${msg.role === "user" ? "bg-primary/10 ml-8" : msg.role === "system" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted mr-8"}`}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{msg.role === "user" ? "You" : msg.role === "system" ? "System" : "AI"}</p>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
              {debugLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Analyzing…
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                value={debugInput}
                onChange={e => setDebugInput(e.target.value)}
                placeholder={selectedParser ? "Describe the issue…" : "Select a parser first"}
                disabled={!selectedParser || debugLoading}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleDebugSend(); } }}
              />
              <Button onClick={handleDebugSend} disabled={!selectedParser || !debugInput.trim() || debugLoading} size="icon">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetState(); }} disabled={loading || inducting}>
            {(result && !result.error) ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
