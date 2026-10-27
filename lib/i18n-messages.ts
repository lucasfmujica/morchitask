import "server-only";
import { getMessages } from "next-intl/server";

/**
 * The slice of the catalog a route group actually needs, in the browser.
 *
 * `NextIntlClientProvider` serializes whatever it is given into the HTML, and
 * given nothing it takes everything: 29 KB of strings on every page, including
 * the ones a stranger reads before deciding whether to sign up. The landing was
 * shipping the wording of the shutdown ritual and the Pomodoro timer to people
 * who cannot reach either.
 *
 * So each route group asks for its own namespaces. The cost of getting this
 * wrong is visible rather than silent — a missing namespace renders the key
 * (`settings.title`) instead of the text, and an E2E spec asserts that the
 * landing does not carry the app's private namespaces, so the trimming cannot
 * quietly revert the next time someone edits a layout.
 */
export async function pickMessages(namespaces: readonly string[]) {
  const all = (await getMessages()) as Record<string, unknown>;
  return Object.fromEntries(namespaces.filter((n) => n in all).map((n) => [n, all[n]]));
}

/** What the pages a logged-out visitor can reach are built from. */
export const PUBLIC_NAMESPACES = ["marketing", "pricing", "legal"] as const;

/** The sign-in screen, which is its own small world. */
export const AUTH_NAMESPACES = ["auth"] as const;
