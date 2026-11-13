/** The first word of a display name, for tight labels ("Quitar a Ana"). Falls
 *  back to the whole string when there is only one word. */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}
