import { useState } from "react";
import { X, Play } from "lucide-react";

interface HighlightsLightboxProps {
  open: boolean;
  onClose: () => void;
  sessions: { name: string; highlights_url: string }[];
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/
  );
  return match?.[1] || null;
}

export default function HighlightsLightbox({ open, onClose, sessions }: HighlightsLightboxProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!open || sessions.length === 0) return null;

  const active = sessions[activeIdx] || sessions[0];
  const videoId = extractYoutubeId(active.highlights_url);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl mx-4 rounded-xl border border-border bg-card shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-card-foreground">Race Highlights</h2>
          </div>
          <button
            onClick={onClose}
            className="cursor-target text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Session tabs if multiple */}
        {sessions.length > 1 && (
          <div className="px-6 flex gap-0 border-b border-border overflow-x-auto">
            {sessions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                className={`cursor-target px-4 py-2 text-xs font-semibold whitespace-nowrap border border-b-0 rounded-t-lg transition-colors -mb-px ${
                  activeIdx === idx
                    ? "bg-card border-border text-foreground z-10"
                    : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Video */}
        <div className="p-4">
          {videoId ? (
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full rounded-lg"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={active.name}
              />
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <p>Invalid video URL</p>
              <a href={active.highlights_url} target="_blank" rel="noopener" className="text-primary hover:underline text-xs mt-2 block">
                Open in new tab →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
