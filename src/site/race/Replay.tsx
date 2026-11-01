import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";
import { classRank, fmtLap } from "@/lib/insights";
import { Livery, Tabs } from "@/site/ui";
import { lastName } from "@/site/data";
import { clock, flagAt, messagesUntil, towerAt, type ReplayModel, type TowerRow } from "./replay";

const ROW = 44;
const SPEEDS = [10, 60, 300, 1200];

const FLAG_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  GREEN: { label: "Green flag", bg: "#16a34a", fg: "#fff" },
  YELLOW: { label: "Yellow", bg: "#facc15", fg: "#111" },
  FCY: { label: "Full course yellow", bg: "#f59e0b", fg: "#111" },
  SC: { label: "Safety car", bg: "#f59e0b", fg: "#111" },
  RED: { label: "Red flag", bg: "#dc2626", fg: "#fff" },
  CHEQUERED: { label: "Chequered flag", bg: "#111", fg: "#fff" },
  PRE: { label: "Pre-race", bg: "transparent", fg: "inherit" },
};
const flagStyle = (s: string) => FLAG_STYLE[s.toUpperCase()] || (/YELLOW|FCY/i.test(s) ? FLAG_STYLE.FCY : FLAG_STYLE.GREEN);

export default function Replay({
  model,
  names,
  classColors,
}: {
  model: ReplayModel;
  names: { drivers: Record<string, { full_name: string }>; teams: Record<string, { full_name: string }> } | undefined;
  classColors: Record<string, string>;
}) {
  const [t, setT] = useState(() => Math.min(model.duration, model.typicalLap * 1.5));
  const [playing, setPlaying] = useState(false);
  const autoSpeed = useMemo(() => SPEEDS.reduce((best, s) => (Math.abs(model.duration / s - 150) < Math.abs(model.duration / best - 150) ? s : best), SPEEDS[0]), [model.duration]);
  const [speed, setSpeed] = useState(autoSpeed);
  const [cls, setCls] = useState<string>("");
  const [follow, setFollow] = useState<string | null>(null);
  const raf = useRef(0);
  const last = useRef(0);

  const classes = useMemo(() => [...new Set(model.cars.map((c) => c.className || ""))].filter(Boolean).sort((a, b) => classRank(a) - classRank(b)), [model.cars]);
  const multi = classes.length > 1;

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const step = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((x) => {
        const n = x + dt * speed;
        if (n >= model.duration) {
          setPlaying(false);
          return model.duration;
        }
        return n;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, model.duration]);

  const rows = useMemo(() => towerAt(model, t, multi && cls ? cls : null), [model, t, cls, multi]);
  const flag = flagAt(model, t);
  const fs = flagStyle(flag);
  const msgs = useMemo(() => messagesUntil(model, t, 6), [model, t]);
  const leaderLaps = rows.length ? Math.max(...rows.map((r) => r.laps)) : 0;
  const totalLaps = model.leaderCrossings.length;
  const followed = follow ? towerAt(model, t, null).find((r) => r.car.carNumber === follow) : undefined;

  const jump = useCallback((d: number) => setT((x) => Math.max(0, Math.min(model.duration, x + d))), [model.duration]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      if (tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" && tag !== "INPUT") jump(model.typicalLap);
      else if (e.key === "ArrowLeft" && tag !== "INPUT") jump(-model.typicalLap);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, model.typicalLap]);

  const driverName = (id: string | null) => (id && names?.drivers[id] ? lastName(names.drivers[id].full_name) : "—");
  const color = (c: string | null) => (c ? classColors[c] || getClassColor(c) : "#71717a");

  return (
    <div className="overflow-hidden rounded-[28px] border bg-sheet">
      {/* ── Control deck ─────────────────────────────────────── */}
      <div className="border-b p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <div className="eyebrow">Race time</div>
            <div className="num mt-1 text-4xl leading-none sm:text-5xl">{clock(t)}</div>
          </div>
          <div>
            <div className="eyebrow">Lap</div>
            <div className="num mt-1 text-2xl leading-none">
              {leaderLaps}
              <span className="text-ink-3">/{totalLaps}</span>
            </div>
          </div>
          <div>
            <div className="eyebrow">To go</div>
            <div className="num mt-1 text-2xl leading-none text-ink-2">{clock(model.duration - t)}</div>
          </div>
          <span
            className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors"
            style={{ backgroundColor: fs.bg, color: fs.fg, boxShadow: fs.bg === "transparent" ? "inset 0 0 0 1px hsl(var(--rule))" : undefined }}
            aria-live="polite"
          >
            <span className={cn("h-2 w-2 rounded-full bg-current", playing && "animate-pulse")} />
            {fs.label}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <IconBtn label="Back one lap" onClick={() => jump(-model.typicalLap)}>
              <SkipBack className="h-4 w-4" />
            </IconBtn>
            <button
              onClick={() => (t >= model.duration ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-105"
              aria-label={playing ? "Pause" : "Play"}
            >
              {t >= model.duration ? <RotateCcw className="h-5 w-5" /> : playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <IconBtn label="Forward one lap" onClick={() => jump(model.typicalLap)}>
              <SkipForward className="h-4 w-4" />
            </IconBtn>
            <div className="ml-2 hidden rounded-full border p-1 sm:flex">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn("num h-7 rounded-full px-2.5 text-xs", speed === s ? "bg-hl text-hl-ink" : "text-ink-2 hover:text-ink")}
                  aria-pressed={speed === s}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* timeline */}
        <div className="relative mt-6 h-10">
          <div className="absolute inset-x-0 top-3 h-4 overflow-hidden rounded-full bg-ink/[0.06]">
            {model.flags
              .filter((f) => !/GREEN/i.test(f.state))
              .map((f, i) => (
                <span
                  key={i}
                  className="absolute inset-y-0"
                  title={`${flagStyle(f.state).label} ${clock(f.start)}–${clock(f.end)}`}
                  style={{ left: `${(f.start / model.duration) * 100}%`, width: `${Math.max(0.15, ((f.end - f.start) / model.duration) * 100)}%`, backgroundColor: flagStyle(f.state).bg, opacity: 0.85 }}
                />
              ))}
            <span className="absolute inset-y-0 left-0 bg-ink/15" style={{ width: `${(t / model.duration) * 100}%` }} />
          </div>
          {model.messages
            .filter((m) => /penalt|red flag|retire|accident|contact|stopped/i.test(m.text))
            .slice(0, 300)
            .map((m, i) => (
              <span key={i} className="absolute top-0 h-1.5 w-px bg-ink/40" style={{ left: `${(m.t / model.duration) * 100}%` }} />
            ))}
          <span className="pointer-events-none absolute top-1 h-8 w-[3px] -translate-x-1/2 rounded-full bg-ink shadow" style={{ left: `${(t / model.duration) * 100}%` }} />
          <input
            type="range"
            min={0}
            max={model.duration}
            step={1}
            value={t}
            onChange={(e) => {
              setT(Number(e.target.value));
            }}
            aria-label="Race time"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div className="num absolute -bottom-3 left-0 text-[10px] text-ink-3">START</div>
          <div className="num absolute -bottom-3 right-0 text-[10px] text-ink-3">FINISH</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px]">
        {/* ── Tower ───────────────────────────────────────────── */}
        <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
          {multi && (
            <div className="border-b px-4 py-3 sm:px-6">
              <Tabs
                value={cls}
                onChange={setCls}
                items={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c, label: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color(c) }} />{c}</span> }))]}
              />
            </div>
          )}
          <div className="grid grid-cols-[2.6rem_3.2rem_1fr_4.5rem] items-center gap-2 border-b px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 sm:grid-cols-[2.8rem_3.4rem_6.5rem_1fr_4rem_5.5rem_5.5rem] sm:px-6">
            <span>Pos</span>
            <span>Car</span>
            <span className="hidden sm:block" />
            <span>Driver</span>
            <span className="hidden text-right sm:block">Laps</span>
            <span className="hidden text-right sm:block">Last lap</span>
            <span className="text-right">Gap</span>
          </div>
          <div className="relative" style={{ height: rows.length * ROW }}>
            {rows.map((r, i) => (
              <TowerLine
                key={r.car.carNumber}
                r={r}
                index={i}
                showClassPos={!!cls || !multi}
                color={color(r.car.className)}
                driver={driverName(r.driverId)}
                team={r.car.teamId ? names?.teams[r.car.teamId]?.full_name : undefined}
                followed={follow === r.car.carNumber}
                onFollow={() => setFollow((f) => (f === r.car.carNumber ? null : r.car.carNumber))}
              />
            ))}
          </div>
        </div>

        {/* ── Side ─────────────────────────────────────────────── */}
        <aside className="space-y-6 p-4 sm:p-6">
          {followed ? (
            <div className="rounded-2xl bg-hl p-4 text-hl-ink">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">Following #{followed.car.carNumber}</span>
                <button onClick={() => setFollow(null)} className="text-xs underline underline-offset-2">Stop</button>
              </div>
              <Livery src={followed.car.livery} alt="" className="my-2 h-20 w-full" />
              <div className="display text-3xl leading-none">P{followed.classPosition}{multi && followed.car.className ? <span className="ml-2 font-mono text-xs uppercase tracking-wider">{followed.car.className}</span> : null}</div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-[11px] opacity-60">Driving</dt><dd>{driverName(followed.driverId)}</dd></div>
                <div><dt className="text-[11px] opacity-60">Laps</dt><dd className="num">{followed.laps}</dd></div>
                <div><dt className="text-[11px] opacity-60">Last lap</dt><dd className="num">{fmtLap(followed.lastLap)}</dd></div>
                <div><dt className="text-[11px] opacity-60">Gap</dt><dd className="num">{followed.gap}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-ink-2">
              Tap a car in the tower to follow it through the race. <span className="text-ink-3">Space plays and pauses; arrow keys step a lap.</span>
            </p>
          )}
          <div>
            <div className="eyebrow mb-3">Race control</div>
            {msgs.length === 0 ? (
              <p className="text-sm text-ink-3">{model.messages.length ? "Nothing yet at this point of the race." : "No race control messages were published for this race."}</p>
            ) : (
              <ol className="space-y-3">
                {msgs.map((m, i) => (
                  <li key={`${m.t}-${i}`} className={cn("border-l-2 pl-3 text-[13px] leading-snug transition-opacity", i === 0 ? "opacity-100" : "opacity-70")} style={{ borderColor: m.color || "hsl(var(--rule))" }}>
                    <span className="num mr-1.5 text-[11px] text-ink-3">{clock(m.t)}</span>
                    {m.text.charAt(0) + m.text.slice(1).toLowerCase()}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TowerLine({
  r,
  index,
  showClassPos,
  color,
  driver,
  team,
  followed,
  onFollow,
}: {
  r: TowerRow;
  index: number;
  showClassPos: boolean;
  color: string;
  driver: string;
  team?: string;
  followed: boolean;
  onFollow: () => void;
}) {
  return (
    <button
      onClick={onFollow}
      aria-pressed={followed}
      className={cn(
        "absolute inset-x-0 grid h-[44px] grid-cols-[2.6rem_3.2rem_1fr_4.5rem] items-center gap-2 px-4 text-left transition-[transform,background-color] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] sm:grid-cols-[2.8rem_3.4rem_6.5rem_1fr_4rem_5.5rem_5.5rem] sm:px-6",
        followed ? "z-10 bg-hl text-hl-ink" : "hover:bg-ink/[0.04]",
        r.out && "opacity-40",
      )}
      style={{ transform: `translateY(${index * ROW}px)` }}
    >
      <span className="font-accent text-lg tabular-nums">{showClassPos ? r.classPosition : r.position}</span>
      <span className="num inline-flex h-6 w-11 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ backgroundColor: color }}>
        {r.car.carNumber}
      </span>
      <span className="hidden h-8 sm:block">
        <Livery src={r.car.livery} alt="" className="h-8 w-24" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 truncate text-[14px]">
          {driver}
          {r.inPit && <span className="rounded-full bg-ink px-1.5 py-px font-mono text-[9px] font-semibold tracking-wider text-paper">PIT</span>}
          {r.out && <span className="font-mono text-[9px] tracking-wider text-loss">OUT</span>}
        </span>
        {team && <span className="block truncate text-[11px] text-ink-3 max-sm:hidden">{team}</span>}
      </span>
      <span className="num hidden text-right text-[13px] sm:block">{r.laps}</span>
      <span className="num hidden text-right text-[13px] text-ink-2 sm:block">{fmtLap(r.lastLap)}</span>
      <span className="num text-right text-[13px]">{r.gap === "Leader" ? <span className="font-sans text-xs font-medium">Leader</span> : r.gap}</span>
    </button>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full border text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
      {children}
    </button>
  );
}

