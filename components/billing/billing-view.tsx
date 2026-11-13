"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, Gift, Info } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import { billingScreen, type BillingScreen } from "@/lib/billing";
import {
  formatUsd,
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  TRIAL_DAYS,
  YEARLY_SAVING_PCT,
  yearlyPerMonthUsd,
} from "@/lib/pricing";
import { paddedDate } from "@/lib/format";
import { useDateLabels } from "@/lib/use-date-labels";
import { Button } from "@/components/ui";
import { useExportMyData } from "@/components/settings/use-export-data";
import { cn } from "@/lib/utils";
import { PaymentConfirming } from "./payment-confirming";
import { ArrowIcon, openInNewTab, partnerOf, PlanPrice, type BillingState } from "./billing-parts";

/**
 * One screen for every state: on trial, locked out, subscribed, comped, a card
 * failing, a plan the other member runs, and the minute after paying.
 *
 * They share a screen rather than getting one each, because they are the same
 * question — what is my access, and what do I do about it — and splitting them
 * is how "cancelled" ends up with no way back.
 */
type Interval = "month" | "year";

/** What the plan includes, as the canvas lists it. Keys, so the list is the
 *  same in both catalogs and can't grow a line in only one language. */
const INCLUDED = ["rituals", "calendar", "shared", "focus", "capture", "export"] as const;

export function BillingView({ state }: { state: BillingState }) {
  const params = useSearchParams();
  const plan = params.get("plan");
  // Back from Polar: until the webhook has turned the plan on, the page says
  // so instead of offering the plans again. A second checkout is exactly what
  // someone does when the first one looks like it did nothing.
  if (params.get("checkout") === "done" && state.enabled && state.access.source !== "comp") {
    return (
      <PaymentConfirming initial={state} plan={plan === "month" || plan === "year" ? plan : null} />
    );
  }
  return <BillingScreenView state={state} />;
}

function BillingScreenView({ state }: { state: BillingState }) {
  const t = useTranslations("billing");
  const labels = useDateLabels();
  const shortDate = useShortDate();
  const [pending, startTransition] = useTransition();
  // "subscribed" is the server refusing a second checkout because this space
  // already pays: worth its own sentence, since "try again" would be wrong.
  const [error, setError] = useState<false | "failed" | "subscribed" | "managed">(false);

  const { access, subscription, manager } = state;
  const managedByOther = !!manager && manager.id !== state.meId;
  const screen = billingScreen(access, subscription, { managedByOther });
  const partner = partnerOf(state);
  const locked = !access.allowed && state.enabled;

  function portal(newTab: boolean) {
    setError(false);
    if (newTab) {
      openInNewTab(openBillingPortal, () => setError("failed"));
      return;
    }
    startTransition(async () => {
      try {
        // A full navigation, not a router push: the portal is Polar's.
        window.location.href = await openBillingPortal();
      } catch {
        setError("failed");
      }
    });
  }

  const offerPlans =
    state.enabled &&
    (screen.kind === "trial" ||
      screen.kind === "trialEnded" ||
      screen.kind === "ended" ||
      screen.kind === "locked");

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-[18px] pt-3 pb-6">
      <h1 className="animate-up font-display text-[32px] leading-9 font-semibold tracking-[-0.01em] text-fg [animation-duration:600ms]">
        {t("title")}
      </h1>

      <StatusCard
        state={state}
        screen={screen}
        endsLabel={access.until ? labels.fullDayLabel(access.until.slice(0, 10)) : null}
      />

      {screen.kind === "active" && state.enabled && !managedByOther && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-fg">{t("manageTitle")}</h2>
          <Button onClick={() => portal(false)} disabled={pending} className="w-fit">
            <CreditCard className="h-4 w-4" aria-hidden />
            {t("managePlan")}
          </Button>
        </section>
      )}

      {(screen.kind === "active" || screen.kind === "pastDue") && managedByOther && manager && (
        <ManagedCard name={manager.name} />
      )}

      {screen.kind === "pastDue" && !managedByOther && subscription && (
        <>
          <section className="animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:120ms] [animation-duration:600ms]">
            <div className="flex flex-wrap items-center gap-4 rounded-[22px] bg-surface px-5 py-[18px]">
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                <span className="text-sm font-semibold text-fg">
                  <PlanPrice interval={subscription.recurring_interval} format="pastDuePlan" />
                </span>
                {screen.failedOn && (
                  <span className="text-2xs text-muted">
                    {t.rich("pastDueFailedOn", {
                      date: shortDate(screen.failedOn),
                      m: (c) => <span className="font-mono text-fg">{c}</span>,
                    })}
                  </span>
                )}
              </div>
              <Button
                size="lg"
                onClick={() => portal(true)}
                className="h-[50px] animate-glow px-6 text-sm text-surface"
              >
                {t("pastDueFix")}
                <ArrowIcon />
              </Button>
            </div>
          </section>
          <p className="animate-up text-2xs leading-[17px] text-muted [animation-delay:180ms] [animation-duration:600ms]">
            {t("pastDueFoot", { partner: partner?.display_name ?? "none" })}
          </p>
        </>
      )}

      {screen.kind === "managedElsewhere" && manager && (
        <>
          <ManagedCard name={manager.name} />
          <p className="animate-up text-2xs leading-[17px] text-muted [animation-delay:180ms] [animation-duration:600ms]">
            {t("managedFoot", { name: manager.name })}
          </p>
        </>
      )}

      {offerPlans && (
        <PlanPicker
          title={screen.kind === "ended" ? t("resubscribeTitle") : t("choosePlan")}
          resubscribe={screen.kind === "ended"}
          // What the plan includes sells a trial; a locked screen is about
          // getting back in, and the canvas keeps it to the plans.
          showIncluded={screen.kind === "trial"}
          coverNote={
            screen.kind === "ended"
              ? t("pastInvoicesNote")
              : partner && state.spaceName
                ? t("coverNoteShared", { space: state.spaceName })
                : t("coverNote")
          }
          extra={
            screen.kind === "ended" ? (
              <button
                type="button"
                onClick={() => portal(true)}
                className="h-[50px] cursor-pointer rounded-pill bg-surface-2 px-5 text-sm font-semibold text-fg transition-colors hover:bg-border"
              >
                {t("pastInvoices")}
              </button>
            ) : null
          }
          onError={setError}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error === "subscribed"
            ? t("alreadySubscribed")
            : error === "managed"
              ? t("managedByOther")
              : t("checkoutFailed")}
        </p>
      )}

      {/* Promised in the privacy policy and in the locked card itself: no plan
          takes the data hostage. Both work from here, and from Settings. */}
      {locked && <YourData partnerName={partner?.display_name ?? null} />}

      {!state.enabled && <p className="text-sm text-muted">{t("notConfigured")}</p>}
    </div>
  );
}

/** dd/mm in Spanish, mm/dd in English: the canvas's mono dates. */
function useShortDate() {
  const locale = useLocale();
  return (iso: string) => paddedDate(new Date(iso), locale);
}

/** The member who pays, named: what the other one sees instead of a checkout
 *  or a portal they are not allowed to use. */
function ManagedCard({ name }: { name: string }) {
  const t = useTranslations("billing");
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <section className="animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:120ms] [animation-duration:600ms]">
      <div className="flex items-center gap-3.5 rounded-[22px] bg-surface px-5 py-[18px]">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fg text-base font-bold text-surface"
        >
          {initial}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="font-display text-lg font-semibold text-fg">
            {t("managedBy", { name })}
          </span>
          <span className="text-2xs leading-[17px] text-muted">{t("managedByBody", { name })}</span>
        </div>
      </div>
    </section>
  );
}

function PlanPicker({
  title,
  resubscribe,
  showIncluded,
  coverNote,
  extra,
  onError,
}: {
  title: string;
  resubscribe: boolean;
  showIncluded: boolean;
  coverNote: string;
  extra: React.ReactNode;
  onError: (e: false | "failed" | "subscribed" | "managed") => void;
}) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  // One CTA for the plan picked above it. The cards only choose; the button
  // is what checks out, and it passes the chosen interval straight through,
  // so each plan still goes to its own product. Yearly starts selected
  // because it is the one we suggest.
  const [interval, setPlanInterval] = useState<Interval>("year");

  function checkout() {
    onError(false);
    startTransition(async () => {
      try {
        const res = await startCheckout(interval);
        if (!res.ok) {
          onError(res.error === "managed_by_other" ? "managed" : "subscribed");
          return;
        }
        window.location.href = res.url;
      } catch {
        onError("failed");
      }
    });
  }

  const cta = resubscribe
    ? interval === "year"
      ? t("resubscribeYearly")
      : t("resubscribeMonthly")
    : interval === "year"
      ? t("subscribeYearly")
      : t("subscribeMonthly");

  return (
    <>
      <h2
        className="animate-up font-display text-lg font-semibold text-fg [animation-duration:600ms]"
        style={{ animationDelay: "120ms" }}
      >
        {title}
      </h2>

      <div
        role="group"
        aria-label={title}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5"
      >
        <PlanCard
          name={t("monthly")}
          price={formatUsd(PRICE_MONTHLY_USD, locale)}
          per={t("perMonth")}
          selected={interval === "month"}
          onSelect={() => setPlanInterval("month")}
        />
        <PlanCard
          name={t("yearly")}
          price={formatUsd(PRICE_YEARLY_USD, locale)}
          per={t("perYearAbout", {
            monthly: formatUsd(yearlyPerMonthUsd(), locale),
          })}
          badge={t("yearlySaving", { pct: YEARLY_SAVING_PCT })}
          selected={interval === "year"}
          onSelect={() => setPlanInterval("year")}
        />
      </div>

      {showIncluded && (
        <section
          aria-label={t("includedTitle")}
          className="grid animate-up grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5 rounded-[28px] bg-surface-2 px-5 py-[18px] [animation-duration:600ms]"
          style={{ animationDelay: "220ms" }}
        >
          {INCLUDED.map((key) => (
            <span
              key={key}
              className="flex items-center gap-2 text-xs leading-normal font-medium text-fg"
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-fit text-on-primary">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </span>
              {t(`included.${key}`)}
            </span>
          ))}
        </section>
      )}

      <div
        className="flex animate-up flex-wrap items-center gap-3 [animation-duration:600ms]"
        style={{ animationDelay: "260ms" }}
      >
        <p className="mr-auto max-w-[380px] text-2xs leading-[17px] text-muted">{coverNote}</p>
        {extra}
        <Button
          size="lg"
          onClick={checkout}
          disabled={pending}
          className="h-[50px] animate-glow px-7 text-sm text-surface [animation-delay:1s]"
        >
          {cta}
        </Button>
      </div>
    </>
  );
}

/** Export and delete, from the locked screen: both work without a plan. */
function YourData({ partnerName }: { partnerName: string | null }) {
  const t = useTranslations("billing");
  const { exporting, failed, run } = useExportMyData();
  const pill =
    "flex h-9 shrink-0 cursor-pointer items-center rounded-pill px-3.5 text-2xs font-semibold transition-colors";
  return (
    <section
      aria-labelledby="your-data-h"
      className="flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:280ms] [animation-duration:600ms]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 px-3 pt-2.5 pb-1">
        <h2 id="your-data-h" className="mr-auto font-display text-base font-semibold text-fg">
          {t("dataTitle")}
        </h2>
        <span className="text-2xs text-muted">{t("dataNote")}</span>
      </div>
      <div className="flex items-center gap-3 rounded-[18px] bg-surface py-3 pr-3 pl-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{t("dataExport")}</span>
          <span className="text-2xs text-muted">{t("dataExportBody")}</span>
          {failed && <span className="text-2xs text-danger">{t("dataExportFailed")}</span>}
        </span>
        <button
          type="button"
          onClick={run}
          disabled={exporting}
          className={cn(pill, "bg-surface-2 text-fg hover:bg-border disabled:opacity-60")}
        >
          {exporting ? "…" : t("dataExportAction")}
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-[18px] bg-surface py-3 pr-3 pl-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{t("dataDelete")}</span>
          <span className="text-2xs text-muted">
            {t("dataDeleteBody", { partner: partnerName ?? "none" })}
          </span>
        </span>
        <Link
          href="/settings#danger"
          className={cn(pill, "bg-accent-soft text-accent hover:bg-accent/20")}
        >
          {t("dataDeleteAction")}
        </Link>
      </div>
    </section>
  );
}

function StatusCard({
  state,
  screen,
  endsLabel,
}: {
  state: BillingState;
  screen: BillingScreen;
  endsLabel: string | null;
}) {
  const t = useTranslations("billing");
  const format = useFormatter();
  const shortDate = useShortDate();
  const { access, subscription } = state;
  const longDate = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "long" });

  switch (screen.kind) {
    case "comp":
      return (
        <Card tone="ok" icon={<Gift className="h-5 w-5" aria-hidden />}>
          <p className="text-sm font-medium text-fg">{t("compTitle")}</p>
          <p className="text-xs text-muted">{t("compBody")}</p>
        </Card>
      );
    case "pastDue":
      return (
        <WarmCard
          icon={<CreditCard className="h-[18px] w-[18px]" aria-hidden />}
          title={t("pastDueTitle")}
        >
          {screen.cutoff
            ? t("pastDueBodyDate", { date: longDate(screen.cutoff) })
            : t("pastDueBody")}
          {screen.cutoff && (
            <span className="mt-2 flex max-w-[560px] flex-col gap-2">
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-accent/15">
                <span
                  className="block h-full animate-fill rounded-pill bg-accent [animation-delay:300ms]"
                  style={{ width: `${screen.spentPct}%` }}
                />
              </span>
              <span className="flex flex-wrap justify-between gap-x-3 text-2xs text-muted">
                <span>{t("pastDueRetrying")}</span>
                <span>
                  {t.rich("pastDueCutoff", {
                    date: shortDate(screen.cutoff),
                    m: (c) => <span className="font-mono text-accent">{c}</span>,
                  })}
                </span>
              </span>
            </span>
          )}
        </WarmCard>
      );
    case "active":
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
    case "trial":
      return (
        <TrialCard
          daysLeft={access.trialDaysLeft ?? 0}
          title={t("trialLeft", { n: access.trialDaysLeft ?? 0 })}
        >
          {t("trialBody")}
        </TrialCard>
      );
    case "ended":
      return (
        <WarmCard icon={<Info className="h-[18px] w-[18px]" aria-hidden />} title={t("endedTitle")}>
          {screen.endedOn
            ? t("endedBody", { date: longDate(screen.endedOn) })
            : t("endedBodyNoDate")}
        </WarmCard>
      );
    case "managedElsewhere":
      return (
        <WarmCard
          icon={<Info className="h-[18px] w-[18px]" aria-hidden />}
          title={t("managedTitle", { space: state.spaceName ?? "" })}
        >
          {t("managedBody")}
        </WarmCard>
      );
    case "trialEnded":
    case "locked":
      return (
        // Said here rather than only in the privacy policy: the moment access
        // stops is exactly when someone needs to know the data is still theirs.
        <WarmCard
          icon={<Info className="h-[18px] w-[18px]" aria-hidden />}
          title={t("lockedTitle")}
        >
          {t("lockedBody")}
        </WarmCard>
      );
  }
}

/** The canvas's locked status card: white, outlined in the warm accent, the
 *  same shape whatever the reason. */
function WarmCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex animate-up items-start gap-3.5 rounded-[28px] bg-surface p-[22px] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-accent)_28%,var(--color-bg))] [animation-delay:60ms] [animation-duration:600ms]">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-display text-2xl leading-7 font-semibold tracking-[-0.01em] text-fg">
          {title}
        </p>
        <div className="flex max-w-[620px] flex-col text-sm leading-[21px] text-muted">
          {children}
        </div>
      </div>
    </section>
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
    <section
      className="flex animate-up flex-col gap-3.5 rounded-[28px] bg-fg p-6 text-surface [animation-duration:600ms]"
      style={{ animationDelay: "60ms" }}
    >
      <p className="font-display text-[28px] leading-8 font-semibold">{title}</p>
      <div className="h-2.5 overflow-hidden rounded-pill bg-surface/8" aria-hidden>
        {/* Lighter than the app's fit gradient and run sideways: on ink, the
            canvas brightens both ends so the bar still glows. It grows in from
            zero on arrival, like every other capacity bar. */}
        <div
          className="h-full animate-fill rounded-pill bg-linear-to-r from-[color-mix(in_srgb,var(--color-fit-from)_70%,var(--color-surface))] to-[color-mix(in_srgb,var(--color-fit-from)_30%,var(--color-primary))] [animation-delay:400ms]"
          style={{ width: `${used * 100}%` }}
        />
      </div>
      <p className="text-xs text-surface/80">{children}</p>
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
        "flex animate-up items-start gap-3 rounded-[28px] bg-surface p-[22px] shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] [animation-duration:600ms] [animation-delay:60ms]",
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
        "flex animate-up cursor-pointer flex-col items-start gap-2 rounded-[28px] bg-surface p-[22px] text-left text-fg transition-[box-shadow,translate] duration-[250ms] [animation-duration:600ms]",
        selected
          ? "-translate-y-0.5 shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-fit-from)_30%,var(--color-primary)),0_10px_26px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
          : "shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)]",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="mr-auto text-sm font-semibold">{name}</span>
        {badge && (
          <span className="-rotate-2 rounded-[4px] bg-marker px-2 py-[3px] text-[11px] leading-normal font-bold text-on-marker">
            {badge}
          </span>
        )}
      </span>
      <span className="font-display text-[40px] leading-[44px] font-semibold tracking-[-0.01em] tabular-nums">
        {price}
      </span>
      <span className="text-xs text-muted">{per}</span>
    </button>
  );
}
