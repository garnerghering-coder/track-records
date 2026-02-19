import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const categoryOptions = [
  { value: "all", label: "All Categories" },
  { value: "karting", label: "Karting" },
  { value: "single_seater", label: "Single Seater" },
  { value: "gt", label: "GT" },
  { value: "touring_car", label: "Touring Car" },
  { value: "sports_car", label: "Sports Car" },
  { value: "rally", label: "Rally" },
  { value: "endurance", label: "Endurance" },
  { value: "formula", label: "Formula" },
  { value: "stock_car", label: "Stock Car" },
  { value: "other", label: "Other" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(
  categoryOptions.filter(c => c.value !== "all").map(c => [c.value, c.label])
);

const CarsPage = () => {
  const [cars, setCars] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCars = async () => {
      setLoading(true);
      let query = supabase.from("car_models").select("*").order("name");
      if (category !== "all") query = query.eq("category", category as any);
      const { data } = await query;
      let filtered = data ?? [];
      if (search.trim()) {
        const lower = search.toLowerCase();
        filtered = filtered.filter((c: any) =>
          c.name.toLowerCase().includes(lower) ||
          (c.manufacturer || "").toLowerCase().includes(lower)
        );
      }
      setCars(filtered);
      setLoading(false);
    };
    const debounce = setTimeout(fetchCars, 300);
    return () => clearTimeout(debounce);
  }, [search, category]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">Cars</h1>
          <p className="mt-2 text-sm text-muted-foreground">Browse car models and platforms used in motorsport.</p>
        </div>
      </section>
      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search cars…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading cars…</p>
        ) : cars.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No cars found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((car: any) => (
              <Link key={car.id} to={`/car/${car.id}`} className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-all">
                <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{car.name}</h3>
                {car.manufacturer && <p className="text-sm text-muted-foreground mt-1">{car.manufacturer}</p>}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {car.category && <Badge variant="secondary" className="text-xs">{categoryLabels[car.category] || car.category}</Badge>}
                  {car.year_introduced && <span className="text-xs text-muted-foreground">{car.year_introduced}</span>}
                </div>
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
