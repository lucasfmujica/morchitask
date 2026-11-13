/**
 * The link an invite is shared with.
 *
 * `/invite/<token>` is the page that accepts it. The token is repeated as a
 * query parameter because a signed-out visitor never reaches that page: the
 * proxy sends them to /login, keeping the query string but not the path. The
 * copy in the query is what lets /login show whose invite this is and send
 * them back here once they have signed in.
 */
export function inviteLink(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}${invitePath(token)}`;
}

/** Where to go after signing in from an invite link. Keeps the query copy for
 *  the same reason as the link: an account without access is redirected to
 *  /billing on the way, and the token has to survive that too. */
export function invitePath(token: string) {
  const t = encodeURIComponent(token);
  return `/invite/${t}?invite=${t}`;
}

/** Tokens are base64url (lib/actions/invites.ts). Anything else in the query
 *  is not ours, and is not echoed into a redirect. */
export function parseInviteToken(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v) ? v : null;
}
