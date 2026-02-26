import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export default function ManageCarLiveries() {
  const qc = useQueryClient();
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [carNumber, setCarNumber] = useState("");
  const [uploading, setUploading] = useState(false);

  // Fetch seasons
  const { data: seasons = [] } = useQuery({
    queryKey: ["manage_seasons_for_liveries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_seasons" as any)
        .select("id, year, v2_series(name)")
        .order("year", { ascending: false });
      return (data || []) as any[];
    },
  });

  // Fetch liveries for selected season
  const { data: liveries = [] } = useQuery({
    queryKey: ["manage_liveries", selectedSeason],
    queryFn: async () => {
      if (!selectedSeason) return [];
      const { data } = await supabase
        .from("v2_car_liveries" as any)
        .select("*")
        .eq("season_id", selectedSeason)
        .order("car_number");
      return (data || []) as any[];
    },
    enabled: !!selectedSeason,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !selectedSeason || !carNumber.trim()) {
      toast.error("Select a season and enter a car number first");
      return;
    }
    setUploading(true);
    const file = e.target.files[0];
    const ext = file.name.split(".").pop() || "png";
    const path = `${selectedSeason}/${carNumber.trim()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from("car-liveries").upload(path, file, { upsert: true });
    if (uploadErr) {
      toast.error("Upload failed: " + uploadErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("car-liveries").getPublicUrl(path);
    const imageUrl = urlData.publicUrl;

    // Upsert into v2_car_liveries
    const { error: dbErr } = await supabase.from("v2_car_liveries" as any).upsert(
      { season_id: selectedSeason, car_number: carNumber.trim(), image_url: imageUrl },
      { onConflict: "season_id,car_number" }
    );

    if (dbErr) {
      toast.error("DB save failed: " + dbErr.message);
    } else {
      toast.success(`Livery uploaded for #${carNumber.trim()}`);
      setCarNumber("");
      qc.invalidateQueries({ queryKey: ["manage_liveries", selectedSeason] });
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (livery: any) => {
    const { error } = await supabase.from("v2_car_liveries" as any).delete().eq("id", livery.id);
    if (error) {
      toast.error("Delete failed");
    } else {
      toast.success(`Deleted livery for #${livery.car_number}`);
      qc.invalidateQueries({ queryKey: ["manage_liveries", selectedSeason] });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Car Liveries</h2>
      <p className="text-sm text-muted-foreground">Upload livery images (922×235 recommended) for each car number in a season. These appear on the event dashboard preview.</p>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedSeason}
          onChange={e => setSelectedSeason(e.target.value)}
          className="bg-muted border border-border rounded px-3 py-2 text-sm"
        >
          <option value="">Select a season…</option>
          {seasons.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.v2_series?.name || "Unknown"} {s.year}
            </option>
          ))}
        </select>
      </div>

      {/* Upload form */}
      {selectedSeason && (
        <div className="flex items-center gap-3">
          <Input
            placeholder="Car number (e.g. 7)"
            value={carNumber}
            onChange={e => setCarNumber(e.target.value)}
            className="w-32"
          />
          <label className="cursor-pointer">
            <Button variant="secondary" size="sm" disabled={uploading || !carNumber.trim()} asChild>
              <span>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploading ? "Uploading…" : "Upload Image"}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </span>
            </Button>
          </label>
        </div>
      )}

      {/* Existing liveries */}
      {selectedSeason && liveries.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveries.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono font-bold">{l.car_number}</TableCell>
                  <TableCell>
                    <img src={l.image_url} alt={`#${l.car_number}`} className="h-8 object-contain" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(l)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedSeason && liveries.length === 0 && (
        <p className="text-sm text-muted-foreground">No liveries uploaded for this season yet.</p>
      )}
    </div>
  );
}
