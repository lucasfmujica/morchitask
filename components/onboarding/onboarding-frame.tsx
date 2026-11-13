"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { skipOnboarding } from "@/lib/actions/onboarding";
import { ONBOARDING_STEPS, onboardingStepPath, type OnboardingStep } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** The well every tile sits in: the page colour one step back, then white. */
export const WELL = "rounded-[28px] bg-surface-2 p-2";
export const TILE = "rounded-[22px] bg-surface shadow-tile";

/**
 * The screen each step is drawn on: the morning wash, a phone-width column,
 * the step bar at the top and the step's way forward at the foot.
 *
 * On a desktop the column stays phone-width and centred, like the closing
 * ritual: these are a few choices read top to bottom, and stretching them to
 * 1440px would put the question on the left and its answer a screen away.
 */
export function OnboardingFrame({
  step,
  children,
  footer,
}: {
  step: OnboardingStep;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,var(--wash-mint)_0%,var(--wash-mint-2)_36%,var(--surface)_66%)] text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 pt-[max(56px,calc(env(safe-area-inset-top)+24px))] pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))] md:pt-20">
        <StepBar step={step} />
        {children}
        {/* At the foot of the screen on a phone, where the thumb is; right under
            the step on a desktop, where the foot of the window is a long way
            from the question it answers. */}
        <div className="mt-auto flex flex-col items-center gap-3.5 pt-8 md:mt-0 md:pt-10">
          {footer}
        </div>
      </div>
    </div>
  );
}

function StepBar({ step }: { step: OnboardingStep }) {
  const t = useTranslations("onboarding");
  const total = ONBOARDING_STEPS.length;
  return (
    <div className="flex h-10 items-center gap-3.5">
      {step === 1 ? (
        <span className="font-display text-[17px] font-semibold tracking-[-0.01em]">
          Morchitask
        </span>
      ) : (
        <Link
          href={onboardingStepPath((step - 1) as OnboardingStep)}
          aria-label={t("back")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface text-fg shadow-pill focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10 3 5 8l5 5" />
          </svg>
        </Link>
      )}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={t("stepAria", { n: step, total })}
        className="flex flex-1 gap-1.5"
      >
        {ONBOARDING_STEPS.map((n) => (
          <span
            key={n}
            className={cn(
              "h-1 flex-1 overflow-hidden rounded-pill",
              n < step ? "bg-fg" : "bg-surface/75",
            )}
          >
            {n === step && <span className="block h-full animate-seg bg-fg" style={delay(200)} />}
          </span>
        ))}
      </div>
      <span className="font-mono text-2xs text-on-wash uppercase">
        {t("stepOf", { n: step, total })}
      </span>
      <SkipLink />
    </div>
  );
}

/**
 * Out of the whole flow, quietly. Not in the design: it exists because
 * onboarding is shown once and cannot be found again, so it must never be
 * something a person has to get through to reach their own day.
 */
function SkipLink() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      title={failed ? t("failed") : undefined}
      onClick={() =>
        start(async () => {
          setFailed(false);
          try {
            await skipOnboarding();
            router.replace("/today");
          } catch {
            setFailed(true);
          }
        })
      }
      className={cn(
        "-mr-1 h-10 cursor-pointer rounded-pill px-1 text-2xs font-medium transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60",
        failed ? "text-accent" : "text-muted",
      )}
    >
      {t("skip")}
    </button>
  );
}

/** The step's way forward: an ink pill that rises in, then breathes. */
export function OnboardingCta({
  children,
  onClick,
  disabled,
  className,
  at = 900,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  at?: number;
}) {
  return (
    <span className="flex animate-up" style={delay(at)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-[54px] cursor-pointer animate-glow items-center gap-2 rounded-pill bg-fg px-[34px] text-[15px] font-semibold text-bg transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus disabled:cursor-default disabled:opacity-60",
          className,
        )}
      >
        {children}
      </button>
    </span>
  );
}

export function ArrowIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}

export function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
