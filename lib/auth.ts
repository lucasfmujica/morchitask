import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  channels,
  households,
  profiles,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";

const DEFAULT_CHANNELS = [
  { name: "Trabajo", color: "#0d9488", icon: "briefcase" },
  { name: "Hogar", color: "#ea580c", icon: "home" },
  { name: "Personal", color: "#7c3aed", icon: "sparkles" },
];

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
        .select({ householdId: profiles.household_id })
        .from(profiles)
        .where(eq(profiles.id, user.id));

      session.user.id = user.id;
      session.householdId = profile?.householdId ?? null;
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
     * right after the Adapter inserts a brand-new user row. This app is
     * permanently a 2-person household — every new sign-in joins whichever
     * household already exists (creating one with default channels only the
     * very first time, i.e. never in practice post-migration).
     */
    async createUser({ user }) {
      if (!user.id) return;

      let [household] = await db
        .select({ id: households.id })
        .from(households)
        .orderBy(asc(households.created_at))
        .limit(1);

      if (!household) {
        [household] = await db.insert(households).values({}).returning({ id: households.id });
        await db.insert(channels).values(
          DEFAULT_CHANNELS.map((c, i) => ({
            household_id: household.id,
            owner_id: user.id!,
            name: c.name,
            color: c.color,
            icon: c.icon,
            sort_order: i,
          })),
        );
      }

      await db.insert(profiles).values({
        id: user.id,
        household_id: household.id,
        display_name: user.name ?? user.email?.split("@")[0] ?? "",
        avatar_url: user.image ?? null,
      });
    },
  },
});
