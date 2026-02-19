import { Link } from "react-router-dom";
import logoFull from "@/assets/logo-full.png";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-card py-12">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center mb-3">
              <img src={logoFull} alt="Track Records" className="h-7 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground font-light">
              The searchable motorsport database.
            </p>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-foreground">Discover</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/search" className="hover:text-foreground transition-colors">Search</Link></li>
              <li><Link to="/results" className="hover:text-foreground transition-colors">Race Results</Link></li>
              <li><Link to="/calendar" className="hover:text-foreground transition-colors">Calendar</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-foreground">Browse</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/search?q=" className="hover:text-foreground transition-colors">Drivers</Link></li>
              <li><Link to="/teams" className="hover:text-foreground transition-colors">Teams</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-foreground">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/contribute" className="hover:text-foreground transition-colors">Contribute</Link></li>
              <li><Link to="/auth" className="hover:text-foreground transition-colors">Sign Up</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground font-light">
          © {new Date().getFullYear()} Track Records. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
