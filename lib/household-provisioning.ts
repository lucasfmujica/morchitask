import { headers } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { channels, householdInvites, households, profiles } from "@/lib/db/schema";
import { DEFAULT_LOCALE, localeFromAcceptLanguage } from "@/lib/locale";
import { trialEndFrom } from "@/lib/billing";

const DEFAULT_CHANNELS = [
  { name: "Trabajo", color: "#0d9488", icon: "briefcase" },
  { name: "Hogar", color: "#ea580c", icon: "home" },
  { name: "Personal", color: "#7c3aed", icon: "sparkles" },
];

/**
 * Consumes a pending invite for `email` and returns the household it points at,
 * or null when there is none.
 *
 * Marking it accepted in the same statement that selects it is what stops one
 * invite from seeding two accounts: `accepted_at is null` is part of the
 * UPDATE, so a concurrent second call matches zero rows and gets null back.
 */
async function claimInvite(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;

  const [claimed] = await db
    .update(householdInvites)
    .set({ accepted_at: sql`now()` })
    .where(
      and(
        eq(householdInvites.email, email.toLowerCase()),
        isNull(householdInvites.accepted_at),
        gt(householdInvites.expires_at, sql`now()`),
      ),
    )
    .returning({ householdId: householdInvites.household_id });

  return claimed?.householdId ?? null;
}

/**
 * First guess at someone's language, from the browser that signed them up.
 * Only a starting point — Settings overrides it, and that choice wins from
 * then on. Never worth failing a sign-up over, so it falls back on any error.
 */
async function initialLocale() {
  try {
    return localeFromAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Gives a brand-new account somewhere to live: its own household, unless a
 * standing invite addressed to this email says to join an existing one.
 *
 * This is the multi-tenancy boundary. It used to drop every new sign-in into
 * whichever household was oldest, on the assumption that there would only ever
 * be one — which held for exactly two users, and would have put the third
 * inside their data. Joining someone else's space is now only possible when
 * someone already inside invited this specific address.
 *
 * Returns the household id the user was placed in.
 */
export async function provisionNewUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<string> {
  const invited = await claimInvite(user.email);

  // The trial belongs to the space, and only a new space gets one: joining
  // someone else's on an invite means joining whatever they are already paying
  // (or trialing), not starting a second fourteen days of your own.
  const householdId =
    invited ??
    (
      await db
        .insert(households)
        .values({ trial_ends_at: trialEndFrom() })
        .returning({ id: households.id })
    )[0].id;

  await db.insert(profiles).values({
    id: user.id,
    household_id: householdId,
    display_name: user.name ?? user.email?.split("@")[0] ?? "",
    avatar_url: user.image ?? null,
    locale: await initialLocale(),
  });

  // Channels are per-person, not per-household, so someone joining an existing
  // space needs their own set too — not just whoever created it. Must run after
  // the profile insert: `owner_id` points at it.
  await db.insert(channels).values(
    DEFAULT_CHANNELS.map((c, i) => ({
      household_id: householdId,
      owner_id: user.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      sort_order: i,
    })),
  );

  return householdId;
}
