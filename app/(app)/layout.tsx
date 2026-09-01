import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppChrome } from "@/components/layout/app-chrome";
import { TrialBanner } from "@/components/billing/trial-banner";

/**
 * The authenticated app, which gets the whole catalog.
 *
 * Deliberately not trimmed the way the public groups are: in here the person
 * has already signed in, navigates between every screen, and would pay for the
 * split in extra round trips rather than save anything real. The trimming
 * exists for the pages a stranger reads before deciding, not for this one.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider>
      <AppChrome>
        <div className="flex flex-col gap-4">
          {/* Auth gating happens in the proxy; the one thing that has to be
              visible from every screen is a trial about to run out. */}
          <TrialBanner />
          {children}
        </div>
      </AppChrome>
    </NextIntlClientProvider>
  );
}
