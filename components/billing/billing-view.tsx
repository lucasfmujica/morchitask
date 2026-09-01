"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, CreditCard, Gift, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import type { getBillingState } from "@/lib/actions/billing";
import { formatUsd, PRICE_MONTHLY_USD, PRICE_YEARLY_USD, YEARLY_SAVING_PCT } from "@/lib/pricing";
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
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>

      <StatusCard
        state={state}
        subscribed={subscribed}
        comped={comped}
        endsLabel={access.until ? labels.fullDayLabel(access.until.slice(0, 10)) : null}
      />

      {/* Nothing to sell to someone who is comped, and nothing to sell at all
          until the payment provider is configured. */}
      {!comped && state.enabled && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {subscribed ? t("manageTitle") : t("choosePlan")}
          </h2>

          {subscribed ? (
            <button
              onClick={() => go(() => openBillingPortal())}
              disabled={pending}
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <CreditCard className="h-4 w-4" aria-hidden />
              {t("managePlan")}
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
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

          {error && <p className="text-sm text-danger">{t("checkoutFailed")}</p>}
        </section>
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
      <Card tone="ok" icon={<Check className="h-5 w-5" aria-hidden />}>
        <p className="text-sm font-medium text-fg">
          {t("trialLeft", { n: access.trialDaysLeft ?? 0 })}
        </p>
        <p className="text-xs text-muted">{t("trialBody")}</p>
      </Card>
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
        "flex items-start gap-3 rounded-xl border bg-surface p-4",
        tone === "warn" ? "border-warning/40" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
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
        "flex flex-col gap-3 rounded-2xl bg-surface p-5 ring-1",
        highlight ? "ring-primary/40" : "ring-border",
      )}
    >
      <div>
        <p className="text-sm font-semibold text-muted">{name}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold tracking-tight tabular-nums text-fg">
            {price}
          </span>
          <span className="text-sm text-muted">{per}</span>
        </p>
        {note && <p className="mt-1 text-xs font-medium text-primary">{note}</p>}
      </div>
      <button
        onClick={onPick}
        disabled={disabled}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
