import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

const openSearch = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }));

const LINKS = [
  { to: "/results", label: "Latest results", sub: "Class winners and full classifications" },
  { to: "/calendar", label: "Calendar", sub: "What's next on track" },
  { to: "/series", label: "Series", sub: "Championships and seasons" },
  { to: "/", label: "Home", sub: "Back to the start line" },
];

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SEOHead title="Page Not Found" noIndex />
      <Header />

      <main className="relative flex-1 overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="container relative grid gap-10 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="label-caps flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-dnf" /> Error 404 <span aria-hidden>/</span> Route not found
            </div>
            <div className="mt-4 font-accent text-[7rem] leading-[0.85] text-foreground sm:text-[10rem] lg:text-[12rem]" aria-hidden>
              404
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-5xl">
              Off <span className="text-primary">track</span>
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              There's no page at{" "}
              <code className="break-all rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">{location.pathname}</code>. It
              may have moved, or the link may be wrong.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                to="/results"
                className="inline-flex h-10 items-center gap-2 rounded bg-signal px-5 font-display text-sm font-bold uppercase tracking-[0.14em] text-signal-foreground transition-colors hover:bg-signal/90"
              >
                Latest results <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={openSearch}
                className="inline-flex h-10 items-center gap-2 rounded border bg-card px-4 font-display text-sm font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent"
              >
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
          </div>

          <nav aria-label="Popular pages" className="min-w-0">
            <div className="label-caps mb-2">Get back on track</div>
            <div className="grid gap-px overflow-hidden rounded border bg-border">
              {LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="group flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base font-bold uppercase tracking-wide text-foreground">{l.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.sub}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
