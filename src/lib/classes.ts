/**
 * Class colors shared across results, cards and charts.
 * Season-specific colors from `v2_season_classes.color` take precedence;
 * these defaults match the ones used by the timing charts.
 */
export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  GTP: "#e63946",
  GTDPRO: "#457b9d",
  GTD: "#2a9d8f",
  LMP2: "#e9c46a",
  LMP3: "#f4a261",
  GS: "#4f7c8a",
  TCR: "#a855f7",
};

export const CLASS_ORDER = ["GTP", "LMP2", "LMP3", "GTDPRO", "GTD", "GS", "TCR"];

const norm = (c: string) => c.toUpperCase().replace(/[\s_-]/g, "");

export function getClassColor(cls: string | null | undefined, overrides?: Record<string, string | null | undefined>): string {
  if (!cls) return "#71717a";
  const o = overrides?.[cls] || overrides?.[cls.toUpperCase()];
  if (o) return o;
  return DEFAULT_CLASS_COLORS[norm(cls)] || "#71717a";
}

export function sortClasses(a: string, b: string): number {
  const ia = CLASS_ORDER.indexOf(norm(a));
  const ib = CLASS_ORDER.indexOf(norm(b));
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
}

/** Display name for a class code ("GTDPRO" → "GTD PRO"). */
const CLASS_LABELS: Record<string, string> = { GTDPRO: "GTD PRO" };
export function classLabel(cls: string | null | undefined): string {
  if (!cls) return "";
  return CLASS_LABELS[cls.toUpperCase().replace(/[\s_-]/g, "")] || cls;
}
