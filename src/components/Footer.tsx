import { Link } from "react-router-dom";
import logoIcon from "@/assets/logo-icon.png";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-secondary/50 py-12">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={logoIcon} alt="TrackRecord" className="h-7 w-auto" />
              <span className="font-display text-lg font-bold tracking-wider">TrackRecord</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The verified motorsport driver profile platform.
            </p>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/search" className="hover:text-foreground transition-colors">Find Drivers</Link></li>
              <li><Link to="/auth" className="hover:text-foreground transition-colors">Driver Sign Up</Link></li>
              <li><Link to="/auth" className="hover:text-foreground transition-colors">Team Sign Up</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} TrackRecord. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
