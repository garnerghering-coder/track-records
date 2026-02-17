import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Shield, Search, Trophy, Users, ChevronRight, CheckCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const benefits = [
  {
    icon: Shield,
    title: "Verified Results",
    description: "Every race result can be admin-verified, giving teams and sponsors confidence in the data they see.",
  },
  {
    icon: Search,
    title: "Discoverable Profiles",
    description: "Teams and sponsors search by category, nationality, license grade, and more to find the right talent.",
  },
  {
    icon: Trophy,
    title: "Complete Race History",
    description: "Build a comprehensive career record — series, championships, and individual race finishes all in one place.",
  },
  {
    icon: Users,
    title: "Claim Your Profile",
    description: "Profiles can exist before drivers join. Claim yours and take control of your career narrative.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section
        className="relative flex min-h-[90vh] items-center justify-center overflow-hidden pt-16"
        style={{ background: "var(--hero-gradient)" }}
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzEuNjYgMCAzIDEuMzQgMyAzcy0xLjM0IDMtMyAzLTMtMS4zNC0zLTMgMS4zNC0zIDMtMyIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1 className="font-display text-5xl font-bold leading-tight tracking-wide text-white sm:text-6xl lg:text-7xl">
              Your Racing Career,
              <br />
              <span className="text-primary">Verified.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 font-body">
              TrackRecord gives motorsport drivers a verified, data-driven profile.
              Teams and sponsors search and discover talent backed by real results.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link to="/auth?signup=true">
                <Button size="lg" className="gap-2 text-base font-semibold px-8">
                  Create Your Profile <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/search">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 text-base border-white/20 text-white hover:bg-white/10 hover:text-white px-8"
                >
                  <Search className="h-4 w-4" /> Find Drivers
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Benefits */}
      <section className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Why TrackRecord?
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              A platform built for motorsport — connecting drivers with teams and sponsors through verified career data.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="rounded-lg border border-border bg-card p-6 shadow-sm"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <b.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {b.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-secondary/50 py-24">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-center sm:text-4xl mb-16">
            How It Works
          </h2>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { step: "01", title: "Create or Claim", desc: "Sign up as a driver and create your profile — or claim an existing one that's already been seeded." },
              { step: "02", title: "Add Results", desc: "Log your race results with series, season, and finishing data. Results are submitted for admin verification." },
              { step: "03", title: "Get Discovered", desc: "Teams and sponsors search the platform to find drivers by category, nationality, and verified performance." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="text-center"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground font-display text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container">
          <div
            className="relative overflow-hidden rounded-2xl p-12 text-center"
            style={{ background: "var(--hero-gradient)" }}
          >
            <div className="relative z-10">
              <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
                Ready to Build Your Track Record?
              </h2>
              <p className="mt-4 text-white/70 max-w-lg mx-auto">
                Join the platform where your racing career speaks for itself — verified, discoverable, professional.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link to="/auth?signup=true">
                  <Button size="lg" className="gap-2 px-8 font-semibold">
                    <CheckCircle className="h-4 w-4" /> Sign Up as a Driver
                  </Button>
                </Link>
                <Link to="/auth?signup=true&role=team">
                  <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white px-8">
                    I'm a Team / Sponsor
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
