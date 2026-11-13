import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getInviteView } from "@/lib/actions/invites";
import { getProfile } from "@/lib/db/queries/profiles";
import { InviteAccept, InviteInvalid } from "@/components/invite/invite-screen";

/**
 * Where an invite link lands for someone signed in.
 *
 * Signed out, the proxy sends the visitor to /login first (the link carries
 * the token in its query too, so the sign-in screen can show the invite and
 * come back here after Google). A brand-new account is placed in the space by
 * the invite at sign-up, so for them this page only forwards to Hoy.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.householdId) redirect(`/login?invite=${encodeURIComponent(token)}`);

  const view = await getInviteView(token);
  if (view === "member") redirect("/today");
  if (!view) return <InviteInvalid />;

  const profile = await getProfile(session.user.id);
  const me = {
    id: session.user.id,
    household_id: session.householdId,
    display_name: profile?.display_name ?? session.user.name ?? "",
    color: profile?.color ?? "var(--color-subtle)",
    avatar_url: profile?.avatar_url ?? null,
  };
  return <InviteAccept view={view} me={me} />;
}
