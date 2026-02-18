import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;

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

const categoryLabels: Record<string, string> = Object.fromEntries(categoryOptions.filter(c => c.value !== "all").map(c => [c.value, c.label]));

const SearchPage = () => {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [nationality, setNationality] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDrivers = async () => {
      setLoading(true);

      let query = supabase.from("driver_profiles").select("*");

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
      }
      if (category !== "all") {
        query = query.eq("primary_category", category as any);
      }
      if (nationality) {
        query = query.ilike("nationality", `%${nationality}%`);
      }

      query = query.order("updated_at", { ascending: false });

      const { data } = await query;
      setDrivers(data ?? []);
      setLoading(false);
    };

    const debounce = setTimeout(fetchDrivers, 300);
    return () => clearTimeout(debounce);
  }, [search, category, nationality]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="pt-24 pb-10"
        style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}
      >
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
            Find Drivers
          </h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Search and filter motorsport talent by name, category, and nationality.
          </p>
        </div>
      </section>

      <div className="container py-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Nationality…"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full sm:w-[160px]"
          />
        </div>

        {/* Results */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading drivers…</p>
        ) : drivers.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No drivers found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map(driver => (
              <Link
                key={driver.id}
                to={`/driver/${driver.id}`}
                className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-primary/10">
                    <span className="text-primary font-display text-lg font-bold">{driver.first_name[0]}{driver.last_name[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                        {driver.first_name} {driver.last_name}
                      </h3>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {driver.nationality && (
                        <span className="inline-flex items-center gap-1"><FlagImage nationality={driver.nationality} size={16} /> {driver.nationality}</span>
                      )}
                      {driver.primary_category && <span>{categoryLabels[driver.primary_category] || driver.primary_category}</span>}
                    </div>
                  </div>
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

export default SearchPage;
