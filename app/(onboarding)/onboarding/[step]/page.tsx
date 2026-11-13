import { notFound, redirect } from "next/navigation";
import { CapacityStep } from "@/components/onboarding/capacity-step";
import { CalendarStep } from "@/components/onboarding/calendar-step";
import { FirstDayStep } from "@/components/onboarding/first-day-step";
import { myChannels } from "@/lib/db/queries/channels";
import { getProfile } from "@/lib/db/queries/profiles";
import { resolveCapacity } from "@/lib/capacity";
import { channelForKind, initialHours, parseOnboardingStep } from "@/lib/onboarding";
import { onboardingState } from "@/lib/onboarding-server";

export const dynamic = "force-dynamic";

/** "Sofía Pérez" → "Sofía". The greeting is a first name or nothing. */
function firstName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const first = c?.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return null;
}

/**
 * One page per step, so the browser's back button, a reload, and Google's
 * redirect after connecting the calendar all land on a real step.
 *
 * Anyone already past onboarding is sent to Hoy, including someone who types
 * the URL: the same `isOnboarded` decides both directions, so Hoy and this page
 * can never send a person back and forth between them.
 */
export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const step = parseOnboardingStep((await params).step);
  if (!step) notFound();

  const { session, needed } = await onboardingState();
  if (!needed || !session?.householdId) redirect("/today");
  const userId = session.user.id;
  const profile = await getProfile(userId);

  if (step === 1) {
    return (
      <CapacityStep
        name={firstName(session.user.name, profile?.display_name)}
        initialHours={initialHours(profile?.capacity_target_min)}
      />
    );
  }

  if (step === 2) {
    return <CalendarStep connected={profile?.google_calendar_connected ?? false} />;
  }

  const channels = await myChannels(session.householdId, userId);
  return (
    <FirstDayStep
      capacityMin={resolveCapacity(null, profile?.capacity_target_min)}
      colors={{
        work: channelForKind(channels, "work")?.color ?? null,
        personal: channelForKind(channels, "personal")?.color ?? null,
      }}
    />
  );
}
