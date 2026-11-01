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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Race highlights"
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-card-foreground">Race highlights</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Session tabs if multiple */}
        {sessions.length > 1 && (
          <div className="flex overflow-x-auto border-b bg-background/40">
            {sessions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                className={`relative h-10 shrink-0 whitespace-nowrap px-4 font-display text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                  activeIdx === idx ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.name}
                <span className={`absolute inset-x-0 top-0 h-0.5 ${activeIdx === idx ? "bg-signal" : "bg-transparent"}`} />
              </button>
            ))}
          </div>
        )}

        {/* Video */}
        <div className="bg-black">
          {videoId ? (
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={active.name}
              />
            </div>
          ) : (
            <div className="bg-card py-16 text-center text-sm text-muted-foreground">
              <p>Invalid video URL</p>
              <a href={active.highlights_url} target="_blank" rel="noopener" className="mt-2 block text-xs text-primary hover:underline">
                Open in new tab →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
