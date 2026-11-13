import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, profiles, sessions, users, verificationTokens } from "@/lib/db/schema";
import { applyGoogleGrant } from "@/lib/db/queries/google";
import { SIGN_IN_AUTHORIZATION_PARAMS } from "@/lib/google-grant";
import { provisionNewUser } from "@/lib/household-provisioning";
import { setLocaleCookie } from "@/lib/actions/locale";
import { toLocale } from "@/lib/locale";
import { resolveAccess } from "@/lib/billing";
import { billingFacts } from "@/lib/db/queries/subscriptions";
import { isBillingEnabled } from "@/lib/billing-config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      // Identity only. Calendar is a separate, later grant: asking for it here
      // put every new sign-up behind Google's unverified-app block. See
      // lib/google-grant.ts for both sets of params.
      authorization: { params: SIGN_IN_AUTHORIZATION_PARAMS },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      const [profile] = await db
        .select({ householdId: profiles.household_id, locale: profiles.locale })
        .from(profiles)
        .where(eq(profiles.id, user.id));

      session.user.id = user.id;
      session.householdId = profile?.householdId ?? null;
      session.locale = toLocale(profile?.locale);

      // Resolved here so the proxy can gate on it without a database round trip
      // of its own — it runs on every request, including every asset that slips
      // through the matcher. One extra query on a callback that was already
      // hitting the database is the cheap version of that.
      //
      // Two cases fall through to "open": no household, which means provisioning
      // has not finished, and billing switched off, which means there is nowhere
      // to pay yet. Bouncing a brand-new sign-up to a paywall a millisecond
      // before their trial row exists — or to one with no checkout behind it —
      // is worse than a day of free use.
      const facts =
        isBillingEnabled() && profile?.householdId ? await billingFacts(profile.householdId) : null;
      session.access = facts
        ? resolveAccess(facts)
        : {
            allowed: true,
            source: "none",
            until: null,
            trialDaysLeft: null,
            paymentFailing: false,
          };
      return session;
    },
    /**
     * The Adapter only persists tokens the first time an (provider,
     * providerAccountId) pair links — a returning sign-in with a fresh
     * Calendar consent (the "connect" button in Settings) would otherwise be
     * silently dropped, so persist it ourselves.
     *
     * Only a grant that carries Calendar access is written. A plain login now
     * comes back with identity scopes only; this used to overwrite the stored
     * tokens with whatever came back, which would quietly disconnect the
     * calendar of everyone who logged in again.
     */
    async signIn({ user, account }) {
      // Re-point the rendering cookie at whatever this account chose, and
      // refresh its expiry. This is what makes the preference travel: sign in
      // on a new phone and the column, not that browser, decides the language.
      if (user.id) {
        const [profile] = await db
          .select({ locale: profiles.locale })
          .from(profiles)
          .where(eq(profiles.id, user.id));
        // Never block a sign-in over a display preference.
        await setLocaleCookie(toLocale(profile?.locale)).catch(() => {});
      }

      if (user.id) await applyGoogleGrant(user.id, account);
      return true;
    },
  },
  events: {
    /**
     * Ported from Supabase's `handle_new_user` trigger. Fires exactly once,
     * right after the Adapter inserts a brand-new user row.
     *
     * Every new account gets a household of its own. The only way into someone
     * else's is a standing invite addressed to this email — an explicit act by
     * someone already inside.
     *
     * This used to join whichever household was oldest, on the assumption that
     * there would only ever be one. That assumption held for exactly two users;
     * a third sign-up would have landed inside their data.
     */
    async createUser({ user }) {
      if (!user.id) return;
      await provisionNewUser({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      });
    },
  },
});
