import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DriverPhotoUploadProps {
  currentUrl: string | null;
  driverId?: string;
  onUploaded: (url: string | null) => void;
  size?: "sm" | "lg";
}

const DriverPhotoUpload = ({ currentUrl, driverId, onUploaded, size = "lg" }: DriverPhotoUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const dim = size === "lg" ? "h-28 w-28" : "h-16 w-16";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${driverId || crypto.randomUUID()}/photo.${ext}`;

    const { error } = await supabase.storage.from("driver-photos").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("driver-photos").getPublicUrl(path);
    onUploaded(publicUrl);
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className={`${dim} relative rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center cursor-pointer group`}
        onClick={() => fileRef.current?.click()}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="Driver" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>
      {currentUrl && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onUploaded(null)}>
          <X className="h-4 w-4 mr-1" /> Remove
        </Button>
      )}
    </div>
  );
};

export default DriverPhotoUpload;
