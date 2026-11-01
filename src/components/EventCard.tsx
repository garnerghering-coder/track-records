import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";
import { shortName, type ClassWinner } from "@/lib/race-data";

export interface EventCardEvent {
  id: string;
  name: string;
  series?: string;
  /** Short series label (e.g. "IMSA") — preferred over `series` in the kicker */
  seriesShort?: string | null;
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

/** Shared column template so list headers line up with rows. */
export const EVENT_ROW_GRID =
  "grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 md:gap-x-4 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,22rem)_1rem] lg:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,26rem)_1rem]";

const toDate = (s: string) => new Date(s + (s.includes("T") ? "" : "T00:00:00Z"));
const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

/** "Jan 21–25", "Jul 31–Aug 3", "Jan 21" — no year (rows sit under a year/month header). */
export function shortDateRange(start: string | null | undefined, end?: string | null): string {
  if (!start) return "TBA";
  const a = toDate(start);
  if (!end || end === start) return `${mon(a)} ${a.getUTCDate()}`;
  const b = toDate(end);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${mon(a)} ${a.getUTCDate()}–${b.getUTCDate()}`;
  return `${mon(a)} ${a.getUTCDate()}–${mon(b)} ${b.getUTCDate()}`;
}

/** Drop a leading "2025 " from event names when the year is already given by a group header. */
export const stripYear = (name: string) => name.replace(/^\d{4}\s+/, "");

/** Column header row for a list of EventCard rows. */
export function EventListHead({ lead = "Date", winners = "Class winners" }: { lead?: ReactNode; winners?: ReactNode }) {
  return (
    <div className={cn(EVENT_ROW_GRID, "hidden h-9 items-center bg-card px-4 md:grid")}>
      <span className="label-caps">{lead}</span>
      <span className="label-caps">Event</span>
      <span className="label-caps">{winners}</span>
      <span />
    </div>
  );
}

/** One line per class winner: class colour tick, class, car, drivers. */
export function WinnerLines({
  winners,
  colors,
  max = 6,
}: {
  winners?: ClassWinner[];
  colors?: Record<string, string>;
  max?: number;
}) {
  if (!winners) {
    return (
      <div className="space-y-1.5" aria-hidden>
        <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-3/5 animate-pulse rounded-sm bg-muted" />
      </div>
    );
  }
  const firsts = winners.filter((w) => w.classPosition === 1).slice(0, max);
  if (firsts.length === 0) return <span className="text-xs text-muted-foreground">Classification pending</span>;
  return (
    <div className="space-y-1">
      {firsts.map((w, i) => (
        <div key={i} className="flex min-w-0 items-center gap-2 text-xs leading-5">
          <span className="h-3 w-0.5 shrink-0" style={{ backgroundColor: getClassColor(w.className, colors) }} />
          <span className="w-14 shrink-0 truncate font-display font-bold uppercase tracking-wider text-muted-foreground">
            {w.className || "Winner"}
          </span>
          <span className="num w-9 shrink-0 text-right text-muted-foreground">{w.carNumber ? `#${w.carNumber}` : ""}</span>
          <span className="min-w-0 truncate text-foreground">{w.drivers.map((d) => shortName(d.name)).join(" / ") || "—"}</span>
        </div>
      ))}
    </div>
  );
}

interface EventCardProps {
  event: EventCardEvent;
  /** Legacy podium list (overall P1–P3); used only when `winners` is not given */
  podium?: PodiumEntry[];
  /** Class winners from fetchClassWinners — undefined while loading */
  winners?: ClassWinner[];
  /** Season class colour overrides */
  colors?: Record<string, string>;
  showSeries?: boolean;
  /** Replace the default date cell (e.g. round number + date, or a calendar day block) */
  lead?: ReactNode;
  /** Replace the winners cell (e.g. an "Upcoming" marker) */
  aside?: ReactNode;
  /** Strip the leading year from the event name */
  hideYear?: boolean;
  className?: string;
}

/**
 * A single event as a hairline-ruled data row:
 * date · series / event / circuit · class winners · chevron.
 * Place rows inside `grid gap-px bg-border` (or `divide-y`) containers.
 */
const EventCard = ({ event, podium, winners, colors, showSeries = false, lead, aside, hideYear, className }: EventCardProps) => {
  const seriesLabel = event.seriesShort || event.series;
  const name = hideYear ? stripYear(event.name) : event.name;

  let right: ReactNode = aside;
  if (right === undefined) {
    if (winners !== undefined || !podium) right = <WinnerLines winners={winners} colors={colors} />;
    else if (podium.length > 0)
      right = (
        <div className="space-y-1">
          {[...podium]
            .sort((a, b) => a.position - b.position)
            .map((p) => (
              <div key={p.position} className="flex items-center gap-2 text-xs leading-5">
                <span className="num w-6 shrink-0 text-muted-foreground">P{p.position}</span>
                <span className="truncate">{shortName(p.name)}</span>
              </div>
            ))}
        </div>
      );
  }

  return (
    <Link
      to={`/events/${event.id}`}
      className={cn(EVENT_ROW_GRID, "group gap-y-2.5 bg-card px-4 py-3.5 transition-colors hover:bg-accent/60 md:items-center", className)}
    >
      <div className="min-w-0 self-start md:self-center">
        {lead ?? (
          <div className="num text-xs leading-tight text-foreground md:text-[13px]">
            {shortDateRange(event.date, event.endDate)}
            {!hideYear && event.year ? <div className="text-xs text-muted-foreground">{event.year}</div> : null}
          </div>
        )}
      </div>

      <div className="min-w-0">
        {showSeries && seriesLabel && <div className="label-caps mb-0.5 truncate text-primary">{seriesLabel}</div>}
        <div className="font-display text-base font-bold uppercase leading-tight text-foreground transition-colors group-hover:text-primary">
          {name}
        </div>
        {event.circuitName && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {event.country && <FlagImage nationality={event.country} size={14} />}
            <span className="truncate">{event.circuitName}</span>
          </div>
        )}
      </div>

      <div className="col-start-2 min-w-0 md:col-start-auto">{right}</div>

      <ChevronRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground md:block" />
    </Link>
  );
};

export default EventCard;
