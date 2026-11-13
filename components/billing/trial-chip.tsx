import { auth } from "@/lib/auth";
import { trialChip } from "@/lib/billing";
import { TrialChipView } from "./trial-chip-view";

/**
 * The trial, said quietly from the sidebar for as long as it lasts.
 *
 * A server component like the banner, for the same reasons: no client bundle
 * and nothing to flash, since `auth()` already resolved the access on the way
 * in. The sidebar is a client component, so this arrives there as a prop.
 */
export async function TrialChip() {
  const session = await auth();
  const chip = session?.access ? trialChip(session.access) : null;
  return chip ? <TrialChipView chip={chip} /> : null;
}
