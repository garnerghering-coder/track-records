import { Link } from "react-router-dom";
import { Trophy, Calendar } from "lucide-react";
import { formatDateRange } from "@/lib/date-utils";
import FlagImage from "@/components/FlagImage";

export interface EventCardEvent {
  id: string;
  name: string;
  series?: string;
  year?: number;
  circuitName: string | null;
  country: string | null;
  date: string | null;
  endDate: string | null;
}

export interface PodiumEntry {
  driverId: string;
  name: string;
  position: number;
}

const PODIUM_COLORS: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-gray-300/15 text-gray-300 border-gray-400/40",
  3: "bg-amber-700/20 text-amber-600 border-amber-700/40",
};

function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

interface EventCardProps {
  event: EventCardEvent;
  podium?: PodiumEntry[];
  showSeries?: boolean;
}

const EventCard = ({ event, podium = [], showSeries = false }: EventCardProps) => {
  const sortedPodium = [...podium].sort((a, b) => a.position - b.position);
  const location = event.circuitName
    ? `${event.circuitName}${event.country ? `, ${event.country}` : ""}`
    : null;

  return (
    <Link
      to={`/events/${event.id}`}
      className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <FlagImage nationality={event.country} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
            {event.name}
          </h3>
          {showSeries && event.series && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {event.series}{event.year ? ` · ${event.year}` : ""}
            </p>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {location && <span className="truncate">{location}</span>}
            {event.date && (
              <span className="shrink-0 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateRange(event.date, event.endDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      {sortedPodium.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
          {sortedPodium.map((p) => (
            <span
              key={p.position}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PODIUM_COLORS[p.position] || ""}`}
            >
              <Trophy className="h-2.5 w-2.5" />
              <span className="opacity-60">P{p.position}</span>
              <span className="truncate max-w-[80px]">{shortenName(p.name)}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
};

export default EventCard;
