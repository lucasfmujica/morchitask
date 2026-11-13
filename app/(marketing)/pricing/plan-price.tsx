"use client";

import { useState } from "react";

type Period = { label: string; price: string; per: string };

/**
 * The monthly/yearly switch and the price it shows. The only interactive part
 * of the pricing page, so the only client component on it.
 *
 * Every string arrives already translated and formatted from the server page.
 * That keeps the price math in one place (`lib/pricing.ts`, read by the page)
 * and keeps this island from depending on which catalog namespaces the
 * marketing layout happens to ship to the browser.
 *
 * Yearly is the default: it is the plan most people should take, and the one
 * whose saving the card exists to show.
 */
export function PlanPrice({
  groupLabel,
  monthly,
  yearly,
  savingTag,
}: {
  groupLabel: string;
  monthly: Period;
  yearly: Period;
  savingTag: string;
}) {
  const [isYearly, setYearly] = useState(true);
  const shown = isYearly ? yearly : monthly;

  const option = (active: boolean) =>
    `h-9 rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus ${
      active ? "bg-surface text-fg shadow-pill" : "bg-transparent text-muted hover:text-fg"
    }`;

  return (
    <>
      <div
        role="group"
        aria-label={groupLabel}
        className="flex gap-0.5 self-start rounded-full bg-surface/70 p-1"
      >
        <button
          type="button"
          aria-pressed={!isYearly}
          onClick={() => setYearly(false)}
          className={option(!isYearly)}
        >
          {monthly.label}
        </button>
        <button
          type="button"
          aria-pressed={isYearly}
          onClick={() => setYearly(true)}
          className={option(isYearly)}
        >
          {yearly.label}
        </button>
      </div>

      {/* aria-live so switching the period is announced: the price is the
          thing the button changed, and it is not where focus is. */}
      <div aria-live="polite" className="flex flex-wrap items-end gap-2.5">
        <span className="font-display text-[80px] leading-[72px] font-semibold tracking-[-0.02em] tabular-nums sm:text-[104px] sm:leading-[92px]">
          {shown.price}
        </span>
        <span className="pb-2 text-base font-semibold text-on-wash">{shown.per}</span>
      </div>

      {/* Remounted on every switch to yearly, so the pop replays: the saving
          is the reason to pick it, and the motion points at it. */}
      {isYearly && (
        <span className="animate-pop self-start">
          <span className="block -rotate-[1.5deg] rounded-md bg-marker px-2.5 py-0.5 font-mono text-[13px] text-on-marker uppercase">
            {savingTag}
          </span>
        </span>
      )}
    </>
  );
}
