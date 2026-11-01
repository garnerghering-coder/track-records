import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

const CarsPage = () => {
  const [cars, setCars] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCars = async () => {
      setLoading(true);
      const query = supabase.from("v2_cars").select("*").order("model_name");
      const { data } = await query;
      let filtered = data ?? [];
      if (search.trim()) {
        const lower = search.toLowerCase();
        filtered = filtered.filter((c: any) =>
          c.model_name.toLowerCase().includes(lower) ||
          (c.manufacturer || "").toLowerCase().includes(lower)
        );
      }
      setCars(filtered);
      setLoading(false);
    };
    const debounce = setTimeout(fetchCars, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Cars" description="Browse car models used in motorsport." canonical="/cars" />
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">Cars</h1>
          <p className="mt-2 text-sm text-muted-foreground">Browse car models used in motorsport.</p>
        </div>
      </section>
      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search cars…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading cars…</p>
        ) : cars.length === 0 ? (
          <div className="text-center py-16"><p className="text-muted-foreground">No cars found.</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((car: any) => (
              <Link key={car.id} to={`/car/${car.id}`} className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-all">
                <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                  {[car.manufacturer, car.model_name].filter(Boolean).join(" ")}
                </h3>
                {car.manufacturer && <p className="text-sm text-muted-foreground mt-1">{car.manufacturer}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default CarsPage;
