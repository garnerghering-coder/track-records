import { KeyboardEvent, ReactNode, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Search, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { cn } from "@/lib/utils";
import { cleanName, lastName } from "@/site/data";
import { ClassTag, Eyebrow, Note, Page, SectionHead, Skeleton } from "@/site/ui";
import { fmtDayShort, isStart, plural, raceTitle, shapeAxes, tally, teammatesOf, useRecordIndex, useRecords, type Entry, type RecordBook, type RecordIndex, type Tally } from "@/site/records";
import { ResultCell, ResultMark, ShapeRadar, ShareButton, TONE_A, TONE_B } from "@/site/record-ui";

/* ── Head-to-head maths ───────────────────────────────────────── */

interface Meeting {
  sessionId: string;
  a: Entry;
  b: Entry;
  sameClass: boolean;
  winner: "a" | "b" | null; // null = neither finished / not comparable
}

function meetings(book: RecordBook, a: string, b: string) {
  const aBy = new Map((book.byDriver.get(a) || []).filter(isStart).map((e) => [e.sessionId, e]));
  const together: Entry[] = [];
  const against: Meeting[] = [];
  for (const eb of (book.byDriver.get(b) || []).filter(isStart)) {
    const ea = aBy.get(eb.sessionId);
    if (!ea) continue;
    if (ea.key === eb.key) {
      together.push(ea);
      continue;
    }
    const sameClass = ea.className === eb.className;
    const fa = ea.status === "finished";
    const fb = eb.status === "finished";
    let winner: Meeting["winner"] = null;
    if (fa && !fb) winner = "a";
    else if (fb && !fa) winner = "b";
    else if (fa && fb) {
      const pa = sameClass ? ea.pic : ea.position;
      const pb = sameClass ? eb.pic : eb.position;
      if (pa != null && pb != null && pa !== pb) winner = pa < pb ? "a" : "b";
    }
    against.push({ sessionId: eb.sessionId, a: ea, b: eb, sameClass, winner });
  }
  const byDate = (x: Entry, y: Entry) => y.raceDate.localeCompare(x.raceDate);
  return {
    together: together.sort(byDate),
    against: against.sort((x, y) => byDate(x.a, y.a)),
  };
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const a = params.get("a") || "";
  const b = params.get("b") || "";
  const ix = useRecordIndex();
  const rec = useRecords("drivers", [a, b]);
  // The two drivers' records, plus every driver's name from the directory (picker, suggestions).
  const book = useMemo<RecordBook | undefined>(() => {
    if (!ix || !rec) return undefined;
    const drivers = Object.fromEntries(ix.drivers.map((d) => [d.id, { id: d.id, full_name: d.name, nationality: d.nationality, date_of_birth: null }]));
    return { ...rec, drivers: { ...drivers, ...rec.drivers } };
  }, [ix, rec]);
  const da = book?.drivers[a];
  const db = book?.drivers[b];

  const set = (key: "a" | "b", v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: false });
  };
  const swap = () => {
    const next = new URLSearchParams();
    if (b) next.set("a", b);
    if (a) next.set("b", a);
    setParams(next);
  };

  const title = da && db ? `${cleanName(da.full_name)} vs ${cleanName(db.full_name)}` : "Compare drivers";

  return (
    <div className="min-h-screen">
      <SEOHead
        title={`${title} – Head to head`}
        description="Put any two drivers side by side: their records, driving shapes, and every race they shared."
        canonical={`/compare${a || b ? `?${params.toString()}` : ""}`}
      />
      <Header />
      <Page className="pt-6 sm:pt-10">
        <Eyebrow>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Head to head</span>
          <span>Driver comparison</span>
        </Eyebrow>
        <h1 className="display mt-5 text-[3.2rem] leading-[0.9] sm:text-[5rem] lg:text-[6rem]">
          {da && db ? (
            <>
              {lastName(da.full_name)} <em className="text-ink-3">vs</em> <span className={TONE_B}>{lastName(db.full_name)}</span>
            </>
          ) : (
            <>
              Two drivers, <em>side by side.</em>
            </>
          )}
        </h1>

        {!book ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-40 rounded-3xl" />
          </div>
        ) : (
          <>
            <div className="mt-10 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <Picker book={book} ix={ix!} side="a" value={a} other={b} onChange={(v) => set("a", v)} />
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={swap}
                  disabled={!a && !b}
                  aria-label="Swap drivers"
                  className="flex h-11 w-11 items-center justify-center rounded-full border bg-sheet text-ink-2 transition-all hover:rotate-180 hover:text-ink disabled:opacity-40 motion-reduce:hover:rotate-0"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>
              <Picker book={book} ix={ix!} side="b" value={b} other={a} onChange={(v) => set("b", v)} />
            </div>
            {da && db && a !== b ? (
              <HeadToHead book={book} a={a} b={b} />
            ) : a && b && a === b ? (
              <Note title="That's the same driver" className="mt-10">
                Pick someone else on one side to see a head to head.
              </Note>
            ) : (
              <Suggestions book={book} ix={ix!} a={a} onPick={(x, y) => setParams(new URLSearchParams({ a: x, b: y }))} />
            )}
          </>
        )}
      </Page>
      <Footer />
    </div>
  );
}

/* ── Driver picker (searchable combobox) ─────────────────────── */

function Picker({
  book,
  ix,
  side,
  value,
  other,
  onChange,
}: {
  book: RecordBook;
  ix: RecordIndex;
  side: "a" | "b";
  value: string;
  other: string;
  onChange: (v: string | null) => void;
}) {
  const d = book.drivers[value];
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const all = useMemo(
    () =>
      ix.drivers
        .map((x) => ({ id: x.id, nationality: x.nationality, name: cleanName(x.name), starts: x.starts }))
        .sort((x, y) => y.starts - x.starts || x.name.localeCompare(y.name)),
    [ix],
  );
  const mates = useMemo(() => (other ? teammatesOf(other, book.byDriver.get(other) || []).map((m) => m.id) : []), [book, other]);
  const options = useMemo(() => {
    const n = q.trim().toLocaleLowerCase();
    if (!n) {
      const first = mates.map((id) => all.find((x) => x.id === id)!).filter(Boolean);
      return [...first, ...all.filter((x) => !mates.includes(x.id))].filter((x) => x.id !== other).slice(0, 8);
    }
    return all.filter((x) => x.id !== other && x.name.toLocaleLowerCase().includes(n)).slice(0, 8);
  }, [q, all, mates, other]);

  const open = editing || !d;
  const pick = (id: string) => {
    onChange(id);
    setEditing(false);
    setQ("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && options[hi]) {
      e.preventDefault();
      pick(options[hi].id);
    } else if (e.key === "Escape" && d) {
      setEditing(false);
      setQ("");
    }
  };

  const tone = side === "a" ? TONE_A : TONE_B;
  const t = d ? tally(book.byDriver.get(value) || []) : null;

  return (
    <div className="relative min-h-[11rem] rounded-3xl border bg-sheet p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <Eyebrow>
          <span className={cn("inline-block h-2 w-2 rounded-full bg-current", tone)} />
          Driver {side.toUpperCase()}
        </Eyebrow>
        {d && !editing && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-ink/[0.06] hover:text-ink"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Clear driver ${side.toUpperCase()}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {d && !editing && t && (
        <div className="mt-4">
          <Link
            to={`/driver/${value}`}
            className={cn(
              "display block text-[2.4rem] leading-[0.95] hover:underline hover:decoration-1 hover:underline-offset-4 sm:text-[2.8rem]",
              side === "b" && TONE_B,
            )}
          >
            {cleanName(d.full_name)}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {d.nationality && <FlagImage nationality={d.nationality} size={16} className="rounded-[2px]" />}
            {t.classes.map((c) => (
              <ClassTag key={c} name={c} color={t.classColors[c]} />
            ))}
            <span className="text-ink-3">
              {plural(t.starts, "start")} · {t.series.join(", ") || "no races yet"}
            </span>
          </div>
        </div>
      )}

      {open && (
        <div className="relative mt-4">
          <label className="flex h-12 items-center gap-3 rounded-full border bg-paper px-4 focus-within:border-ink/40">
            <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={focused || !!q || editing}
              aria-controls={listId}
              aria-activedescendant={options[hi] ? `${listId}-${options[hi].id}` : undefined}
              aria-label={`Search for driver ${side.toUpperCase()}`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={onKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search drivers…"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
              autoComplete="off"
            />
            {d && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-3 hover:text-ink">
                Cancel
              </button>
            )}
          </label>
          <ul id={listId} role="listbox" hidden={!(focused || q || editing)} className="mt-2 max-h-72 overflow-y-auto">
            {!q && mates.length > 0 && <li className="eyebrow px-3 pb-1 pt-2">Co-drivers first</li>}
            {options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={i === hi}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.id);
                }}
                className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px]", i === hi ? "bg-ink/[0.06]" : "")}
              >
                <span className="flex w-5 justify-center">
                  {o.nationality && <FlagImage nationality={o.nationality} size={16} className="rounded-[2px]" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="num text-xs text-ink-3">{o.starts ? plural(o.starts, "start") : "no starts"}</span>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">No driver matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Suggestions when the pair is incomplete ─────────────────── */

function Suggestions({ book, ix, a, onPick }: { book: RecordBook; ix: RecordIndex; a: string; onPick: (a: string, b: string) => void }) {
  // Rivals: the top two winners of each class (or series), precomputed with the directory.
  const pairs = ix.rivalries.slice(0, 6);

  return (
    <div className="mt-16">
      <SectionHead
        eyebrow={a ? "Now pick a second driver" : "Or start with a rivalry"}
        title={
          <>
            Try a <em>matchup</em>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pairs.map((p) => (
          <button
            key={p.a + p.b}
            type="button"
            onClick={() => onPick(p.a, p.b)}
            className="group rounded-3xl border bg-sheet p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.35)]"
          >
            <Eyebrow>{p.why}</Eyebrow>
            <div className="display mt-3 text-[1.9rem] leading-[1]">
              {lastName(book.drivers[p.a]?.full_name)} <em className="text-ink-3">vs</em> {lastName(book.drivers[p.b]?.full_name)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Head to head ─────────────────────────────────────────────── */

function HeadToHead({ book, a, b }: { book: RecordBook; a: string; b: string }) {
  const ea = useMemo(() => book.byDriver.get(a) || [], [book, a]);
  const eb = useMemo(() => book.byDriver.get(b) || [], [book, b]);
  const ta = useMemo(() => tally(ea, book.driverPoles.get(a) || 0), [ea, book, a]);
  const tb = useMemo(() => tally(eb, book.driverPoles.get(b) || 0), [eb, book, b]);
  const { together, against } = useMemo(() => meetings(book, a, b), [book, a, b]);
  const aWins = against.filter((m) => m.winner === "a").length;
  const bWins = against.filter((m) => m.winner === "b").length;
  const na = lastName(book.drivers[a].full_name);
  const nb = lastName(book.drivers[b].full_name);
  const axesA = shapeAxes(book.fingerprints[a]);
  const axesB = shapeAxes(book.fingerprints[b]);
  const anyShape = [...axesA, ...axesB].some((x) => x.value != null);

  const sentence = (() => {
    const bits: string[] = [];
    if (together.length) bits.push(`shared a car ${together.length === 1 ? "once" : `${together.length} times`}`);
    if (against.length) bits.push(`raced each other ${against.length === 1 ? "once" : `${against.length} times`}`);
    if (!bits.length)
      return (
        <>
          {na} and {nb} have never started the same race on the record. Here's how their careers stack up.
        </>
      );
    const lead =
      aWins === bWins ? (
        <>
          , and it's{" "}
          <span className="mark">
            level at {aWins}–{bWins}
          </span>
        </>
      ) : against.length ? (
        <>
          ;{" "}
          <span className="mark">
            {aWins > bWins ? na : nb} finished ahead {Math.max(aWins, bWins)} of {against.length}
          </span>
        </>
      ) : null;
    return (
      <>
        {na} and {nb} have {bits.join(" and ")}
        {lead}.
      </>
    );
  })();

  return (
    <>
      <p className="mt-10 max-w-3xl text-xl leading-relaxed text-ink-2 sm:text-2xl">{sentence}</p>
      <div className="mt-6">
        <ShareButton title={`${na} vs ${nb} – Track Records`} text={`${na} vs ${nb}, head to head`} label="Share matchup" />
      </div>

      {/* scoreboard + record */}
      <section className="mt-16 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col justify-between rounded-3xl bg-[#121210] p-7 text-[#EDEAE3] dark:border dark:bg-sheet sm:p-9">
          <Eyebrow className="text-[#EDEAE3]/50">Head to head · finished ahead</Eyebrow>
          {against.length ? (
            <>
              <div className="mt-6 flex items-end justify-between gap-4">
                <Score n={aWins} name={na} lead={aWins > bWins} />
                <span className="display pb-8 text-6xl text-[#EDEAE3]/30">–</span>
                <Score n={bWins} name={nb} lead={bWins > aWins} right />
              </div>
              <p className="mt-6 text-sm text-[#EDEAE3]/60">
                Across {plural(against.length, "race")} as opponents. Same class compares class position; different classes compare overall.
                {against.length - aWins - bWins > 0 ? ` ${against.length - aWins - bWins} with neither classified.` : ""}
              </p>
            </>
          ) : (
            <p className="display mt-6 text-[2rem] leading-[1.05] text-[#EDEAE3]/80">
              {together.length ? "Always teammates, never opponents." : "Never on track together."}
            </p>
          )}
        </div>
        <RecordVersus ta={ta} tb={tb} />
      </section>

      {/* shapes */}
      <section className="mt-24 sm:mt-32">
        <SectionHead
          eyebrow="Driver fingerprints, overlaid"
          title={
            <>
              Two <em>shapes</em>
            </>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="sheet flex flex-col items-center justify-center p-8 sm:p-12">
            <ShapeRadar
              series={[
                { axes: axesA, tone: TONE_A, label: na },
                { axes: axesB, tone: TONE_B, label: nb },
              ]}
              className="max-w-[420px]"
            />
            <div className="mt-4 flex gap-5 text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-ink" /> {na}
              </span>
              <span className={cn("inline-flex items-center gap-2", TONE_B)}>
                <span className="h-2.5 w-2.5 rounded-full bg-current" /> {nb}
              </span>
            </div>
          </div>
          <div className="sheet divide-y px-6 sm:px-8">
            {axesA.map((x, i) => {
              const y = axesB[i];
              return (
                <div key={x.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 py-5">
                  <span
                    className={cn("num text-2xl", x.value == null && "text-ink-3", x.value != null && y.value != null && x.value < y.value && "text-ink-3")}
                  >
                    {x.value == null ? "—" : Math.round(x.value)}
                  </span>
                  <div className="min-w-0 text-center">
                    <div className="text-[15px] font-medium">{x.label}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      {x.value == null && y.value == null ? `Needs ${x.needs}` : [x.band, y.band].map((b) => b || "—").join(" · ")}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "num text-right text-2xl",
                      y.value == null ? "text-ink-3" : TONE_B,
                      x.value != null && y.value != null && y.value < x.value && "opacity-50",
                    )}
                  >
                    {y.value == null ? "—" : Math.round(y.value)}
                  </span>
                </div>
              );
            })}
            {!anyShape && <p className="py-4 text-sm text-ink-3">Neither driver has enough events for a fingerprint yet (5 needed).</p>}
          </div>
        </div>
      </section>

      {/* races as opponents */}
      <section className="mt-24 sm:mt-32">
        <SectionHead
          eyebrow={against.length ? plural(against.length, "race") : "Opponents"}
          title={
            <>
              On track <em>together</em>
            </>
          }
        />
        {against.length ? (
          <ul className="overflow-hidden rounded-3xl border bg-sheet">
            {against.map((m) => (
              <li
                key={m.sessionId}
                className="grid grid-cols-1 items-center gap-x-4 gap-y-3 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:px-6"
              >
                <div className="min-w-0">
                  <div className="eyebrow">
                    {fmtDayShort(m.a.raceDate)} {m.a.year}
                  </div>
                  <Link
                    to={`/events/${m.a.eventId}`}
                    className="display mt-1 block truncate text-[1.35rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4"
                  >
                    {raceTitle(m.a)}
                  </Link>
                </div>
                <Side e={m.a} name={na} ahead={m.winner === "a"} />
                <Side e={m.b} name={nb} ahead={m.winner === "b"} tone={TONE_B} />
              </li>
            ))}
          </ul>
        ) : (
          <Note title="No shared grids">
            {na} and {nb} haven't started the same race as opponents
            {together.length ? ", only as co-drivers" : ""}.
          </Note>
        )}
      </section>

      {/* as teammates */}
      {together.length > 0 && (
        <section className="mt-24 sm:mt-32">
          <SectionHead
            eyebrow={plural(together.length, "race")}
            title={
              <>
                Sharing the <em>car</em>
              </>
            }
          />
          <ul className="overflow-hidden rounded-3xl border bg-sheet">
            {together.map((e) => (
              <li key={e.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:px-6">
                <div className="min-w-0">
                  <div className="eyebrow">
                    {fmtDayShort(e.raceDate)} {e.year}
                  </div>
                  <Link
                    to={`/events/${e.eventId}`}
                    className="display mt-1 block truncate text-[1.35rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4"
                  >
                    {raceTitle(e)}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <ClassTag name={e.className} color={e.classColor} />
                    <span className="num">#{e.carNumber}</span>
                    {e.teamId && <span>{book.teams[e.teamId]?.full_name}</span>}
                  </div>
                </div>
                <ResultCell e={e} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Score({ n, name, lead, right }: { n: number; name: string; lead: boolean; right?: boolean }) {
  return (
    <div className={cn("min-w-0", right && "text-right")}>
      <div className={cn("font-accent text-[5.5rem] leading-[0.8] sm:text-[7rem]", lead ? "text-hl" : "text-[#EDEAE3]/70")}>{n}</div>
      <div className="mt-3 truncate text-sm text-[#EDEAE3]/70">{name}</div>
    </div>
  );
}

function Side({ e, name, ahead, tone }: { e: Entry; name: string; ahead: boolean; tone?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", !ahead && "opacity-60")}>
      <ResultMark e={e} />
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-medium", tone)}>
          {name}
          {ahead && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">ahead</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
          <ClassTag name={e.className} color={e.classColor} className="h-[18px] px-1.5 text-[9.5px]" />
          <span className="num">#{e.carNumber}</span>
          {e.position != null && <span className="num">P{e.position} ovr</span>}
        </div>
      </div>
    </div>
  );
}

function RecordVersus({ ta, tb }: { ta: Tally; tb: Tally }) {
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
  const rows: {
    label: string;
    a: number | null;
    b: number | null;
    fmt?: (n: number) => string;
    lowerBetter?: boolean;
  }[] = [
    { label: "Starts", a: ta.starts, b: tb.starts },
    { label: "Class wins", a: ta.wins, b: tb.wins },
    { label: "Podiums", a: ta.podiums, b: tb.podiums },
    {
      label: "Win rate",
      a: pct(ta.wins, ta.starts),
      b: pct(tb.wins, tb.starts),
      fmt: (n) => `${n}%`,
    },
    {
      label: "Podium rate",
      a: pct(ta.podiums, ta.starts),
      b: pct(tb.podiums, tb.starts),
      fmt: (n) => `${n}%`,
    },
    {
      label: "Best finish",
      a: ta.best,
      b: tb.best,
      fmt: (n) => `P${n}`,
      lowerBetter: true,
    },
    {
      label: "Avg. class finish",
      a: ta.avgPic,
      b: tb.avgPic,
      fmt: (n) => n.toFixed(1),
      lowerBetter: true,
    },
    { label: "Class poles", a: ta.poles, b: tb.poles },
    {
      label: "Finish rate",
      a: pct(ta.finishes, ta.starts),
      b: pct(tb.finishes, tb.starts),
      fmt: (n) => `${n}%`,
    },
  ];
  return (
    <div className="sheet px-5 py-3 sm:px-7">
      {rows.map((r) => {
        const both = r.a != null && r.b != null;
        const aBetter = both && (r.lowerBetter ? r.a! < r.b! : r.a! > r.b!);
        const bBetter = both && (r.lowerBetter ? r.b! < r.a! : r.b! > r.a!);
        const max = Math.max(r.a ?? 0, r.b ?? 0) || 1;
        const w = (v: number | null) => (v == null ? 0 : r.lowerBetter ? (both ? (Math.min(r.a!, r.b!) / v) * 100 : 100) : (v / max) * 100);
        const f = (v: number | null) => (v == null ? "—" : r.fmt ? r.fmt(v) : v.toLocaleString());
        return (
          <div
            key={r.label}
            className="grid grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-center gap-3 border-b py-3 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem]"
          >
            <span className={cn("num text-xl", !aBetter && both && "text-ink-3")}>{f(r.a)}</span>
            <div className="min-w-0">
              <div className="mb-1.5 text-center text-xs text-ink-2">{r.label}</div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-ink/[0.06]">
                  <div
                    className={cn("h-full rounded-l-full bg-ink transition-[width] duration-700", !aBetter && both && "opacity-40")}
                    style={{ width: `${w(r.a)}%` }}
                  />
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-r-full bg-ink/[0.06]">
                  <div
                    className={cn("h-full rounded-r-full bg-current transition-[width] duration-700", TONE_B, !bBetter && both && "opacity-40")}
                    style={{ width: `${w(r.b)}%` }}
                  />
                </div>
              </div>
            </div>
            <span className={cn("num text-right text-xl", TONE_B, !bBetter && both && "opacity-50")}>{f(r.b)}</span>
          </div>
        );
      })}
    </div>
  );
}
