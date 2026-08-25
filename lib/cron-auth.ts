/**
 * Shared gate for the cron routes.
 *
 * Both routes act on every user in the database — one sends the morning push,
 * the other fires task reminders — so an unauthenticated caller can spam
 * notifications to everyone at once.
 *
 * This used to read `!secret || header === secret`, which fails *open*: a
 * deploy that forgot `CRON_SECRET` left the routes world-callable, and nothing
 * about the app would look wrong. Missing config now denies instead.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // No secret configured means nobody can be authorized — not that everybody is.
  if (!secret) return false;

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically;
  // `x-cron-secret` is accepted too, for manual and QStash calls.
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}
