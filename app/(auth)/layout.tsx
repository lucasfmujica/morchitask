import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AUTH_NAMESPACES, pickMessages } from "@/lib/i18n-messages";

/**
 * The sign-in screen needs exactly one namespace.
 *
 * This layout exists only to say so: without it the group inherits whatever is
 * mounted above, and "whatever is mounted above" is how /login ended up
 * shipping 29 KB of strings to someone who had not signed in yet.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider messages={await pickMessages(AUTH_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
