"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { LOCALE_COOKIE, type Locale, toLocale } from "@/lib/locale";

/** A year: long enough that the choice sticks, short enough to expire if
 *  nobody ever comes back. Re-set on every sign-in, so it does not decay. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Read by the server on every render; the client never needs it, but it is
    // a display preference, not a secret, so httpOnly would only get in the way
    // if a client component ever wants to read it.
    httpOnly: false,
  });
}

/**
 * Changes the interface language.
 *
 * Writes both places on purpose: the column so the choice follows the person
 * to their other devices, the cookie so rendering never has to ask the
 * database. The column first — if the cookie write somehow failed, the next
 * sign-in would repair it, whereas the reverse leaves a preference that looks
 * saved and silently isn't.
 */
export async function changeLocale(value: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");

  const locale = toLocale(value);
  await db.update(profiles).set({ locale }).where(eq(profiles.id, session.user.id));
  await setLocaleCookie(locale);

  return locale;
}
