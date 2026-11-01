import { Fragment, ReactNode, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { EmptyState } from "@/components/tr/primitives";
import { articles, type ArticleImage } from "@/lib/articles-data";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).length / 230));

/* ── Inline markdown: **bold**, *italic*, `code`, [link](url) ───── */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**"))
      out.push(
        <strong key={k++} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    else if (tok.startsWith("`"))
      out.push(
        <code key={k++} className="rounded-sm border bg-muted px-1 py-px font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
      const internal = href?.startsWith("/");
      out.push(
        internal ? (
          <Link
            key={k++}
            to={href}
            className="text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary"
          >
            {label}
          </Link>
        ) : (
          <a
            key={k++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary"
          >
            {label}
          </a>
        ),
      );
    } else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ── Block markdown: headings, paragraphs, lists, quotes, tables ── */
type Block =
  | { t: "h2" | "h3" | "p" | "quote"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] };

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join(" ") });
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
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ t: "h3", text: line.slice(4) });
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push({ t: "h2", text: line.slice(3) });
      continue;
    }
    if (line.startsWith("> ")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ t: "quote", text: q.join(" ") });
      continue;
    }
    if (/^[-*] /.test(line) || /^\d+\.\s/.test(line)) {
      flush();
      const ordered = /^\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\.\s/ : /^[-*] /).test(lines[i].trim())) {
        items.push(lines[i++].trim().replace(ordered ? /^\d+\.\s/ : /^[-*] /, ""));
      }
      i--;
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ t: "table", head, rows });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function Block({ b }: { b: Block }) {
  switch (b.t) {
    case "h2":
      return (
        <h2 className="mb-3 mt-12 font-display text-[1.65rem] font-bold uppercase leading-tight tracking-wide text-foreground">
          {renderInline(b.text)}
        </h2>
      );
    case "h3":
      return <h3 className="mb-2 mt-8 font-display text-xl font-bold uppercase tracking-wide text-foreground">{renderInline(b.text)}</h3>;
    case "quote":
      return (
        <blockquote className="my-8 border-l-2 border-primary pl-5 font-display text-2xl font-semibold leading-snug text-foreground">
          {renderInline(b.text)}
        </blockquote>
      );
    case "ul":
      return (
        <ul className="my-6 space-y-2.5">
          {b.items.map((it, i) => (
            <li
              key={i}
              className="relative pl-5 before:absolute before:left-0 before:top-[0.72em] before:h-px before:w-2.5 before:bg-primary"
            >
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="my-6 space-y-2.5">
          {b.items.map((it, i) => (
            <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)]">
              <span className="num pt-[0.2em] text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="my-8 overflow-x-auto rounded border">
          <table className="data-table">
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="text-[15px]">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p className="my-5">{renderInline(b.text)}</p>;
  }
}

function Figure({ img, n }: { img: ArticleImage; n: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <figure className="my-10">
      <div className="overflow-hidden rounded-sm border bg-muted">
        <img src={img.url} alt={img.alt} className="w-full" loading="lazy" onError={() => setBroken(true)} />
      </div>
      {img.caption && (
        <figcaption className="mt-2.5 flex gap-3 text-sm leading-snug text-muted-foreground">
          <span className="label-caps num shrink-0 pt-px text-primary">Fig. {n}</span>
          <span>{img.caption}</span>
        </figcaption>
      )}
    </figure>
  );
}

function renderBody(body: string, images: ArticleImage[]) {
  let fig = 0;
  return body.split(/\{\{IMAGE:(\d+)\}\}/g).map((part, i) => {
    if (i % 2 === 1) {
      const img = images[parseInt(part, 10)];
      return img ? <Figure key={`img-${i}`} img={img} n={++fig} /> : null;
    }
    return (
      <Fragment key={`text-${i}`}>
        {parseBlocks(part).map((b, bi) => (
          <Block key={bi} b={b} />
        ))}
      </Fragment>
    );
  });
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <SEOHead title="Article not found" noIndex />
        <Header />
        <main className="container py-16">
          <EmptyState title="Article not found">
            This article may have moved or been removed.{" "}
            <Link to="/articles" className="text-primary underline underline-offset-2">
              Back to all articles
            </Link>
          </EmptyState>
        </main>
        <Footer />
      </div>
    );
  }

  const related = articles.filter((a) => a.slug !== slug).slice(0, 3);
  const mins = readingMinutes(article.body);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={article.title} description={article.excerpt} canonical={`/articles/${article.slug}`} ogImage={article.heroImage} />
      <Header />

      <main>
        {/* ── Masthead ─────────────────────────────────────────── */}
        <header className="relative border-b">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="container relative pb-8 pt-6 md:pb-10">
            <div className="mx-auto max-w-5xl">
              <Link
                to="/articles"
                className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> All articles
              </Link>
              <div className="mt-6 max-w-4xl">
                <div className="label-caps flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                  <span className="text-foreground">{article.category}</span>
                  <span aria-hidden>/</span>
                  <span className="num">{formatDateRange(article.date)}</span>
                </div>
                <h1 className="mt-3 font-display text-[2.1rem] font-bold uppercase leading-[1] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
                  {article.title}
                </h1>
                <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="container">
          {/* Hero */}
          <div className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-sm border bg-muted md:mt-10">
            <img src={article.heroImage} alt={article.title} className="aspect-[2/1] w-full object-cover" />
          </div>

          {/* ── Body + meta rail ───────────────────────────────── */}
          <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border bg-border text-sm sm:grid-cols-4 lg:grid-cols-1">
                <MetaItem label="Published">
                  <span className="num">{formatDateRange(article.date)}</span>
                </MetaItem>
                <MetaItem label="By">{article.author}</MetaItem>
                <MetaItem label="Reading time">
                  <span className="num">{mins}</span> min
                </MetaItem>
                <MetaItem label="Category">{article.category}</MetaItem>
              </dl>
              {article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-sm border px-1.5 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </aside>

            <article className="max-w-[68ch] font-body text-[17px] leading-[1.7] text-foreground/85 [&>*:first-child]:mt-0">
              {renderBody(article.body, article.images)}
            </article>
          </div>

          {/* ── More articles ──────────────────────────────────── */}
          {related.length > 0 && (
            <section className="mx-auto mt-16 max-w-5xl">
              <div className="mb-4 flex items-end justify-between gap-4 border-b pb-2.5">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">More articles</h2>
                <Link
                  to="/articles"
                  className="group flex items-center gap-0.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  All articles <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div
                className={cn(
                  "grid gap-px overflow-hidden rounded border bg-border",
                  related.length >= 2 && "sm:grid-cols-2",
                  related.length >= 3 && "lg:grid-cols-3",
                )}
              >
                {related.map((r) => (
                  <Link key={r.slug} to={`/articles/${r.slug}`} className="group flex gap-4 bg-card p-4 transition-colors hover:bg-accent">
                    <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-sm border bg-muted">
                      <img src={r.heroImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0">
                      <div className="label-caps">{r.category}</div>
                      <h3 className="mt-1 font-display text-base font-bold uppercase leading-tight text-foreground">{r.title}</h3>
                      <div className="num mt-1.5 text-xs text-muted-foreground">{formatDateRange(r.date)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
