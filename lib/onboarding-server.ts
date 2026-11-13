import "server-only";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { onboardingFacts } from "@/lib/db/queries/onboarding";
import { isOnboarded } from "@/lib/onboarding";

/**
 * The session, and whether that person should be in onboarding right now.
 *
 * Every doubt answers "no": no session, no household yet (provisioning still
 * running), or no profile row. Being shown a welcome you didn't need costs a
 * click; being bounced out of Hoy by a half-read session is the kind of thing
 * that gets an app uninstalled.
 */
export async function onboardingState(): Promise<{ session: Session | null; needed: boolean }> {
  const session = await auth();
  if (!session?.householdId || !session.user?.id) return { session, needed: false };
  const facts = await onboardingFacts(session.householdId, session.user.id);
  return { session, needed: facts ? !isOnboarded(facts) : false };
}

export async function needsOnboarding(): Promise<boolean> {
  return (await onboardingState()).needed;
}
