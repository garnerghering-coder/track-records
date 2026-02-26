import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Upload, Save, X } from "lucide-react";
import { toast } from "sonner";

interface StagedFile {
  file: File;
  preview: string;
  carNumber: string;
}

export default function ManageCarLiveries() {
  const qc = useQueryClient();
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: seasons = [] } = useQuery({
    queryKey: ["manage_seasons_for_liveries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_seasons")
        .select("id, year, v2_series(name)")
        .order("year", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: liveries = [] } = useQuery({
    queryKey: ["manage_liveries", selectedSeason],
    queryFn: async () => {
      if (!selectedSeason) return [];
      const { data } = await supabase
        .from("v2_car_liveries")
        .select("*")
        .eq("season_id", selectedSeason)
        .order("car_number");
      return (data || []) as any[];
    },
    enabled: !!selectedSeason,
  });

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: StagedFile[] = Array.from(e.target.files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      carNumber: "",
    }));
    setStagedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const updateCarNumber = (index: number, value: string) => {
    setStagedFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, carNumber: value } : f))
    );
  };

  const removeStaged = (index: number) => {
    setStagedFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSaveAll = async () => {
    const ready = stagedFiles.filter((f) => f.carNumber.trim());
    if (!ready.length) {
      toast.error("Assign at least one car number before saving");
      return;
    }
    if (!selectedSeason) {
      toast.error("Select a season first");
      return;
    }

    setSaving(true);
    let successCount = 0;

    for (const staged of ready) {
      const ext = staged.file.name.split(".").pop() || "png";
      const path = `${selectedSeason}/${staged.carNumber.trim()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("car-liveries")
        .upload(path, staged.file, { upsert: true });

      if (uploadErr) {
        toast.error(`Upload failed for #${staged.carNumber}: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage.from("car-liveries").getPublicUrl(path);

      const { error: dbErr } = await supabase
        .from("v2_car_liveries")
        .upsert(
          {
            season_id: selectedSeason,
            car_number: staged.carNumber.trim(),
            image_url: urlData.publicUrl,
          },
          { onConflict: "season_id,car_number" }
        );

      if (dbErr) {
        toast.error(`DB save failed for #${staged.carNumber}: ${dbErr.message}`);
      } else {
        successCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Saved ${successCount} livery image${successCount > 1 ? "s" : ""}`);
      setStagedFiles((prev) => prev.filter((f) => !f.carNumber.trim()));
      qc.invalidateQueries({ queryKey: ["manage_liveries", selectedSeason] });
    }
    setSaving(false);
  };

  const handleDelete = async (livery: any) => {
    const { error } = await supabase.from("v2_car_liveries").delete().eq("id", livery.id);
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
      <p className="text-sm text-muted-foreground">
        Upload livery images (922×235 recommended). Drop multiple files, then assign car numbers.
      </p>

      {/* Season selector */}
      <select
        value={selectedSeason}
        onChange={(e) => setSelectedSeason(e.target.value)}
        className="bg-muted border border-border rounded px-3 py-2 text-sm"
      >
        <option value="">Select a season…</option>
        {seasons.map((s: any) => (
          <option key={s.id} value={s.id}>
            {s.v2_series?.name || "Unknown"} {s.year}
          </option>
        ))}
      </select>

      {/* Upload area */}
      {selectedSeason && (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Add Images
          </Button>

          {/* Staged files grid */}
          {stagedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stagedFiles.map((staged, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-lg p-3 space-y-2 bg-muted/30"
                  >
                    <div className="relative">
                      <img
                        src={staged.preview}
                        alt="Staged livery"
                        className="w-full h-auto rounded object-contain bg-background"
                        style={{ aspectRatio: "922/235" }}
                      />
                      <button
                        onClick={() => removeStaged(i)}
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Car # (e.g. 7)"
                      value={staged.carNumber}
                      onChange={(e) => updateCarNumber(i, e.target.value)}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={saving || !stagedFiles.some((f) => f.carNumber.trim())}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "Saving…" : `Save ${stagedFiles.filter((f) => f.carNumber.trim()).length} Liveries`}
              </Button>
            </div>
          )}
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

      {selectedSeason && liveries.length === 0 && stagedFiles.length === 0 && (
        <p className="text-sm text-muted-foreground">No liveries uploaded for this season yet.</p>
      )}
    </div>
  );
}
