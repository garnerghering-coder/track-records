import { Fragment, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Eyebrow, Page, Skeleton } from "@/site/ui";

/**
 * /credits — data sources and image attributions.
 *
 * Renders docs/CREDITS.md, which scripts/build-derived.mjs copies to
 * public/data/credits.md at build time. Supported markdown: #–#### headings,
 * paragraphs, - / 1. lists, pipe tables, **bold**, *italic*, `code` and
 * [links](https://…). When the file is missing the page shows the standing
 * credits below.
 */

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

const FALLBACK = `# Sources and credits

## Results and timing

Every result, lap time, stint, pit stop and flag on Track Records comes from the official timing and scoring published by each series and its timing provider. Points are the official points as published with the results.

## Circuit maps

Circuit layout maps come from Wikimedia Commons. Each map is used under the licence its author chose (Creative Commons or public domain); the author and licence of every map are listed here once recorded.

## Car images

Car images © their respective series and teams. They are shown to identify the cars in the record; tell us if you own one and want it credited differently or removed.

## Weather

Historical weather, where official timing has none, is from Open-Meteo (CC BY 4.0).`;

export default function Credits() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}credits.md`)
      .then((r) => (r.ok && !(r.headers.get("content-type") || "").includes("html") ? r.text() : null))
      .catch(() => null)
      .then((t) => alive && setText(t && t.trim() ? t : FALLBACK));
    return () => {
      alive = false;
    };
  }, []);

  const doc = text ? parse(text) : null;
  const title = doc?.title || "Sources and credits";
  const sections = doc?.blocks.filter((b): b is Heading => b.kind === "h" && b.level === 2) || [];

  return (
    <div className="min-h-screen">
      <SEOHead title="Sources and credits" description="Where the results come from, and who made the circuit maps and images used on Track Records." canonical="/credits" />
      <Header />
      <Page className="pt-8 sm:pt-14">
        <Eyebrow>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-ink-2">Credits</span>
          <span>Data, maps and images</span>
        </Eyebrow>
        <h1 className="display mt-4 max-w-4xl text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
          {title === "Sources and credits" ? (
            <>
              Sources and <em>credits.</em>
            </>
          ) : (
            title
          )}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          The record is built from official timing. These are the people and organisations whose work it stands on.
        </p>
      </Page>

      <Page className="mt-14 sm:mt-20">
        {!doc ? (
          <div className="max-w-3xl space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className={sections.length > 2 ? "grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-20" : ""}>
            {sections.length > 2 && (
              <nav aria-label="Contents" className="lg:sticky lg:top-28 lg:self-start">
                <div className="eyebrow mb-3">Contents</div>
                <ol className="overflow-hidden rounded-2xl border bg-sheet lg:rounded-none lg:border-0 lg:bg-transparent">
                  {sections.map((s, i) => (
                    <li key={s.id} className="border-b last:border-b-0 lg:border-b-0">
                      <a href={`#${s.id}`} className="flex gap-3 px-4 py-2.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:px-0 lg:py-1.5">
                        <span className="num pt-px text-[11px] leading-5 text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                        <span>{s.text}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <article className="min-w-0 max-w-3xl">{render(doc.blocks)}</article>
          </div>
        )}
        <p className="mt-16 max-w-3xl border-t pt-6 text-sm text-ink-3">
          Something missing or credited wrongly? Corrections are welcome: see the{" "}
          <Link to="/privacy#your-rights" className="underline underline-offset-4 hover:text-ink">
            corrections policy
          </Link>
          .
        </p>
      </Page>
      <Footer />
    </div>
  );
}

/* ── A small, safe markdown reader ─────────────────────────────── */

interface Heading {
  kind: "h";
  level: number;
  text: string;
  id: string;
}
type Block = Heading | { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] } | { kind: "table"; head: string[]; rows: string[][] };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parse(text: string): { title: string | null; blocks: Block[] } {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let title: string | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^<!--.*-->$/.test(line)) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      if (h[1].length === 1 && title == null && blocks.length === 0) title = h[2].trim();
      else blocks.push({ kind: "h", level: Math.max(2, h[1].length), text: h[2].trim(), id: slug(h[2]) });
      continue;
    }
    // Pipe table: header row, a --- separator, then rows.
    if (line.startsWith("|") && /^\|?\s*:?-{2,}/.test((lines[i + 1] || "").trim())) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = (ul || ol)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }
    // Continuation of a list item (indented line).
    const last = blocks[blocks.length - 1];
    if (!para.length && last && (last.kind === "ul" || last.kind === "ol") && /^\s{2,}/.test(lines[i])) {
      last.items[last.items.length - 1] += ` ${line}`;
      continue;
    }
    para.push(line);
  }
  flush();
  return { title, blocks };
}

function render(blocks: Block[]): ReactNode {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case "h":
        return b.level === 2 ? (
          <h2 key={i} id={b.id} className="display mb-5 mt-14 scroll-mt-28 text-[2.1rem] leading-[1.02] first:mt-0 sm:text-[2.5rem]">
            {inline(b.text)}
          </h2>
        ) : (
          <h3 key={i} id={b.id} className="mb-3 mt-10 scroll-mt-28 text-[15px] font-semibold">
            {inline(b.text)}
          </h3>
        );
      case "p":
        return (
          <p key={i} className="mb-4 text-[17px] leading-[1.75] text-ink/85">
            {inline(b.text)}
          </p>
        );
      case "ul":
      case "ol":
        return (
          <ul key={i} className="mb-6 space-y-2.5 text-[16px] leading-[1.65] text-ink/85">
            {b.items.map((it, k) => (
              <li key={k} className="relative pl-6 before:absolute before:left-0 before:top-[0.8em] before:h-px before:w-3 before:bg-ink-3">
                {inline(it)}
              </li>
            ))}
          </ul>
        );
      case "table":
        return (
          <div key={i} className="mb-8 overflow-x-auto rounded-2xl border bg-sheet">
            <table className="w-full min-w-[32rem] text-left text-[14px]">
              <thead>
                <tr className="border-b">
                  {b.head.map((h, k) => (
                    <th key={k} className="eyebrow px-4 py-3 font-normal">
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, k) => (
                  <tr key={k} className="border-b last:border-b-0">
                    {r.map((c, j) => (
                      <td key={j} className="px-4 py-2.5 align-top text-ink-2">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

const SAFE_URL = /^(https?:\/\/|\/|#|mailto:)/i;

function inline(s: string): ReactNode {
  const parts = s.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|_[^_\s][^_]*_|`[^`]+`|https?:\/\/[^\s)<]+)/g);
  return parts.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2];
      if (!SAFE_URL.test(href)) return <Fragment key={i}>{link[1]}</Fragment>;
      if (href.startsWith("/") && !href.startsWith("//"))
        return (
          <Link key={i} to={href} className="underline decoration-ink-3 underline-offset-4 hover:decoration-ink">
            {link[1]}
          </Link>
        );
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-ink-3 underline-offset-4 hover:decoration-ink">
          {link[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(p))
      return (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-ink-3 underline-offset-4 hover:decoration-ink">
          {p.replace(/^https?:\/\//, "")}
        </a>
      );
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (/^(\*[^*]+\*|_[^_]+_)$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(p))
      return (
        <code key={i} className="rounded bg-ink/[0.06] px-1 font-mono text-[0.88em]">
          {p.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}
