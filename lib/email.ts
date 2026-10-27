/**
 * A deliberately loose check: one @, something either side, a dot in the
 * domain, no whitespace.
 *
 * Stricter regexes reject addresses that are actually valid (plus-tags,
 * new TLDs, unicode domains) and still can't tell you whether a mailbox
 * exists. This exists to catch a typo before it becomes an invite nobody
 * can claim — the real check is whether the invitee ever signs in.
 */
export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}
