import { useParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { articles } from "@/lib/articles-data";
import { formatDateRange } from "@/lib/date-utils";

function renderBody(body: string, images: { url: string; alt: string; caption?: string }[]) {
  const parts = body.split(/\{\{IMAGE:(\d+)\}\}/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const idx = parseInt(part, 10);
      const img = images[idx];
      if (!img) return null;
      return (
        <figure key={`img-${idx}`} className="my-8">
          <img
            src={img.url}
            alt={img.alt}
            className="w-full rounded-lg border border-border"
            loading="lazy"
          />
          {img.caption && (
            <figcaption className="mt-2 text-xs text-muted-foreground text-center italic">
              {img.caption}
            </figcaption>
          )}
        </figure>
      );
    }
    // Render markdown-like text
    return (
      <div key={`text-${i}`} className="article-prose">
        {part.split("\n\n").map((paragraph, pi) => {
          if (paragraph.startsWith("## ")) {
            return (
              <h2 key={pi} className="font-display text-xl font-bold text-foreground mt-8 mb-3">
                {paragraph.replace("## ", "")}
              </h2>
            );
          }
          if (paragraph.startsWith("- **")) {
            const items = paragraph.split("\n").filter(Boolean);
            return (
              <ul key={pi} className="list-disc list-inside space-y-1 my-4 text-sm text-foreground/90 leading-relaxed">
                {items.map((item, li) => {
                  const cleaned = item.replace(/^- /, "");
                  return (
                    <li key={li} dangerouslySetInnerHTML={{
                      __html: cleaned.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                    }} />
                  );
                })}
              </ul>
            );
          }
          if (paragraph.startsWith("1. ")) {
            const items = paragraph.split("\n").filter(Boolean);
            return (
              <ol key={pi} className="list-decimal list-inside space-y-1 my-4 text-sm text-foreground/90 leading-relaxed">
                {items.map((item, li) => {
                  const cleaned = item.replace(/^\d+\.\s/, "");
                  return (
                    <li key={li} dangerouslySetInnerHTML={{
                      __html: cleaned.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                    }} />
                  );
                })}
              </ol>
            );
          }
          if (!paragraph.trim()) return null;
          return (
            <p
              key={pi}
              className="text-sm text-foreground/90 leading-relaxed mb-4"
              dangerouslySetInnerHTML={{
                __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
              }}
            />
          );
        })}
      </div>
    );
  });
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background pt-14 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">Article Not Found</h1>
            <Link to="/articles" className="text-sm text-primary hover:underline">
              ← Back to Articles
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const related = articles.filter((a) => a.slug !== slug).slice(0, 3);

  return (
    <>
      <SEOHead
        title={article.title}
        description={article.excerpt}
        canonical={`/articles/${article.slug}`}
        ogImage={article.heroImage}
      />
      <Header />
      <main className="min-h-screen bg-background pt-14">
        {/* Hero */}
        <div className="w-full aspect-[21/9] max-h-[400px] overflow-hidden relative">
          <img
            src={article.heroImage}
            alt={article.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>

        <div className="container max-w-3xl -mt-20 relative z-10 pb-16">
          <Link
            to="/articles"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> All Articles
          </Link>

          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="text-[10px] font-medium">
              {article.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatDateRange(article.date)}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{article.author}</span>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">
            {article.title}
          </h1>

          <div className="flex flex-wrap gap-1.5 mb-8">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Body */}
          <div>{renderBody(article.body, article.images)}</div>

          {/* Related */}
          {related.length > 0 && (
            <div className="mt-16 pt-8 border-t border-border">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                Related Articles
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    to={`/articles/${r.slug}`}
                    className="group rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <div className="aspect-[16/9] overflow-hidden bg-secondary">
                      <img
                        src={r.heroImage}
                        alt={r.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3">
                      <Badge variant="secondary" className="text-[10px] mb-1.5">
                        {r.category}
                      </Badge>
                      <h3 className="font-display text-sm font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">
                        {r.title}
                      </h3>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
