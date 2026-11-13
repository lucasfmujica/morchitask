import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { pickMessages } from "@/lib/i18n-messages";

/**
 * First use, outside the app's shell on purpose.
 *
 * The three steps are a full screen each, like the closing ritual on a phone:
 * no sidebar, no bottom bar, nothing else to tap while someone is still
 * deciding how their day should look. A route group of its own, rather than a
 * "hide the chrome" flag in the shell, so the sidebar's queries never run for
 * a person who has nothing in it yet.
 */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider messages={await pickMessages(["onboarding", "common"])}>
      {children}
    </NextIntlClientProvider>
  );
}
