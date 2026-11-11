/**
 * Who may see the admin pages.
 *
 * An allowlist of emails from the environment (`ADMIN_EMAILS`, comma
 * separated) rather than a role in the database: there are one or two admins,
 * a role column would be a migration and a new way to escalate, and an env var
 * can only be changed by someone who can already deploy.
 *
 * Fails closed: unset or empty means nobody is an admin.
 */
export function adminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  return adminEmails(raw).has(email.trim().toLowerCase());
}
