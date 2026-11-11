"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Clock, CreditCard, Gift, TriangleAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";

type State = Awaited<ReturnType<typeof getBillingState>>;

/**
 * One screen for four states: on trial, locked out, subscribed, comped.
 *
 * They share a screen rather than getting four, because they are the same
 * question — what is my access, and what do I do about it — and splitting them
 * is how "cancelled" ends up with no way back.
 */
export function BillingView({ state }: { state: State }) {
  const t = useTranslations("billing");
  const labels = useDateLabels();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

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
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="px-1 pt-1 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
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
      {!comped && state.enabled && (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-2">
          <h2 className="px-3 pt-2 pb-0.5 text-base font-semibold text-fg">
            {subscribed ? t("manageTitle") : t("choosePlan")}
          </h2>

          {subscribed ? (
            <button
              onClick={() => go(() => openBillingPortal())}
              disabled={pending}
              className="m-1 inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-pill bg-fg px-4 text-sm font-semibold text-bg transition-colors hover:bg-fg/85 disabled:opacity-60"
            >
              <CreditCard className="h-4 w-4" aria-hidden />
              {t("managePlan")}
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <PlanCard
                name={t("monthly")}
                price={formatUsd(PRICE_MONTHLY_USD)}
                per={t("perMonth")}
                onPick={() => go(() => startCheckout("month"))}
                disabled={pending}
                cta={t("subscribe")}
              />
              <PlanCard
                name={t("yearly")}
                price={formatUsd(PRICE_YEARLY_USD)}
                per={t("perYear")}
                note={t("yearlySaving", { pct: YEARLY_SAVING_PCT })}
                highlight
                onPick={() => go(() => startCheckout("year"))}
                disabled={pending}
                cta={t("subscribe")}
              />
            </div>
          )}

          {error && <p className="px-3 pb-1.5 text-sm text-danger">{t("checkoutFailed")}</p>}
        </section>
      )}

      {!state.enabled && <p className="px-1 text-sm text-muted">{t("notConfigured")}</p>}
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

/** The trial as the page's dark hero card, with what is left of it as a green
 *  bar: the same "still fits" green the day view uses for its capacity. */
function TrialCard({
  daysLeft,
  title,
  children,
}: {
  daysLeft: number;
  title: string;
  children: React.ReactNode;
}) {
  const left = Math.max(0, Math.min(1, daysLeft / TRIAL_DAYS));
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-fg p-5 text-bg">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg/15">
          <Clock className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">{title}</p>
          <p className="text-xs text-bg/70">{children}</p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-bg/15" aria-hidden>
        <div
          className="h-full rounded-pill bg-fit transition-[width] duration-700 ease-out"
          style={{ width: `${left * 100}%` }}
        />
      </div>
    </div>
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
  note,
  highlight,
  onPick,
  disabled,
  cta,
}: {
  name: string;
  price: string;
  per: string;
  note?: string;
  highlight?: boolean;
  onPick: () => void;
  disabled: boolean;
  cta: string;
}) {
  return (
    <div
      className={cn(
        // The suggested plan wears the primary ring, the "selected" mark used
        // across the app; the other stays a plain white card in the well.
        "flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-soft transition-shadow",
        highlight && "ring-2 ring-primary",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-muted">{name}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-bold tracking-tight tabular-nums text-fg">
            {price}
          </span>
          <span className="text-sm text-muted">{per}</span>
        </p>
        {note && <p className="mt-1 text-xs font-medium text-primary">{note}</p>}
      </div>
      <button
        onClick={onPick}
        disabled={disabled}
        className={cn(
          "mt-auto inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-pill px-4 text-sm font-semibold transition-colors disabled:opacity-60",
          highlight ? "bg-fg text-bg hover:bg-fg/85" : "bg-surface-2 text-fg hover:bg-border",
        )}
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
