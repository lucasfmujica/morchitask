"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveOnboardingCapacity } from "@/lib/actions/onboarding";
import {
  bandEndLabel,
  bandPercent,
  BAND_START_HOUR,
  ONBOARDING_HOURS,
  onboardingStepPath,
  type OnboardingHours,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { ArrowIcon, delay, OnboardingCta, OnboardingFrame, TILE, WELL } from "./onboarding-frame";

const MOMENTS = [
  { label: "momentMorning", text: "momentMorningText", line: "top-[22px] bottom-0" },
  { label: "momentDay", text: "momentDayText", line: "inset-y-0" },
  { label: "momentNight", text: "momentNightText", line: "top-0 bottom-[22px]" },
] as const;

/**
 * Step 1: hello, what the day looks like here, and how long a day should be.
 *
 * The capacity is the one setting worth asking for up front: every day's bar
 * is measured against it, and the default (6h) is a guess about someone we
 * have not met yet.
 */
export function CapacityStep({
  name,
  initialHours,
}: {
  name: string | null;
  initialHours: OnboardingHours;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [hours, setHours] = useState<OnboardingHours>(initialHours);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const pct = bandPercent(hours);

  function next() {
    start(async () => {
      setFailed(false);
      try {
        await saveOnboardingCapacity(hours);
        router.push(onboardingStepPath(2));
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <OnboardingFrame
      step={1}
      footer={
        <>
          <OnboardingCta onClick={next} disabled={pending}>
            {t("next")}
            <ArrowIcon />
          </OnboardingCta>
          {failed ? (
            <span role="alert" className="text-sm font-medium text-accent">
              {t("failed")}
            </span>
          ) : (
            <span className="animate-up text-sm font-medium text-muted" style={delay(1000)}>
              {t("capacityFootnote")}
            </span>
          )}
        </>
      }
    >
      <div className="mt-[34px] flex animate-up flex-col gap-2.5" style={delay(100)}>
        <h1 className="font-display text-[34px] leading-[38px] font-semibold tracking-[-0.01em]">
          {name ? t("greeting", { name }) : t("greetingNoName")}
        </h1>
        <p className="max-w-[330px] text-[15px] leading-[22px] text-muted">{t("intro")}</p>
      </div>

      <ol
        aria-label={t("momentsLabel")}
        className="mt-5 flex animate-up flex-col rounded-[22px] bg-surface/70 px-3.5 py-1.5"
        style={delay(220)}
      >
        {MOMENTS.map((m) => (
          <li key={m.label} className="relative flex h-11 items-center gap-3">
            <span aria-hidden className={cn("absolute left-1 w-0.5 bg-wash-mint", m.line)} />
            <span aria-hidden className="relative h-2.5 w-2.5 shrink-0 rounded-pill bg-fit" />
            <span className="w-[52px] shrink-0 font-mono text-[11px] text-on-wash uppercase">
              {t(m.label)}
            </span>
            <span className="text-sm font-semibold">{t(m.text)}</span>
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="capacity-question"
        className={cn(WELL, "mt-[18px] animate-up")}
        style={delay(360)}
      >
        <div className={cn(TILE, "flex flex-col gap-3.5 px-4 pt-[18px] pb-4")}>
          <div className="flex items-end justify-between gap-3">
            <h2
              id="capacity-question"
              className="max-w-[190px] font-sans text-[15px] leading-5 font-semibold tracking-normal"
            >
              {t("capacityQuestion")}
            </h2>
            <span className="font-display text-[40px] leading-10 font-semibold tracking-[-0.01em] tabular-nums">
              {t("hours", { n: hours })}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-labelledby="capacity-question"
            className="flex gap-1 rounded-pill bg-surface-2 p-1"
          >
            {ONBOARDING_HOURS.map((n) => {
              const on = n === hours;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t("hoursAria", { n })}
                  onClick={() => setHours(n)}
                  className={cn(
                    "h-[38px] flex-1 cursor-pointer rounded-pill text-sm font-semibold tabular-nums transition-[background-color,box-shadow,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    on ? "bg-surface text-fg shadow-pill" : "bg-transparent text-muted",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <div aria-hidden className="flex h-2.5 overflow-hidden rounded-pill bg-surface-2">
              <div
                className="h-full animate-fill rounded-pill bg-fit transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] [animation-delay:500ms]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div aria-hidden className="relative h-3.5 font-mono text-[11px] text-subtle">
              <span className="absolute top-0 left-0">
                {String(BAND_START_HOUR).padStart(2, "0")}:00
              </span>
              <span
                className="absolute top-0 -translate-x-full text-on-wash transition-[left] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
                style={{ left: `${pct}%` }}
              >
                {bandEndLabel(hours)}
              </span>
            </div>
          </div>
          <p className="text-[13px] leading-[18px] font-semibold text-primary" aria-live="polite">
            {t(`hint${hours}`)}
          </p>
        </div>
      </section>
    </OnboardingFrame>
  );
}
