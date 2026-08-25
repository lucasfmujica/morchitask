import type { DefaultSession } from "next-auth";
import type { Locale } from "@/lib/locale";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    householdId: string | null;
    locale: Locale;
  }
}
