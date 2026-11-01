import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { articles, ARTICLE_CATEGORIES, type Article } from "@/lib/articles-data";
import { Eyebrow, Note, Page, Tabs, dateRange } from "@/site/ui";
import { readingMinutes } from "@/site/archive";

export default function Articles() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("category") || "all";
  const sorted = useMemo(() => [...articles].sort((a, b) => b.date.localeCompare(a.date)), []);
  const cats = ARTICLE_CATEGORIES.filter((c) => sorted.some((a) => a.category === c));
  const list = cat === "all" ? sorted : sorted.filter((a) => a.category === cat);
  const [lead, ...rest] = list;

  return (
    <div className="min-h-screen">
      <SEOHead title="Articles" description="Race breakdowns, previews and analysis, written from the data on the record." canonical="/articles" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <Eyebrow>Articles</Eyebrow>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
              Notes from <em>the paddock.</em>
            </h1>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-ink-2 lg:justify-self-end">Breakdowns, previews and analysis, written from the numbers on the record.</p>
        </div>
        {cats.length > 1 && (
          <div className="mt-10">
            <Tabs
              value={cat}
              onChange={(v) => setParams(v === "all" ? {} : { category: v }, { replace: true })}
              items={[{ value: "all", label: "Everything" }, ...cats.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        )}
      </Page>

      <Page className="mt-12 sm:mt-16">
        {!lead ? (
          <Note title="Nothing in this section yet">New pieces are published after race weekends.</Note>
        ) : (
          <>
            <Lead a={lead} />
            {rest.length > 0 && (
              <ol className="mt-16 border-t">
                {rest.map((a, i) => (
                  <li key={a.slug}>
                    <ArticleRow a={a} n={i + 2} />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Page>

      <Footer />
    </div>
  );
}

function Lead({ a }: { a: Article }) {
  return (
    <Link to={`/articles/${a.slug}`} className="group grid overflow-hidden rounded-[28px] border bg-sheet lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col p-7 sm:p-12">
        <Eyebrow>
          <span className="rounded-full bg-hl px-2 py-0.5 text-hl-ink">Latest</span>
          <span>{a.category}</span>
          <span>·</span>
          <span>{dateRange(a.date)}</span>
        </Eyebrow>
        <h2 className="display mt-6 text-[2.6rem] leading-[0.98] sm:text-[4rem]">{a.title}</h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{a.excerpt}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 pt-10 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            Read the piece <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
          <span className="text-ink-3">
            {a.author} · <span className="num">{readingMinutes(a.body)}</span> min read
          </span>
        </div>
      </div>
      <div className="relative hidden min-h-[22rem] border-l bg-paper/50 p-12 lg:flex lg:flex-col lg:justify-between">
        <span className="font-accent text-[11rem] leading-[0.8] text-ink/[0.07]">01</span>
        <ul className="relative space-y-2">
          {headings(a.body)
            .slice(0, 5)
            .map((h, i) => (
              <li key={h} className="flex gap-3 text-[15px] text-ink-2">
                <span className="num w-5 shrink-0 text-[11px] leading-6 text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="display text-[1.35rem] leading-tight text-ink">{h}</span>
              </li>
            ))}
        </ul>
      </div>
    </Link>
  );
}

function ArticleRow({ a, n }: { a: Article; n: number }) {
  return (
    <Link to={`/articles/${a.slug}`} className="group grid gap-4 border-b py-8 sm:grid-cols-[5rem_minmax(0,1fr)_12rem] sm:gap-8 sm:py-10">
      <span className="font-accent text-4xl leading-none text-ink-3">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <Eyebrow>
          <span>{a.category}</span>
          <span>·</span>
          <span>{dateRange(a.date)}</span>
        </Eyebrow>
        <h3 className="display mt-3 text-[2rem] leading-[1.02] transition-transform duration-300 group-hover:translate-x-1 sm:text-[2.6rem]">{a.title}</h3>
        <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-2">{a.excerpt}</p>
      </div>
      <div className="flex items-start justify-between gap-4 text-sm text-ink-3 sm:flex-col sm:items-end">
        <span>
          <span className="num">{readingMinutes(a.body)}</span> min read
        </span>
        <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
    </Link>
  );
}

const headings = (body: string) => body.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
