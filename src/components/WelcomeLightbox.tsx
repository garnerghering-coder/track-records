import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const WelcomeLightbox = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem("welcome_seen");
    if (!seen) {
      setOpen(true);
      sessionStorage.setItem("welcome_seen", "1");
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card p-10 text-center shadow-2xl">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-display text-2xl font-bold text-card-foreground">
          Welcome to TrackRecord 🏁
        </h2>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          This site is brand new and still a work in progress. Some details, results, or profiles may be incomplete or inaccurate as we continue to build things out.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Thanks for stopping by — we appreciate you being here early!
        </p>
        <Button onClick={() => setOpen(false)} className="mt-8 w-full font-semibold">
          Got it, let's go!
        </Button>
      </div>
    </div>
  );
};

export default WelcomeLightbox;
