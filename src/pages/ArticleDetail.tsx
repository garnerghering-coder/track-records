import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { articles, type ArticleImage } from "@/lib/articles-data";
import { Eyebrow, Note, Page, dateRange } from "@/site/ui";
import { readingMinutes } from "@/site/archive";

/* ── Inline markdown: **bold**, *italic*, `code`, [link](url) ───── */
function inline(text: string): ReactNode[] {
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
        <strong key={k++} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    else if (tok.startsWith("`"))
      out.push(
        <code key={k++} className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.84em]">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
      const cls = "text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink";
      out.push(
        href?.startsWith("/") ? (
          <Link key={k++} to={href} className={cls}>
            {label}
          </Link>
        ) : (
          <a key={k++} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
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

/* ── Block markdown ──────────────────────────────────────────── */
type Block = { t: "h2" | "h3" | "p" | "quote"; text: string } | { t: "ul" | "ol"; items: string[] } | { t: "table"; head: string[]; rows: string[][] };

function parse(src: string): Block[] {
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
    if (line.startsWith("### ") || line.startsWith("## ")) {
      flush();
      const h3 = line.startsWith("### ");
      blocks.push({ t: h3 ? "h3" : "h2", text: line.slice(h3 ? 4 : 3) });
      continue;
    }
    if (line.startsWith(">")) {
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
      const re = ordered ? /^\d+\.\s/ : /^[-*] /;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i].trim())) items.push(lines[i++].trim().replace(re, ""));
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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function BlockView({ b, first }: { b: Block; first: boolean }) {
  switch (b.t) {
    case "h2":
      return (
        <h2 id={slugify(b.text)} className="display mb-4 mt-16 scroll-mt-28 text-[2.1rem] leading-[1.02] sm:text-[2.5rem]">
          {inline(b.text)}
        </h2>
      );
    case "h3":
      return <h3 className="mb-2 mt-10 text-[1.15rem] font-semibold">{inline(b.text)}</h3>;
    case "quote":
      return (
        <blockquote className="display my-12 border-l-2 border-ink pl-6 text-[1.9rem] italic leading-[1.15] sm:-ml-8 sm:text-[2.3rem]">
          {inline(b.text)}
        </blockquote>
      );
    case "ul":
      return (
        <ul className="my-6 space-y-3">
          {b.items.map((it, i) => (
            <li key={i} className="relative pl-6 before:absolute before:left-0 before:top-[0.8em] before:h-px before:w-3 before:bg-ink-3">
              {inline(it)}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="my-6 space-y-3">
          {b.items.map((it, i) => (
            <li key={i} className="grid grid-cols-[2.2rem_minmax(0,1fr)]">
              <span className="num pt-[0.25em] text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span>{inline(it)}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="my-10 overflow-x-auto rounded-2xl border bg-sheet">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b">
                {b.head.map((h, i) => (
                  <th key={i} className="eyebrow whitespace-nowrap px-4 py-3 text-left font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-b-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-4 py-3 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return first ? (
        <p className="my-6 first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-serif first-letter:text-[4.6rem] first-letter:leading-[0.8] first-letter:text-ink">
          {inline(b.text)}
        </p>
      ) : (
        <p className="my-6">{inline(b.text)}</p>
      );
  }
}

function Figure({ img }: { img: ArticleImage }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <figure className="my-12 sm:-mx-16">
      <div className="overflow-hidden rounded-3xl border bg-ink/[0.04]">
        <img src={img.url} alt={img.alt} className="aspect-[16/9] w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      </div>
      {img.caption && (
        <figcaption className="mt-3 text-[13px] leading-snug text-ink-3 sm:px-16">{img.caption}</figcaption>
      )}
    </figure>
  );
}

function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      setP(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <div className="fixed inset-x-0 top-0 z-[55] h-[3px] origin-left bg-hl" style={{ transform: `scaleX(${p})` }} aria-hidden />;
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const a = articles.find((x) => x.slug === slug);

  if (!a)
    return (
      <div className="min-h-screen">
        <SEOHead title="Article not found" noIndex />
        <Header />
        <Page className="pt-16">
          <Note title="We couldn't find that article.">
            It may have been moved.{" "}
            <Link to="/articles" className="underline underline-offset-4">
              All articles
            </Link>
            .
          </Note>
        </Page>
        <Footer />
      </div>
    );

  const sections = a.body
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim());
  const related = articles.filter((x) => x.slug !== a.slug).slice(0, 3);
  let firstPara = true;

  return (
    <div className="min-h-screen">
      <SEOHead title={a.title} description={a.excerpt} canonical={`/articles/${a.slug}`} />
      <ReadingProgress />
      <Header />

      <Page className="pt-6 sm:pt-10">
        <Link to="/articles" className="group inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Articles
        </Link>
        <header className="mx-auto mt-10 max-w-4xl text-center sm:mt-16">
          <Eyebrow className="justify-center">
            <span>{a.category}</span>
            <span>·</span>
            <span>{dateRange(a.date)}</span>
            <span>·</span>
            <span>{readingMinutes(a.body)} min read</span>
          </Eyebrow>
          <h1 className="display mt-6 text-[2.9rem] leading-[0.95] sm:text-[4.6rem] lg:text-[5.4rem]">{a.title}</h1>
          <p className="display mx-auto mt-8 max-w-2xl text-[1.5rem] italic leading-[1.2] text-ink-2 sm:text-[1.9rem]">{a.excerpt}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-ink-3">
            <span>By {a.author}</span>
            {a.tags.length > 0 && <span aria-hidden>·</span>}
            {a.tags.map((t) => (
              <span key={t} className="rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider">
                {t}
              </span>
            ))}
          </div>
        </header>
      </Page>

      <Page className="mt-16 sm:mt-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[13rem_minmax(0,1fr)_13rem]">
          {sections.length > 1 ? (
            <nav aria-label="In this piece" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
              <div className="eyebrow mb-3">In this piece</div>
              <ol className="space-y-2.5">
                {sections.map((s, i) => (
                  <li key={s}>
                    <a href={`#${slugify(s)}`} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-2 hover:text-ink">
                      <span className="num pt-px text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                      {s}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : (
            <div className="hidden lg:block" />
          )}
          <article className="mx-auto w-full max-w-[38rem] text-[18px] leading-[1.75] text-ink/85">
            {a.body.split(/\{\{IMAGE:(\d+)\}\}/g).map((part, i) => {
              if (i % 2 === 1) {
                const img = a.images[parseInt(part, 10)];
                return img ? <Figure key={`img-${i}`} img={img} /> : null;
              }
              return (
                <Fragment key={`t-${i}`}>
                  {parse(part).map((b, bi) => {
                    const isFirst = b.t === "p" && firstPara;
                    if (b.t === "p") firstPara = false;
                    return <BlockView key={bi} b={b} first={isFirst} />;
                  })}
                </Fragment>
              );
            })}
            <div className="mt-16 flex items-center gap-3 border-t pt-6 text-sm text-ink-3">
              <span className="font-accent text-lg text-ink">TR</span>
              <span>
                {a.author} · {dateRange(a.date)}
              </span>
            </div>
          </article>
          <div className="hidden lg:block" />
        </div>
      </Page>

      {related.length > 0 && (
        <Page className="mt-24 sm:mt-32">
          <div className="mb-6 flex items-end justify-between border-b pb-3">
            <h2 className="display text-[2.2rem] leading-none">Keep reading</h2>
            <Link to="/articles" className="text-sm text-ink-2 hover:text-ink">
              <span className="link-u">All articles</span>
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.slug} to={`/articles/${r.slug}`} className="group flex flex-col rounded-3xl border bg-sheet p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)] sm:p-7">
                <Eyebrow>
                  {r.category} · {dateRange(r.date)}
                </Eyebrow>
                <h3 className="display mt-3 text-[1.9rem] leading-[1.02]">{r.title}</h3>
                <p className="mt-3 line-clamp-3 text-[15px] text-ink-2">{r.excerpt}</p>
                <span className="mt-auto flex items-center justify-between pt-6 text-sm text-ink-3">
                  <span>{readingMinutes(r.body)} min read</span>
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                </span>
              </Link>
            ))}
          </div>
        </Page>
      )}

      <Footer />
    </div>
  );
}
