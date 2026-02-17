import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
            <span className="font-display text-sm font-bold text-primary-foreground">TR</span>
          </div>
          <span className="font-display text-xl font-bold tracking-wider text-foreground">
            TrackRecord
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/search" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Search className="h-4 w-4" />
            Find Drivers
          </Link>
          <Link to="/auth">
            <Button variant="outline" size="sm">Log In</Button>
          </Link>
          <Link to="/auth?signup=true">
            <Button size="sm">Sign Up</Button>
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link to="/auth">
            <Button size="sm">Sign Up</Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
