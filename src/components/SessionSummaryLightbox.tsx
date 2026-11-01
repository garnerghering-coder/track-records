import { useState, useEffect } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Summary {
  tab_key: string;
  session_id: string | null;
  summary_markdown: string;
  generated_at: string;
}

interface SessionSummaryLightboxProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  sessions: any[];
}

export default function SessionSummaryLightbox({ open, onClose, eventId, sessions }: SessionSummaryLightboxProps) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overall");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchSummaries();
  }, [open, eventId]);

  const fetchSummaries = async () => {
    setLoading(true);
    setError(null);
    try {
      // Only fetch cached summaries — no generation from the public view
      const { data, error: fetchErr } = await supabase
        .from("v2_session_summaries")
        .select("*")
        .eq("event_id", eventId);
      if (fetchErr) throw fetchErr;
      setSummaries(data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const tabs = [
    { key: "overall", label: "Overall" },
    ...sessions.map((s: any) => ({ key: s.id, label: s.name })),
  ];

  const activeSummary = summaries.find(s => s.tab_key === activeTab);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session summary"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-card-foreground">Session summary</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b bg-background/40" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative h-10 shrink-0 whitespace-nowrap border-r px-4 font-display text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                activeTab === tab.key ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`absolute inset-x-0 top-0 h-0.5 ${activeTab === tab.key ? "bg-signal" : "bg-transparent"}`} />
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[300px] flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading summary…</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : activeSummary ? (
            <div className="max-w-none">
              <MarkdownRenderer content={activeSummary.summary_markdown} />
              <p className="mt-6 border-t pt-3 text-[11px] text-muted-foreground">
                Generated <span className="num">{new Date(activeSummary.generated_at).toLocaleDateString()}</span> · AI-generated content may not be fully accurate
              </p>
            </div>
          ) : summaries.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No summaries have been generated yet. Summaries can be generated from the manage panel.</div>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">No summary available for this session.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Markdown renderer (bold, headers, lists, line breaks)
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        // Bold text
        const processed = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>');
        // List items
        if (line.match(/^[-•]\s/)) {
          return <p key={i} className="relative pl-4 text-sm leading-relaxed text-muted-foreground before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:bg-primary" dangerouslySetInnerHTML={{ __html: processed.replace(/^[-•]\s/, '') }} />;
        }
        // Headers
        if (line.startsWith("### ")) {
          return <h3 key={i} className="mt-4 font-display text-base font-bold uppercase tracking-wide text-foreground" dangerouslySetInnerHTML={{ __html: processed.slice(4) }} />;
        }
        if (line.startsWith("## ")) {
          return <h2 key={i} className="mt-5 font-display text-lg font-bold uppercase tracking-wide text-foreground" dangerouslySetInnerHTML={{ __html: processed.slice(3) }} />;
        }
        if (line.startsWith("# ")) {
          return <h1 key={i} className="mt-5 font-display text-xl font-bold uppercase tracking-wide text-foreground" dangerouslySetInnerHTML={{ __html: processed.slice(2) }} />;
        }
        return <p key={i} className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />;
      })}
    </div>
  );
}
