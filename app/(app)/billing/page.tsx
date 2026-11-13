import { getBillingState } from "@/lib/actions/billing";
import { getInviteView } from "@/lib/actions/invites";
import { auth } from "@/lib/auth";
import { getProfile } from "@/lib/db/queries/profiles";
import { parseInviteToken } from "@/lib/invite-link";
import { BillingView } from "@/components/billing/billing-view";
import { InviteAccept } from "@/components/invite/invite-screen";

/**
 * Where the paywall sends people, and where a subscriber manages their plan.
 *
 * Server-rendered rather than fetched on the client because it is the one page
 * that must be right on first paint: a flash of "your trial is over" at someone
 * who just paid, or of the plan buttons at someone who is comped, is the kind
 * of wrong that gets a refund request.
 *
 * Also where a locked account's invite link ends up: the proxy turns
 * /invite/<token>?invite=<token> into /billing?invite=<token> for anyone
 * without access, and joining a space that has a plan is exactly how such a
 * person gets back in. So the invite is offered here, in place of the plans.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [state, token] = [await getBillingState(), parseInviteToken((await searchParams).invite)];
  if (token && !state.access.allowed) {
    const view = await getInviteView(token);
    if (view && view !== "member") {
      const session = await auth();
      const profile = session ? await getProfile(session.user.id) : null;
      if (session?.householdId && profile) {
        return (
          <InviteAccept
            embedded
            view={view}
            me={{
              id: profile.id,
              household_id: session.householdId,
              display_name: profile.display_name,
              color: profile.color,
              avatar_url: profile.avatar_url,
            }}
          />
        );
      }
    }
  }
  return <BillingView state={state} />;
}
