import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, X } from "lucide-react";
import Header from "@/components/Header";
import SEOHead from "@/components/SEOHead";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup";

const INPUT = "h-11 rounded bg-background text-[15px] focus-visible:ring-1 focus-visible:ring-offset-0";
const PRIMARY_BTN =
  "h-11 w-full rounded bg-signal font-display text-sm font-bold uppercase tracking-[0.14em] text-signal-foreground hover:bg-signal/90";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>(searchParams.get("signup") ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerifyOverlay, setShowVerifyOverlay] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/");
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      setShowVerifyOverlay(true);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SEOHead title="Sign In" description="Sign in or create your Track Records account." canonical="/auth" noIndex />
      <Header />

      {/* Email verification dialog */}
      {showVerifyOverlay && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 px-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md rounded border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="label-caps flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Verify your email
              </span>
              <button
                onClick={() => setShowVerifyOverlay(false)}
                aria-label="Close"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded border text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <h2 id="verify-title" className="mt-5 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                Check your email
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We've sent a verification link to <span className="font-medium text-foreground">{email}</span>. Click the link in the email to
                verify your account.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Can't find it? <span className="font-medium text-foreground">Check your spam or junk folder</span>. It sometimes ends up there.
              </p>
              <div className="mt-7 flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowVerifyOverlay(false);
                    setMode("login");
                  }}
                  className={PRIMARY_BTN}
                >
                  Done verifying? Sign in
                </Button>
                <button
                  onClick={() => setShowVerifyOverlay(false)}
                  className="h-10 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Brand panel ────────────────────────────────────── */}
        <section className="relative hidden overflow-hidden border-r bg-card/40 lg:flex lg:flex-col lg:justify-between">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative px-12 pt-16 xl:px-16">
            <img alt="Track Records" className="logo-adapt h-14 w-auto" src="/lovable-uploads/c4e44093-bdee-41b1-bde6-0e0d54bf8054.png" />
            <h2 className="mt-12 max-w-md font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-foreground">
              Every lap. Every class.
              <br />
              <span className="text-primary">On the record.</span>
            </h2>
            <p className="mt-5 max-w-sm text-base text-muted-foreground">
              A free account lets you add results, drivers and teams, and suggest corrections to the record.
            </p>
          </div>
          <div className="relative px-12 pb-12 xl:px-16">
            <div className="grid max-w-md grid-cols-3 gap-px overflow-hidden rounded border bg-border">
              {[
                ["01", "Add results"],
                ["02", "Add drivers & teams"],
                ["03", "Suggest edits"],
              ].map(([n, label]) => (
                <div key={n} className="bg-card px-3.5 py-3">
                  <div className="num text-xs text-primary">{n}</div>
                  <div className="mt-1 font-display text-sm font-semibold uppercase leading-tight tracking-wide text-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Form ───────────────────────────────────────────── */}
        <section className="flex items-start justify-center px-4 py-10 sm:py-16 lg:items-center lg:px-12">
          <div className="w-full max-w-[400px]">
            <div className="label-caps flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> {isLogin ? "Account" : "New account"}
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight text-foreground">
              {isLogin ? "Welcome back" : "Join Track Records"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isLogin ? "Sign in to your account." : "Create your account and start contributing."}
            </p>

            {/* Mode switch */}
            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded border bg-border" role="tablist">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-9 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                    mode === m ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={isLogin ? handleLogin : handleSignup} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="firstName" label="First name">
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className={INPUT}
                    />
                  </Field>
                  <Field id="lastName" label="Last name">
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className={INPUT}
                    />
                  </Field>
                </div>
              )}
              <Field id="email" label="Email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={INPUT}
                />
              </Field>
              <Field id="password" label="Password" hint={mode === "signup" ? "At least 6 characters" : undefined}>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={INPUT}
                />
              </Field>
              <Button type="submit" className={cn(PRIMARY_BTN, "mt-2")} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" /> Please wait…
                  </>
                ) : isLogin ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            <div className="mt-6 border-t pt-5 text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="font-medium text-primary underline-offset-4 hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="font-medium text-primary underline-offset-4 hover:underline">
                    Sign in
                  </button>
                </>
              )}
              <p className="mt-3 text-xs">
                Read how we handle your data in our{" "}
                <Link to="/privacy" className="text-foreground underline underline-offset-2 hover:text-primary">
                  privacy policy
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="label-caps text-[11px] font-semibold leading-none">
          {label}
        </Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default Auth;
