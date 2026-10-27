import "server-only";

/**
 * Whether billing is live, answered without loading the payment SDK.
 *
 * Its own module because two very different places need it: the session
 * callback, which is bundled into the edge proxy and must not drag the Polar
 * client in with it, and `lib/polar.ts`, which does. Reading three environment
 * variables is all it takes, so the cheap half lives here.
 *
 * Off by default. Deploying the billing code before the Polar account exists
 * must not lock anyone out of an app they have no way to pay for — the failure
 * mode of getting this backwards is people using it free for a while, which is
 * recoverable, rather than people locked out, which is not.
 */
export function isBillingEnabled(): boolean {
  return Boolean(
    process.env.POLAR_ACCESS_TOKEN &&
    process.env.POLAR_PRODUCT_MONTHLY &&
    process.env.POLAR_PRODUCT_YEARLY,
  );
}
