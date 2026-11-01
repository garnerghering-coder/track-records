/**
 * Per-series points dispatch hook for import-imsa-results.
 *
 * The importer serves many Al Kamel series, but only some of them should get
 * championship points, and each with its own scale. This module answers ONE
 * question: "which points scheme applies to this series?". The actual point
 * values (IMSA_RACE_POINTS, getIMSARacePoints, getIMSAQualifyingPoints) stay in
 * index.ts and are owned by the points work.
 *
 * HOOK FOR THE POINTS IMPLEMENTATION — intended use inside buildResultRows():
 *
 *   const scheme = resolvePointsScheme(seriesName);
 *   switch (scheme) {
 *     case "imsa_wtscc": // race points + qualifying points
 *     case "imsa_mpc":   // race points only
 *     case "imsa_vprc":  // fill in when supported
 *     ...
 *     case "none":       // leave points null
 *   }
 *
 * Note for that wiring: the legacy isWeatherTechSeries() test in index.ts treats
 * ANY series whose name contains "imsa" (and not "pilot"/"michelin") as WeatherTech,
 * so "IMSA VP Racing SportsCar Challenge" or "IMSA ... Endurance Challenge" would get
 * WeatherTech race + qualifying points. resolvePointsScheme() distinguishes them.
 */

export type PointsScheme =
  | "imsa_wtscc"   // IMSA WeatherTech SportsCar Championship (race + qualifying points)
  | "imsa_mpc"     // IMSA Michelin Pilot Challenge (race points)
  | "imsa_vprc"    // IMSA VP Racing SportsCar Challenge (not yet implemented -> treat as none)
  | "mx5_cup"      // Mazda MX-5 Cup (not yet implemented)
  | "pccna"        // Porsche Carrera Cup North America (not yet implemented)
  | "lst_na"       // Lamborghini Super Trofeo North America (not yet implemented)
  | "mustang"      // Mustang Challenge (not yet implemented)
  | "none";        // no championship points recorded

const RULES: Array<{ scheme: PointsScheme; test: RegExp }> = [
  // Order matters: check the specific IMSA ladder series before WeatherTech's broad rule.
  { scheme: "imsa_mpc", test: /pilot\s*challenge|michelin\s*pilot|\bmpc\b|continental\s*tire\s*sportscar/i },
  { scheme: "imsa_vprc", test: /vp\s*racing|sportscar\s*challenge|\bvprc\b/i },
  { scheme: "mx5_cup", test: /mx-?5/i },
  { scheme: "pccna", test: /porsche\s*carrera\s*cup|\bpccna\b/i },
  { scheme: "lst_na", test: /super\s*trofeo|\blst\b/i },
  { scheme: "mustang", test: /mustang/i },
  { scheme: "imsa_wtscc", test: /weathertech|\bwtscc?\b|imsa\s*sportscar\s*championship/i },
];

/**
 * Returns the points scheme for a series, based on its name (and optional aliases).
 * Unknown series (endurance cups, historic races, test days, non-IMSA hosts) -> "none".
 */
export function resolvePointsScheme(seriesName: string, aliases: string[] = []): PointsScheme {
  const labels = [seriesName, ...aliases].filter(Boolean);
  for (const rule of RULES) {
    if (labels.some((l) => rule.test.test(l))) return rule.scheme;
  }
  return "none";
}
