import { Link } from "react-router-dom";

const COLS = [
  {
    title: "Results",
    links: [
      { to: "/results", label: "Latest results" },
      { to: "/series", label: "Series" },
    ],
  },
  {
    title: "Database",
    links: [
      { to: "/search?tab=drivers", label: "Drivers" },
      { to: "/teams", label: "Teams" },
      { to: "/search?tab=circuits", label: "Circuits" },
      { to: "/cars", label: "Cars" },
    ],
  },
  {
    title: "Track Records",
    links: [
      { to: "/articles", label: "Articles" },
      { to: "/calendar", label: "Calendar" },
      { to: "/privacy", label: "Privacy" },
    ],
  },
];

const Footer = () => (
  <footer className="mt-16 border-t bg-card/50">
    <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
      <div className="max-w-xs">
        <img alt="Track Records" className="logo-adapt h-6 w-auto" src="/brand/logo.png" />
        <p className="mt-3 text-sm text-muted-foreground">
          Multi-class sportscar results, timing analysis and driver records, linked together.
        </p>
      </div>
      {COLS.map((c) => (
        <div key={c.title}>
          <div className="label-caps mb-3">{c.title}</div>
          <ul className="space-y-2 text-sm">
            {c.links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-foreground/80 transition-colors hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="border-t">
      <div className="container flex flex-col justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} Track Records</span>
        <span>
          Press <kbd className="rounded-sm border bg-muted px-1 font-mono text-[10px]">/</kbd> anywhere to search
        </span>
      </div>
    </div>
  </footer>
);

export default Footer;
