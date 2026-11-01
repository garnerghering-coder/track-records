import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import Header, { openSearch } from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { useLayouts } from "@/site/data";
import { Eyebrow, Page, TrackMap } from "@/site/ui";

const LINKS = [
  { to: "/results", label: "Races", sub: "Every race, replayable" },
  { to: "/series", label: "Championships", sub: "Points races and standings" },
  { to: "/drivers", label: "Drivers", sub: "Career records" },
  { to: "/", label: "The Paddock", sub: "Back to the start line" },
];

const NotFound = () => {
  const { pathname } = useLocation();
  const layouts = useLayouts();
  // a random circuit as the "you are lost" art, stable per path
  const art = layouts?.length ? layouts[[...pathname].reduce((n, c) => n + c.charCodeAt(0), 0) % layouts.length] : undefined;

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <SEOHead title="Page not found" noIndex />
      <Header />
      <Page className="pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <Eyebrow>Error 404 · Off the record</Eyebrow>
            <div className="mt-4 font-accent text-[8rem] leading-[0.8] sm:text-[12rem]" aria-hidden>
              404
            </div>
            <h1 className="display mt-6 text-[2.8rem] leading-[0.95] sm:text-[4rem]">
              You&rsquo;ve gone <em>off track.</em>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
              There&rsquo;s nothing at <code className="break-all rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[14px] text-ink">{pathname}</code>. It may have moved, or the link may be wrong.
            </p>
            <button onClick={openSearch} className="mt-8 inline-flex h-12 items-center gap-3 rounded-full bg-ink pl-5 pr-6 text-[15px] font-medium text-paper transition-transform hover:scale-[1.02]">
              <Search className="h-4 w-4" /> Search the record
              <kbd className="rounded-md bg-paper/15 px-1.5 py-0.5 font-mono text-[11px]">/</kbd>
            </button>
          </div>
          <div className="relative hidden aspect-[4/3] lg:block">
            <TrackMap key={art?.layout_image_url} src={art?.layout_image_url} alt="" className="absolute inset-0 m-auto h-[80%] w-[85%] opacity-[0.12]" />
          </div>
        </div>

        <nav className="mt-20 grid gap-x-10 border-t sm:grid-cols-2" aria-label="Where to go instead">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="group flex items-baseline justify-between gap-4 border-b py-5">
              <span className="display text-4xl transition-transform duration-300 group-hover:translate-x-1.5">{l.label}</span>
              <span className="flex items-center gap-2 text-right text-xs text-ink-3">
                {l.sub} <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </nav>
      </Page>
      <Footer />
    </div>
  );
};

export default NotFound;
