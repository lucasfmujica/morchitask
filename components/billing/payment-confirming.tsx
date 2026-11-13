"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Mail, RotateCw } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { getBillingState, openBillingPortal } from "@/lib/actions/billing";
import {
  elapsedLabel,
  paymentConfirmed,
  POLL_EVERY_MS,
  SLOW_AFTER_S,
  STOP_AFTER_S,
} from "@/lib/payment-confirmation";
import { paddedDate } from "@/lib/format";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { useHydrated } from "@/lib/use-hydrated";
import { formatUsd, PRICE_MONTHLY_USD, PRICE_YEARLY_USD } from "@/lib/pricing";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { cn } from "@/lib/utils";
import { ArrowIcon, openInNewTab, partnerOf, PlanPrice, type BillingState } from "./billing-parts";

/**
 * The minute between paying and the app knowing.
 *
 * Polar sends people back the moment the card is accepted, but the app only
 * learns about it from a webhook that arrives on its own schedule. Showing the
 * plans in that gap invited a second payment, so this page polls instead and
 * says what it is waiting for. Never the plan picker while confirming.
 */
export function PaymentConfirming({
  initial,
  plan,
}: {
  initial: BillingState;
  plan: "month" | "year" | null;
}) {
  const [state, setState] = useState(initial);
  const [elapsed, setElapsed] = useState(0);
  // Bumped by "Actualizar": a fresh minute of polling, counted from the
  // slow state so the page does not jump back to "confirming".
  const [run, setRun] = useState(0);
  // The moment they came back, for the first step's timestamp.
  const [arrivedAt] = useState(() => new Date());
  const done = paymentConfirmed(state);

  const poll = useCallback(async () => {
    try {
      setState(await getBillingState());
    } catch {
      // A failed poll is just a poll that found nothing; the next one retries.
    }
  }, []);

  useEffect(() => {
    if (done) return;
    const start = Date.now() - (run ? SLOW_AFTER_S * 1000 : 0);
    const secs = () => (Date.now() - start) / 1000;
    const tick = setInterval(() => {
      setElapsed(secs());
      if (secs() >= STOP_AFTER_S) clearInterval(tick);
    }, 1_000);
    const ask = setInterval(() => {
      if (secs() >= STOP_AFTER_S) clearInterval(ask);
      else void poll();
    }, POLL_EVERY_MS);
    return () => {
      clearInterval(tick);
      clearInterval(ask);
    };
  }, [done, poll, run]);

  function refresh() {
    // "Actualizar" asks now, and gives the webhook another minute of polling.
    setRun((r) => r + 1);
    void poll();
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-[18px] pt-3 pb-6">
      <Title />
      {done ? (
        <Done state={state} />
      ) : elapsed >= SLOW_AFTER_S ? (
        <Slow elapsed={elapsed} onRefresh={refresh} />
      ) : (
        <Waiting state={state} plan={plan} elapsed={elapsed} arrivedAt={arrivedAt} />
      )}
    </div>
  );
}

function Title() {
  const t = useTranslations("billing");
  return (
    <h1 className="animate-up font-display text-[32px] leading-9 font-semibold tracking-[-0.01em] text-fg [animation-duration:600ms]">
      {t("title")}
    </h1>
  );
}

function Waiting({
  state,
  plan,
  elapsed,
  arrivedAt,
}: {
  state: BillingState;
  plan: "month" | "year" | null;
  elapsed: number;
  arrivedAt: Date;
}) {
  const t = useTranslations("billing");
  const format = useFormatter();
  const locale = useLocale();
  const partner = partnerOf(state);
  const hydrated = useHydrated();
  const steps = [
    {
      title: t("confirmStepPaid"),
      body: t("confirmStepPaidBody"),
      // Client-only: the server's clock and time zone are not the person's.
      when: hydrated
        ? format.dateTime(arrivedAt, { hour: "2-digit", minute: "2-digit", hour12: false })
        : "",
      kind: "done" as const,
    },
    {
      title: t("confirmStepWebhook"),
      body: t("confirmStepWebhookBody"),
      when: t("confirmStepWaiting"),
      kind: "now" as const,
    },
    {
      title: t("confirmStepActive"),
      body: t("confirmStepActiveBody", { partner: partner?.display_name ?? "none" }),
      when: "",
      kind: "next" as const,
    },
  ];
  const price =
    plan === "year"
      ? formatUsd(PRICE_YEARLY_USD, locale)
      : plan === "month"
        ? formatUsd(PRICE_MONTHLY_USD, locale)
        : "";

  return (
    <>
      <section
        aria-live="polite"
        className="flex animate-up flex-col gap-4 rounded-[28px] bg-ink px-[26px] pt-[26px] pb-6 text-on-ink [animation-delay:60ms] [animation-duration:600ms]"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="relative h-[22px] w-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_2.5px_color-mix(in_srgb,var(--color-on-ink)_14%,transparent)]"
          >
            <span className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent border-t-ink-fit-from [animation-duration:1.1s]" />
          </span>
          <span className="font-display text-[28px] leading-8 font-semibold tracking-[-0.01em]">
            {t("confirmTitle")}
          </span>
          <span className="ml-auto font-mono text-2xs text-on-ink-muted tabular-nums">
            {elapsedLabel(elapsed)}
          </span>
        </div>
        <div aria-hidden className="relative h-2.5 overflow-hidden rounded-pill bg-ink-3">
          <div className="absolute inset-y-0 w-2/5 animate-drift rounded-pill bg-linear-to-r from-transparent via-ink-fit-from via-45% to-ink-fit-to" />
        </div>
        <span className="max-w-[600px] text-xs leading-[19px] text-on-ink-muted">
          {t("confirmBody")}
        </span>
      </section>

      <ol
        aria-label={t("confirmStepsLabel")}
        className="flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:140ms] [animation-duration:600ms]"
      >
        {steps.map((s) => (
          <li
            key={s.title}
            className={cn(
              "flex items-center gap-3 rounded-[20px] bg-surface px-4 py-3.5",
              s.kind === "next" && "opacity-60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                s.kind === "done" && "bg-fit text-on-primary",
                s.kind === "now" && "bg-mint-soft",
                s.kind === "next" && "shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]",
              )}
            >
              {s.kind === "done" && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              )}
              {s.kind === "now" && (
                <span className="h-2 w-2 animate-breathe rounded-full bg-primary" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-fg">{s.title}</span>
              <span className="text-2xs text-muted">{s.body}</span>
            </span>
            <span className="shrink-0 font-mono text-2xs text-subtle">{s.when}</span>
          </li>
        ))}
      </ol>
      <p className="animate-up text-2xs text-muted [animation-delay:220ms] [animation-duration:600ms]">
        {t("confirmFoot", { plan: plan ?? "other", price })}
      </p>
    </>
  );
}

function Slow({ elapsed, onRefresh }: { elapsed: number; onRefresh: () => void }) {
  const t = useTranslations("billing");
  const mail = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(t("slowMailSubject"))}`;
  return (
    <>
      <section
        aria-live="polite"
        className="flex animate-up flex-col gap-3.5 rounded-[28px] bg-surface p-6 shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-accent)_28%,var(--color-bg))] [animation-delay:60ms] [animation-duration:600ms]"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
          >
            <Clock className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </span>
          <span className="font-display text-[26px] leading-[30px] font-semibold tracking-[-0.01em] text-fg">
            {t("slowTitle")}
          </span>
          <span className="ml-auto font-mono text-2xs text-accent tabular-nums">
            {elapsedLabel(elapsed)}
          </span>
        </div>
        <p className="max-w-[640px] text-sm leading-[21px] text-muted">
          {t.rich("slowBody", { b: (c) => <b className="text-fg">{c}</b> })}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-[46px] cursor-pointer items-center gap-2 rounded-pill bg-fg px-6 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            {t("slowRefresh")}
          </button>
          <a
            href={mail}
            className="flex h-[46px] items-center gap-2 rounded-pill bg-surface-2 px-[18px] text-sm font-semibold text-fg transition-colors hover:bg-border"
          >
            <Mail className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            {t("slowContact")}
          </a>
        </div>
      </section>
      <section className="flex animate-up flex-col gap-2.5 rounded-[28px] bg-surface-2 px-5 py-[18px] [animation-delay:140ms] [animation-duration:600ms]">
        <h2 className="font-display text-base font-semibold text-fg">{t("slowMeanwhile")}</h2>
        {(["slowTip1", "slowTip2", "slowTip3"] as const).map((k) => (
          <span key={k} className="flex items-start gap-2.5 text-xs leading-[19px] text-fg">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-subtle" />
            {t(k)}
          </span>
        ))}
      </section>
    </>
  );
}

function Done({ state }: { state: BillingState }) {
  const t = useTranslations("billing");
  const format = useFormatter();
  const locale = useLocale();
  const [error, setError] = useState(false);
  const sub = state.subscription;
  const partner = partnerOf(state);
  const managedByOther = !!state.manager && state.manager.id !== state.meId;
  const end = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const interval = sub?.recurring_interval === "year" ? "year" : "month";
  const me = state.members.find((m) => m.id === state.meId);
  const people = [me, partner].filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <>
      <section
        aria-live="polite"
        className="flex animate-up flex-col gap-4 rounded-[28px] bg-ink px-[26px] pt-[26px] pb-6 text-on-ink [animation-delay:60ms] [animation-duration:600ms]"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 animate-pop items-center justify-center rounded-full bg-linear-135 from-ink-fit-from to-primary text-on-primary [animation-delay:300ms]"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          </span>
          <span className="font-display text-[28px] leading-8 font-semibold tracking-[-0.01em]">
            {t("doneTitle")}
          </span>
        </div>
        <div aria-hidden className="h-2.5 overflow-hidden rounded-pill bg-ink-3">
          <div className="h-full w-full animate-fill rounded-pill bg-linear-to-r from-ink-fit-from to-ink-fit-to [animation-delay:200ms]" />
        </div>
        <span className="text-xs text-on-ink-muted">{t("doneBody")}</span>
      </section>

      <section
        aria-label={t("donePlanLabel")}
        className="grid animate-up grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:140ms] [animation-duration:600ms]"
      >
        <DoneTile label={t("donePlan")} sub={<PlanPrice interval={interval} format="donePrice" />}>
          {interval === "year" ? t("yearly") : t("monthly")}
        </DoneTile>
        {end && (
          <DoneTile
            label={sub?.cancel_at_period_end ? t("doneEnds") : t("doneNext")}
            sub={t.rich("doneYear", {
              year: end.getFullYear(),
              date: paddedDate(end, locale, true),
              m: (c) => <span className="font-mono text-fg">{c}</span>,
            })}
          >
            {format.dateTime(end, { day: "numeric", month: "long" })}
          </DoneTile>
        )}
        <DoneTile
          label={t("doneCovers")}
          sub={state.spaceName ? t("doneSpace", { space: state.spaceName }) : null}
          display={false}
        >
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="flex">
              {people.map((p, i) => (
                <span
                  key={p.id}
                  className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}
                >
                  <OwnerAvatar profile={p} size={30} />
                </span>
              ))}
            </span>
            <span className="font-display text-xl font-semibold text-fg">
              {t("doneCoversWho", { partner: partner?.display_name ?? "none" })}
            </span>
          </span>
        </DoneTile>
      </section>

      <div className="flex animate-up flex-wrap items-center gap-3 [animation-delay:220ms] [animation-duration:600ms]">
        <span className="mr-auto text-2xs text-muted">{t("doneFoot")}</span>
        {!managedByOther && (
          <button
            type="button"
            onClick={() => openInNewTab(openBillingPortal, () => setError(true))}
            className="h-[50px] cursor-pointer rounded-pill bg-surface-2 px-5 text-sm font-semibold text-fg transition-colors hover:bg-border"
          >
            {t("doneManage")}
          </button>
        )}
        <Link
          href="/today"
          className="flex h-[50px] animate-glow items-center gap-2 rounded-pill bg-fg px-7 text-sm font-semibold text-surface"
        >
          {t("doneGoToday")}
          <ArrowIcon />
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t("checkoutFailed")}
        </p>
      )}
    </>
  );
}

function DoneTile({
  label,
  sub,
  display = true,
  children,
}: {
  label: string;
  sub: React.ReactNode;
  display?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[22px] bg-surface p-[18px]">
      <span className="text-2xs text-muted">{label}</span>
      {display ? (
        <span className="font-display text-2xl leading-7 font-semibold tracking-[-0.01em] text-fg">
          {children}
        </span>
      ) : (
        children
      )}
      {sub && <span className="text-2xs text-muted">{sub}</span>}
    </div>
  );
}
