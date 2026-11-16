import type { DefaultSession } from "next-auth";
import type { Locale } from "@/lib/locale";
import type { Access } from "@/lib/billing";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    householdId: string | null;
    locale: Locale;
    /** `profiles.timezone`: the zone this person's day runs in. */
    timezone: string;
    /** Whether this household may use the app, and why. Resolved in the session
     *  callback so `proxy.ts` can gate without a query of its own. */
    access: Access;
  }
}
