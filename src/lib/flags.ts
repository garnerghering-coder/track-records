/**
 * Flag states across series, normalised: IMSA (FCY), F1 (SC, VSC), NASCAR and
 * INDYCAR (caution / yellow), WEC (Code 60). Importers store the official
 * state string in v2_flag_segments.flag_state; pages map it through here.
 */
export type FlagKey = "GREEN" | "YELLOW" | "CAUTION" | "FCY" | "SC" | "VSC" | "CODE60" | "RED" | "CHEQUERED";

export function normalizeFlag(state: string | null | undefined): FlagKey {
  const s = (state || "").toUpperCase().replace(/[\s_-]+/g, " ").trim();
  if (/VSC|VIRTUAL/.test(s)) return "VSC";
  if (/\bSC\b|SAFETY/.test(s)) return "SC";
  if (/RED/.test(s)) return "RED";
  if (/CHEQ|CHECK|FINISH/.test(s)) return "CHEQUERED";
  if (/CODE ?60/.test(s)) return "CODE60";
  if (/FCY|FULL/.test(s)) return "FCY";
  if (/CAUTION/.test(s)) return "CAUTION";
  if (/YELLOW|SLOW/.test(s)) return "YELLOW";
  return "GREEN";
}
