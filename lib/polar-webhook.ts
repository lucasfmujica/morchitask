import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Webhook } from "standardwebhooks";

/**
 * Verifies a Polar webhook and returns the SDK's parsed event.
 *
 * Polar changed its secret format: endpoints created from 8 September 2026 get
 * a Standard Webhooks secret (`whsec_…`) that is used as-is, while older ones
 * must be base64-encoded first. SDK 0.49's `validateEvent` only knows the old
 * rule, so with a new secret every genuine delivery failed with "invalid
 * signature" and nobody's payment would ever have reached the app. SDK 1.x
 * handles both, but it is a rewrite of the whole client.
 *
 * So: try the old rule first. If that fails and the secret looks like a
 * Standard Webhooks one, verify with it as-is, then re-sign the same bytes with
 * the old-rule key and let the SDK parse them. Re-signing keeps the parsing
 * (camelCase fields, dates) identical to what the route already relies on, and
 * it only ever happens after the real signature has been checked.
 *
 * Throws the SDK's `WebhookVerificationError` when neither rule verifies.
 */
export function verifyPolarEvent(
  body: string,
  headers: Record<string, string>,
  secret: string,
): ReturnType<typeof validateEvent> {
  try {
    return validateEvent(body, headers, secret);
  } catch (err) {
    if (!(err instanceof WebhookVerificationError) || !secret.startsWith("whsec_")) throw err;
  }

  try {
    new Webhook(secret).verify(body, headers);
  } catch {
    throw new WebhookVerificationError("invalid signature");
  }

  const id = headers["webhook-id"];
  const timestamp = new Date(Number(headers["webhook-timestamp"]) * 1000);
  const legacyKey = Buffer.from(secret, "utf-8").toString("base64");
  const signature = new Webhook(legacyKey).sign(id, timestamp, body);
  return validateEvent(body, { ...headers, "webhook-signature": signature }, secret);
}
