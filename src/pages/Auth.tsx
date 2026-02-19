import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, X } from "lucide-react";
import Header from "@/components/Header";

type AuthMode = "login" | "signup";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Email verification lightbox */}
      {showVerifyOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card p-10 text-center shadow-2xl">
            <button
              onClick={() => setShowVerifyOverlay(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold text-card-foreground">
              Check Your Email
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              We've sent a verification link to <span className="text-foreground font-medium">{email}</span>.
              Click the link in the email to verify your account.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Can't find it? <span className="text-foreground font-medium">Check your spam or junk folder</span> — it sometimes ends up there.
            </p>
            <div className="mt-8 space-y-3">
              <Button
                onClick={() => { setShowVerifyOverlay(false); setMode("login"); }}
                className="w-full"
              >
                Done verifying? Sign In
              </Button>
              <button
                onClick={() => setShowVerifyOverlay(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-screen items-center justify-center pt-16 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
            <div className="text-center mb-6">
              <h1 className="font-display text-2xl font-bold text-card-foreground">
                {mode === "login" ? "Welcome Back" : "Join TrackRecord"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login" ? "Sign in to your account" : "Create your account and start contributing"}
              </p>
            </div>

            <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName" className="text-card-foreground">First Name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-card-foreground">Last Name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="email" className="text-card-foreground">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password" className="text-card-foreground">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" className="w-full font-semibold" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-primary font-medium hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
