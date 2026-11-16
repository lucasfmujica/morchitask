/**
 * Timezones as a person picks them: by city, with the IANA id underneath so
 * nothing is ambiguous. Pure, no language: the labels that are words live in
 * the catalog.
 */

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function zoneCity(zone: string): string {
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** "GMT-3", "GMT+5:30", "GMT". Depends on the date: zones change offset. */
export function zoneOffset(zone: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "GMT";
  } catch {
    return "GMT";
  }
}

/** Lowercase, no accents: "Asunción" and "asuncion" are the same search. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_/]/g, " ");
}

/**
 * Zones matching what someone typed, best first: a city that starts with the
 * query, then any part of the id that contains it. An empty query returns the
 * list as given.
 */
export function searchZones(zones: readonly string[], query: string): string[] {
  const q = fold(query).trim();
  if (!q) return [...zones];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const zone of zones) {
    if (fold(zoneCity(zone)).startsWith(q)) starts.push(zone);
    else if (fold(zone).includes(q)) contains.push(zone);
  }
  return [...starts, ...contains];
}

/** Shown before anyone types: where the app's people are, and the big hubs. */
export const COMMON_ZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
] as const;

/** Every zone this runtime knows, or the common ones where it cannot say. */
export function allZones(): string[] {
  try {
    const list = Intl.supportedValuesOf("timeZone");
    if (list.length > 0) return list;
  } catch {
    // Older engines: fall through.
  }
  return [...COMMON_ZONES];
}
