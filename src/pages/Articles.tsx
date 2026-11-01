import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { EmptyState, FilterInput, PageHeader } from "@/components/tr/primitives";
import { articles, ARTICLE_CATEGORIES, type Article } from "@/lib/articles-data";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).length / 230));

export default function Articles() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      const matchesCategory = !activeCategory || a.category === activeCategory;
      const matchesSearch =
        !search.trim() ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.excerpt.toLowerCase().includes(search.toLowerCase()) ||
        a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const isFiltering = !!activeCategory || !!search.trim();
  const [lead, ...rest] = filtered;
  const list = isFiltering ? filtered : rest;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Articles"
        description="In-depth motorsport analysis, race breakdowns, driver profiles, and pre-race predictions from Track Records."
        canonical="/articles"
      />
      <Header />

      <PageHeader
        kicker={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Editorial
          </>
        }
        title="Articles"
        meta={<span>Race breakdowns, previews and analysis, built on the timing data.</span>}
      />

      <main className="container py-8 md:py-10">
        {/* Filters */}
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-px overflow-hidden rounded border bg-border">
              <CategoryButton active={!activeCategory} onClick={() => setActiveCategory(null)}>
                All
              </CategoryButton>
              {ARTICLE_CATEGORIES.map((cat) => (
                <CategoryButton
                  key={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                >
                  {cat}
                </CategoryButton>
              ))}
            </div>
          </div>
          <FilterInput value={search} onChange={setSearch} placeholder="Search articles…" className="w-full lg:max-w-xs" />
        </div>

        {filtered.length === 0 && <EmptyState title="No articles found">Try a different search or category.</EmptyState>}

        {/* Featured lead */}
        {lead && !isFiltering && (
          <Link
            to={`/articles/${lead.slug}`}
            className="group grid overflow-hidden rounded border bg-card transition-colors hover:border-foreground/25 lg:grid-cols-[1.35fr_1fr]"
          >
            <div className="aspect-[16/9] overflow-hidden border-b bg-muted lg:aspect-auto lg:min-h-[340px] lg:border-b-0 lg:border-r">
              <img src={lead.heroImage} alt={lead.title} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col p-5 sm:p-7">
              <div className="label-caps flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-primary">Latest</span>
                <span aria-hidden>/</span>
                <span>{lead.category}</span>
              </div>
              <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-[1.02] tracking-tight text-foreground sm:text-4xl">
                {lead.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">{lead.excerpt}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
                <ArticleMeta article={lead} />
                <span className="flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                  Read article <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* List */}
        {list.length > 0 && (
          <section className={cn(!isFiltering && "mt-12")}>
            {!isFiltering && (
              <div className="mb-0 flex items-end justify-between border-b pb-2.5">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">More articles</h2>
                <span className="label-caps num">{list.length}</span>
              </div>
            )}
            <ul className={cn("divide-y border-b", isFiltering && "border-t")}>
              {list.map((article) => (
                <li key={article.slug}>
                  <Link
                    to={`/articles/${article.slug}`}
                    className="group grid gap-4 py-5 sm:grid-cols-[120px_minmax(0,1fr)_200px] sm:gap-6 md:py-6"
                  >
                    <div className="hidden sm:block">
                      <div className="num text-xs text-foreground">{formatDateRange(article.date)}</div>
                      <div className="label-caps mt-1.5">{article.category}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="label-caps mb-1.5 sm:hidden">
                        {article.category} <span aria-hidden>/</span>{" "}
                        <span className="num normal-case tracking-normal">{formatDateRange(article.date)}</span>
                      </div>
                      <h3 className="font-display text-xl font-bold uppercase leading-tight tracking-wide text-foreground transition-colors group-hover:text-primary md:text-2xl">
                        {article.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        {article.author} <span aria-hidden>·</span> <span className="num">{readingMinutes(article.body)}</span> min read
                      </div>
                    </div>
                    <div className="order-first aspect-[16/9] overflow-hidden rounded-sm border bg-muted sm:order-none">
                      <img src={article.heroImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function ArticleMeta({ article }: { article: Article }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="num text-foreground">{formatDateRange(article.date)}</span>
      <span aria-hidden>·</span>
      <span>{article.author}</span>
      <span aria-hidden>·</span>
      <span>
        <span className="num">{readingMinutes(article.body)}</span> min read
      </span>
    </div>
  );
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 whitespace-nowrap px-3 font-display text-xs font-semibold uppercase tracking-[0.1em] transition-colors",
        active ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
