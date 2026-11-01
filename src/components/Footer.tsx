import { Link } from "react-router-dom";
import { openSearch } from "@/components/Header";

const LINKS = [
  { to: "/results", label: "Races" },
  { to: "/series", label: "Championships" },
  { to: "/drivers", label: "Drivers" },
  { to: "/teams", label: "Teams" },
  { to: "/circuits", label: "Circuits" },
  { to: "/cars", label: "Cars" },
  { to: "/calendar", label: "Calendar" },
  { to: "/compare", label: "Compare" },
  { to: "/articles", label: "Articles" },
  { to: "/credits", label: "Credits" },
  { to: "/privacy", label: "Privacy" },
];

const Footer = () => (
  <footer className="mt-28 border-t">
    <div className="mx-auto max-w-[1320px] px-4 pb-10 pt-14 sm:px-6 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="display max-w-xl text-4xl leading-[1.05] sm:text-5xl">
            The record of motorsport, <em className="text-ink-2">lap by lap.</em>
          </p>
          <button onClick={openSearch} className="mt-6 inline-flex h-11 items-center gap-3 rounded-full border px-5 text-sm hover:bg-ink/[0.05]">
            Search the record <kbd className="rounded-md border bg-sheet px-1.5 font-mono text-[10px] text-ink-3">/</kbd>
          </button>
        </div>
        <nav className="grid grid-cols-2 gap-x-8 gap-y-2.5 self-end text-[15px] sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="link-u w-fit text-ink-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
        <img alt="Track Records" className="logo-adapt h-5 w-auto" src="/brand/logo.png" />
        <p className="text-xs text-ink-3">
          Results from official timing and scoring.{" "}
          <Link to="/credits" className="underline underline-offset-2 hover:text-ink">
            Sources and credits
          </Link>
          . © {new Date().getFullYear()} Track Records.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
