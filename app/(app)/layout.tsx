import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppChrome } from "@/components/layout/app-chrome";
import { TrialBanner } from "@/components/billing/trial-banner";
import { TrialBannerSlot } from "@/components/billing/trial-banner-slot";
import { TrialChip } from "@/components/billing/trial-chip";
import { auth } from "@/lib/auth";
import { hasWriteAccess } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";

/**
 * The authenticated app, which gets the whole catalog.
 *
 * Deliberately not trimmed the way the public groups are: in here the person
 * has already signed in, navigates between every screen, and would pay for the
 * split in extra round trips rather than save anything real. The trimming
 * exists for the pages a stranger reads before deciding, not for this one.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Locked is the same rule the proxy redirects on, said once more for the
  // sidebar, so it can show which places are closed instead of linking to them.
  const session = await auth();
  const locked = !!session?.access && !hasWriteAccess(session.access, isBillingEnabled());
  return (
    <NextIntlClientProvider>
      <AppChrome trialChip={<TrialChip />} locked={locked}>
        <div className="flex flex-col gap-4">
          {/* Auth gating happens in the proxy; the one thing that has to be
              visible from every screen is a trial about to run out. The
              sidebar's chip says it where the sidebar is open; the banner
              covers everywhere else. */}
          <TrialBannerSlot>
            <TrialBanner />
          </TrialBannerSlot>
          {children}
        </div>
      </AppChrome>
    </NextIntlClientProvider>
  );
}
