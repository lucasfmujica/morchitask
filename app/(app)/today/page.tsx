import { redirect } from "next/navigation";
import { DayView } from "@/components/day/day-view";
import { todayISO } from "@/lib/date";
import { onboardingStepPath } from "@/lib/onboarding";
import { needsOnboarding } from "@/lib/onboarding-server";

export const dynamic = "force-dynamic";

/**
 * Hoy, and the one place onboarding is sent from.
 *
 * Here rather than in the layout or the proxy: every sign-in and the installed
 * PWA land on /today, so a new account always passes through it, while
 * Settings, Plan y pago, the locked-out screen and the API never run this
 * check at all. The proxy would have had to query the database on every
 * request to know; this page already does.
 */
export default async function TodayPage() {
  if (await needsOnboarding()) redirect(onboardingStepPath(1));
  return <DayView date={todayISO()} />;
}
