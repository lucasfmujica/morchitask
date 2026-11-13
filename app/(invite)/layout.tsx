import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { pickMessages } from "@/lib/i18n-messages";

/**
 * The invite's accept page, outside the app's shell like onboarding: it is one
 * decision, full screen, and the sidebar would be the sidebar of the space the
 * person may be about to leave.
 */
export default async function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider messages={await pickMessages(["invite", "auth", "tasks"])}>
      {children}
    </NextIntlClientProvider>
  );
}
