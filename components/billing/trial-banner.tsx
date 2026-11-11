import Link from "next/link";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { shouldWarnAboutTrial } from "@/lib/billing";

/**
 * The last few days of a trial, said once, everywhere.
 *
 * The launch plan calls the "your trial ends in 3 days" email the highest-
 * converting thing in the funnel; this is the version that does not need an
 * email provider. It appears only in the last stretch — earlier than that it is
 * a nag, and the day it expires there is a whole screen for it instead.
 *
 * A server component so it costs no client bundle and cannot flash: `auth()`
 * already resolved the access on the way in.
 */
export async function TrialBanner() {
  const session = await auth();
  if (!session?.access || !shouldWarnAboutTrial(session.access)) return null;

  const t = await getTranslations("billing");
  const days = session.access.trialDaysLeft ?? 0;

  return (
    <Link
      href="/billing"
      className="flex items-center gap-2.5 rounded-xl bg-accent-soft py-2 pr-2 pl-3 text-sm text-fg transition-opacity hover:opacity-90"
    >
      <Clock className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">{t("trialWarning", { n: days })}</span>
      <span className="shrink-0 rounded-pill bg-fg px-3 py-1 text-xs font-semibold text-bg">
        {t("trialWarningCta")}
      </span>
    </Link>
  );
}
