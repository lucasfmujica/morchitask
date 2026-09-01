import { getBillingState } from "@/lib/actions/billing";
import { BillingView } from "@/components/billing/billing-view";

/**
 * Where the paywall sends people, and where a subscriber manages their plan.
 *
 * Server-rendered rather than fetched on the client because it is the one page
 * that must be right on first paint: a flash of "your trial is over" at someone
 * who just paid, or of the plan buttons at someone who is comped, is the kind
 * of wrong that gets a refund request.
 */
export default async function BillingPage() {
  const state = await getBillingState();
  return <BillingView state={state} />;
}
