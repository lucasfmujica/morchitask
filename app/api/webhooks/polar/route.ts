import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { householdExists, upsertSubscription } from "@/lib/db/queries/subscriptions";
import { isHandledEvent, parseSubscriptionEvent } from "@/lib/webhook-events";

/**
 * Polar tells us what somebody paid.
 *
 * This is the only route that writes billing state, and the only unauthenticated
 * endpoint that writes anything at all — so the signature check is the security
 * boundary, and it fails closed: no secret configured means every request is
 * rejected, the same rule the cron routes learned the hard way.
 *
 * On status codes: 2xx means "delivered, stop retrying". So a payload that is
 * malformed or belongs to nothing gets 200 — retrying it forever would bury the
 * events that matter — while anything that might succeed on a second try (a
 * database blip) gets a 5xx so the provider brings it back.
 */
export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return new Response("webhooks not configured", { status: 503 });

  // The raw body, before any parsing: the signature covers those exact bytes,
  // and `await req.json()` would re-serialize them into something else.
  const body = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  let event;
  try {
    event = validateEvent(body, headers, secret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response("invalid signature", { status: 403 });
    }
    throw err;
  }

  if (!isHandledEvent(event.type)) return Response.json({ ignored: event.type });

  const parsed = parseSubscriptionEvent(event.data as Parameters<typeof parseSubscriptionEvent>[0]);
  if (!parsed) return Response.json({ ignored: "unplaceable subscription payload" });

  // The household id arrives from outside, so it is checked rather than
  // trusted. Without this a forged-but-signed payload — or, far more likely, a
  // stale id from a deleted account — would insert a subscription row pointing
  // at nothing and fail on the foreign key.
  if (!(await householdExists(parsed.householdId))) {
    return Response.json({ ignored: "unknown household" });
  }

  await upsertSubscription(parsed);

  return Response.json({ ok: true, status: parsed.status });
}
