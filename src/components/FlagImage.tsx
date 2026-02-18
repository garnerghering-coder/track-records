import { Globe } from "lucide-react";
import { getCountryCode } from "@/lib/countries";

interface FlagImageProps {
  nationality: string | null | undefined;
  size?: number;
  className?: string;
}

const FlagImage = ({ nationality, size = 20, className }: FlagImageProps) => {
  const code = getCountryCode(nationality);

  if (!code) {
    return <Globe className="text-muted-foreground" style={{ width: size, height: size }} />;
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={nationality || ""}
      width={size}
      height={Math.round(size * 0.75)}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", objectFit: "contain" }}
      loading="lazy"
    />
  );
};

export default FlagImage;
