import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, profiles, sessions, users, verificationTokens } from "@/lib/db/schema";
import { provisionNewUser } from "@/lib/household-provisioning";
import { setLocaleCookie } from "@/lib/actions/locale";
import { toLocale } from "@/lib/locale";

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
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        },
      },
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
      return session;
    },
    /**
     * The Adapter only persists tokens the first time an (provider,
     * providerAccountId) pair links — a returning sign-in with a fresh
     * Calendar consent (e.g. the "reconnect" button in Settings) would
     * otherwise be silently dropped. `prompt: consent` above means Google
     * returns a refresh_token on every sign-in, so persist it ourselves.
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

      if (account?.provider === "google" && account.refresh_token && user.id) {
        await db
          .update(accounts)
          .set({
            refresh_token: account.refresh_token,
            access_token: account.access_token ?? null,
            expires_at: account.expires_at ?? null,
            scope: account.scope ?? null,
          })
          .where(and(eq(accounts.userId, user.id), eq(accounts.provider, "google")));
        await db
          .update(profiles)
          .set({ google_calendar_connected: true })
          .where(eq(profiles.id, user.id));
      }
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
