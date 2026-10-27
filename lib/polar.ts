import "server-only";
import { Polar } from "@polar-sh/sdk";
import { isBillingEnabled } from "@/lib/billing-config";

/**
 * The payment provider, kept behind one module.
 *
 * Polar is a merchant of record: it sells to the customer, handles EU VAT, and
 * pays out to a personal bank account — which is what makes this shippable
 * without a company. That choice leaks into the shape of the data (a
 * `provider_customer_id` that is theirs, not ours), so it is named here and
 * nowhere else, and the rest of the app talks in terms of a household's access.
 *
 * Everything is read lazily. The keys will not exist for a while yet, and a
 * module that throws at import time takes the whole app down at build.
 */

const productMonthly = () => process.env.POLAR_PRODUCT_MONTHLY;
const productYearly = () => process.env.POLAR_PRODUCT_YEARLY;

export { isBillingEnabled };

function client(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not set");
  return new Polar({
    accessToken,
    // Sandbox is a separate host with separate products and separate keys, so
    // this has to be explicit — pointing production at sandbox would take real
    // money nowhere.
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
}

export type BillingInterval = "month" | "year";

function productFor(interval: BillingInterval): string {
  const id = interval === "year" ? productYearly() : productMonthly();
  if (!id) throw new Error(`No Polar product configured for the ${interval} plan`);
  return id;
}

/**
 * A checkout page for this household.
 *
 * `externalCustomerId` is the household id, and it is the whole link between
 * Polar and this database. Setting it means the webhook can find the household
 * without a lookup table, and that a customer who somehow ends up with two
 * Polar records still maps to one space.
 */
export async function createCheckoutUrl(opts: {
  householdId: string;
  interval: BillingInterval;
  email?: string | null;
  successUrl: string;
}): Promise<string> {
  const checkout = await client().checkouts.create({
    products: [productFor(opts.interval)],
    externalCustomerId: opts.householdId,
    customerEmail: opts.email ?? undefined,
    successUrl: opts.successUrl,
    // Repeated in metadata because `externalCustomerId` lives on the customer
    // and metadata lives on the checkout: if a webhook ever arrives with only
    // one of them, either is enough to place the payment.
    metadata: { household_id: opts.householdId },
  });
  return checkout.url;
}

/**
 * A link into Polar's own portal, where the card, the invoices and cancelling
 * live.
 *
 * Not rebuilt in-app on purpose: card details and invoice history are exactly
 * the things a merchant of record exists to keep out of this codebase.
 */
export async function createPortalUrl(householdId: string): Promise<string> {
  const session = await client().customerSessions.create({
    externalCustomerId: householdId,
  });
  return session.customerPortalUrl;
}
