/**
 * Facts the legal pages state, kept out of the message catalogs.
 *
 * A date and an address are not translations — duplicating them per language is
 * how the English terms end up claiming a different last-updated date than the
 * Spanish ones. They live here so both read the same value.
 */

/** Bump when the wording actually changes, not on every deploy. */
export const LEGAL_UPDATED = "2026-08-26";

/**
 * TODO before launch: this needs to be an address on the real domain. Google's
 * OAuth verification checks that the privacy policy is reachable on the
 * verified domain and that the contact is real, so a gmail address here is a
 * likely rejection.
 */
export const LEGAL_CONTACT_EMAIL = "lucasfmujica@gmail.com";
