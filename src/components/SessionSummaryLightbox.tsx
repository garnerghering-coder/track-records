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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl mx-4 max-h-[80vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-card-foreground">Session Summary</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Manila folder tabs */}
        <div className="px-6 flex gap-0 border-b border-border overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-xs font-semibold whitespace-nowrap border border-b-0 rounded-t-lg transition-colors -mb-px ${
                activeTab === tab.key
                  ? "bg-card border-border text-foreground z-10"
                  : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading summary…</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : activeSummary ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <MarkdownRenderer content={activeSummary.summary_markdown} />
              <p className="text-[10px] text-muted-foreground/50 mt-6">
                Generated {new Date(activeSummary.generated_at).toLocaleDateString()} • AI-generated content may not be fully accurate
              </p>
            </div>
          ) : summaries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No summaries have been generated yet. Summaries can be generated from the manage panel.
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No summary available for this session.
            </div>
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
          return <p key={i} className="text-sm text-muted-foreground leading-relaxed pl-4" dangerouslySetInnerHTML={{ __html: "• " + processed.replace(/^[-•]\s/, '') }} />;
        }
        // Headers
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-base font-bold text-foreground mt-3" dangerouslySetInnerHTML={{ __html: processed.slice(4) }} />;
        }
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-lg font-bold text-foreground mt-4" dangerouslySetInnerHTML={{ __html: processed.slice(3) }} />;
        }
        if (line.startsWith("# ")) {
          return <h1 key={i} className="text-xl font-bold text-foreground mt-4" dangerouslySetInnerHTML={{ __html: processed.slice(2) }} />;
        }
        return <p key={i} className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />;
      })}
    </div>
  );
}
