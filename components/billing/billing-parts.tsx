"use client";

import { useLocale, useTranslations } from "next-intl";
import type { getBillingState } from "@/lib/actions/billing";
import { formatUsd, PRICE_MONTHLY_USD, PRICE_YEARLY_USD } from "@/lib/pricing";

/** Small pieces both billing screens use: the settled one and the one that
 *  waits for a payment to land. */

export type BillingState = Awaited<ReturnType<typeof getBillingState>>;

/** The other person in the space, by name, or null when there is nobody. */
export function partnerOf(state: Pick<BillingState, "members" | "meId">) {
  return state.members.find((m) => m.id !== state.meId) ?? null;
}

/**
 * A Polar page in a tab of its own, so this one stays where it is.
 *
 * The URL only exists after a server round trip, and a window opened after an
 * `await` is a popup the browser blocks. So the tab is opened first, empty, in
 * the click itself, and pointed at Polar once the link is back; when even that
 * is blocked, the page goes there itself.
 */
export function openInNewTab(run: () => Promise<string>, onError: () => void) {
  const tab = window.open("", "_blank");
  run()
    .then((url) => {
      if (tab) tab.location.href = url;
      else window.location.href = url;
    })
    .catch(() => {
      tab?.close();
      onError();
    });
}

export function PlanPrice({
  interval,
  format: key,
}: {
  interval: string | null;
  format: "pastDuePlan" | "donePrice";
}) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const plan = interval === "year" ? "year" : "month";
  const price = formatUsd(plan === "year" ? PRICE_YEARLY_USD : PRICE_MONTHLY_USD, locale);
  return <>{t(key, { plan, price })}</>;
}

export function ArrowIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}
