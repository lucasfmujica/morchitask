"use client";

import { useState, useTransition } from "react";
import { Check, CreditCard, Gift, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import type { getBillingState } from "@/lib/actions/billing";
import {
  formatUsd,
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  TRIAL_DAYS,
  YEARLY_SAVING_PCT,
} from "@/lib/pricing";
import { useDateLabels } from "@/lib/use-date-labels";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type State = Awaited<ReturnType<typeof getBillingState>>;

/**
 * One screen for four states: on trial, locked out, subscribed, comped.
 *
 * They share a screen rather than getting four, because they are the same
 * question — what is my access, and what do I do about it — and splitting them
 * is how "cancelled" ends up with no way back.
 */
type Interval = "month" | "year";

/** What the plan includes, as the canvas lists it. Keys, so the list is the
 *  same in both catalogs and can't grow a line in only one language. */
const INCLUDED = ["rituals", "calendar", "shared", "focus", "capture", "export"] as const;

export function BillingView({ state }: { state: State }) {
  const t = useTranslations("billing");
  const labels = useDateLabels();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  // One CTA for the plan picked above it. The cards only choose; the button
  // is what checks out, and it passes the chosen interval straight through,
  // so each plan still goes to its own product. Yearly starts selected
  // because it is the one we suggest.
  const [interval, setPlanInterval] = useState<Interval>("year");

  const { access, subscription } = state;
  const subscribed = !!subscription && access.source === "subscription" && access.allowed;
  const comped = access.source === "comp";

  function go(run: () => Promise<string>) {
    setError(false);
    startTransition(async () => {
      try {
        // A full navigation, not a router push: both destinations are Polar's,
        // and the checkout has to own the tab it collects a card in.
        window.location.href = await run();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-[18px] pt-3 pb-6">
      <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight text-fg">
        {t("title")}
      </h1>

      <StatusCard
        state={state}
        subscribed={subscribed}
        comped={comped}
        endsLabel={access.until ? labels.fullDayLabel(access.until.slice(0, 10)) : null}
      />

      {/* Nothing to sell to someone who is comped, and nothing to sell at all
          until the payment provider is configured. */}
      {!comped && state.enabled && subscribed && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-fg">{t("manageTitle")}</h2>
          <Button
            onClick={() => go(() => openBillingPortal())}
            disabled={pending}
            className="w-fit"
          >
            <CreditCard className="h-4 w-4" aria-hidden />
            {t("managePlan")}
          </Button>
          {error && <p className="text-sm text-danger">{t("checkoutFailed")}</p>}
        </section>
      )}

      {!comped && state.enabled && !subscribed && (
        <>
          <h2 className="font-display text-lg font-semibold text-fg">{t("choosePlan")}</h2>

          <div
            role="group"
            aria-label={t("choosePlan")}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5"
          >
            <PlanCard
              name={t("monthly")}
              price={formatUsd(PRICE_MONTHLY_USD)}
              per={t("perMonth")}
              selected={interval === "month"}
              onSelect={() => setPlanInterval("month")}
            />
            <PlanCard
              name={t("yearly")}
              price={formatUsd(PRICE_YEARLY_USD)}
              per={t("perYearAbout", {
                monthly: formatUsd(Math.round(PRICE_YEARLY_USD / 12)),
              })}
              badge={t("yearlySaving", { pct: YEARLY_SAVING_PCT })}
              selected={interval === "year"}
              onSelect={() => setPlanInterval("year")}
            />
          </div>

          <section
            aria-label={t("includedTitle")}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5 rounded-2xl bg-surface-2 px-5 py-[18px]"
          >
            {INCLUDED.map((key) => (
              <span key={key} className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-fit text-on-primary">
                  <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />
                </span>
                {t(`included.${key}`)}
              </span>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-xs text-muted">{t("coverNote")}</p>
            <Button
              size="lg"
              onClick={() => go(() => startCheckout(interval))}
              disabled={pending}
              className="h-[50px] px-7 shadow-lg shadow-primary/25"
            >
              {interval === "year" ? t("subscribeYearly") : t("subscribeMonthly")}
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{t("checkoutFailed")}</p>}
        </>
      )}

      {!state.enabled && <p className="text-sm text-muted">{t("notConfigured")}</p>}
    </div>
  );
}

function StatusCard({
  state,
  subscribed,
  comped,
  endsLabel,
}: {
  state: State;
  subscribed: boolean;
  comped: boolean;
  endsLabel: string | null;
}) {
  const t = useTranslations("billing");
  const { access, subscription } = state;

  if (comped) {
    return (
      <Card tone="ok" icon={<Gift className="h-5 w-5" aria-hidden />}>
        <p className="text-sm font-medium text-fg">{t("compTitle")}</p>
        <p className="text-xs text-muted">{t("compBody")}</p>
      </Card>
    );
  }

  if (access.paymentFailing) {
    return (
      <Card tone="warn" icon={<TriangleAlert className="h-5 w-5" aria-hidden />}>
        <p className="text-sm font-medium text-fg">{t("pastDueTitle")}</p>
        <p className="text-xs text-muted">{t("pastDueBody")}</p>
      </Card>
    );
  }

  if (subscribed) {
    return (
      <Card tone="ok" icon={<Check className="h-5 w-5" aria-hidden />}>
        <p className="text-sm font-medium text-fg">{t("activeTitle")}</p>
        <p className="text-xs text-muted">
          {subscription?.cancel_at_period_end && endsLabel
            ? t("endingOn", { date: endsLabel })
            : endsLabel
              ? t("renewsOn", { date: endsLabel })
              : t("activeBody")}
        </p>
      </Card>
    );
  }

  if (access.allowed && access.source === "trial") {
    return (
      <TrialCard
        daysLeft={access.trialDaysLeft ?? 0}
        title={t("trialLeft", { n: access.trialDaysLeft ?? 0 })}
      >
        {t("trialBody")}
      </TrialCard>
    );
  }

  return (
    <Card tone="warn" icon={<TriangleAlert className="h-5 w-5" aria-hidden />}>
      <p className="text-sm font-medium text-fg">{t("lockedTitle")}</p>
      {/* Said here rather than only in the privacy policy: the moment access
          stops is exactly when someone needs to know the data is still theirs. */}
      <p className="text-xs text-muted">{t("lockedBody")}</p>
    </Card>
  );
}

/** The trial as the page's dark hero card. The bar fills as the trial is used
 *  up, in the same "it fits" green the day view uses for its capacity. */
function TrialCard({
  daysLeft,
  title,
  children,
}: {
  daysLeft: number;
  title: string;
  children: React.ReactNode;
}) {
  const used = 1 - Math.max(0, Math.min(1, daysLeft / TRIAL_DAYS));
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl bg-fg p-6 text-bg">
      <p className="font-display text-[28px] leading-8 font-bold">{title}</p>
      <div className="h-2.5 overflow-hidden rounded-pill bg-bg/15" aria-hidden>
        <div
          className="h-full rounded-pill bg-fit transition-[width] duration-700 ease-out"
          style={{ width: `${used * 100}%` }}
        />
      </div>
      <p className="text-[13px] text-bg/75">{children}</p>
    </section>
  );
}

function Card({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-soft",
        tone === "warn" && "ring-[1.5px] ring-warning/50 ring-inset",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          tone === "warn" ? "bg-warning/10 text-warning" : "bg-primary-soft text-primary",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  per,
  badge,
  selected,
  onSelect,
}: {
  name: string;
  price: string;
  per: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        // The picked plan wears the green ring and lifts a little; the other
        // stays a plain white card. Choosing is not buying: the CTA below is.
        "flex cursor-pointer flex-col items-start gap-2 rounded-2xl bg-surface p-[22px] text-left text-fg transition-[box-shadow,transform] duration-200",
        selected
          ? "-translate-y-0.5 shadow-card ring-2 ring-fit-from ring-inset"
          : "shadow-soft hover:shadow-card",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="mr-auto font-semibold">{name}</span>
        {badge && (
          <span className="-rotate-2 rounded-[4px] bg-marker px-2 py-0.5 text-[11px] font-bold text-on-marker">
            {badge}
          </span>
        )}
      </span>
      <span className="font-display text-[40px] leading-[44px] font-bold tracking-tight tabular-nums">
        {price}
      </span>
      <span className="text-[13px] text-muted">{per}</span>
    </button>
  );
}
