import { isLiveSubscription, type Access } from "@/lib/billing";

/** The pure half of the screen shown right after paying
 *  (components/billing/payment-confirming.tsx). */

/** How often to ask, and for how long. Polar's webhook usually lands in a few
 *  seconds; past half a minute it is late, past a minute polling stops being
 *  useful and the page says so instead of spinning forever. */
export const POLL_EVERY_MS = 2_000;
export const SLOW_AFTER_S = 30;
export const STOP_AFTER_S = 60;

/** Whether the subscription the person just paid for has reached the app. */
export function paymentConfirmed(state: {
  access: Pick<Access, "allowed" | "source">;
  subscription: { status: string } | null;
}) {
  return (
    state.access.allowed &&
    state.access.source === "subscription" &&
    isLiveSubscription(state.subscription?.status)
  );
}

/** "0:09", the canvas's elapsed clock. */
export function elapsedLabel(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
