"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DEMO_DAY } from "./demo";
import { RitualMidday, RitualMorning, RitualNight } from "./ritual-screens";

/** ritual3.body counts things; the other two bodies ignore these. */
const BODY_VALUES = {
  done: DEMO_DAY.doneClose,
  total: DEMO_DAY.totalClose,
  left: DEMO_DAY.totalClose - DEMO_DAY.doneClose,
};

const MOMENTS = [
  {
    key: "morning",
    clock: "08:30",
    Screen: RitualMorning,
    well: "bg-[linear-gradient(180deg,var(--wash-mint),var(--wash-mint-2))]",
  },
  {
    key: "midday",
    clock: "12:00",
    Screen: RitualMidday,
    well: "bg-[linear-gradient(180deg,var(--wash-mint-2),var(--surface-2))]",
  },
  {
    key: "night",
    clock: "19:00",
    Screen: RitualNight,
    well: "bg-[linear-gradient(180deg,var(--wash-peach),var(--surface-2))]",
  },
] as const;

/**
 * The hero's phone: the day's three rituals played like stories.
 *
 * Each moment holds for five seconds (the story bar's own animation is the
 * clock, so the bar and the switch can't drift), then the next one mounts fresh (keyed
 * on a tick) so its entry animations replay instead of showing a finished
 * frame. The well behind the phone follows the hour: mint in the morning,
 * peach at night. Gradients can't be transitioned, so the three washes are
 * stacked and cross-faded.
 *
 * Auto-advance stops on hover and focus (WCAG 2.2.2: anything that moves for
 * more than five seconds needs a way to pause it) and never starts under
 * reduced motion, where the tabs still switch by hand.
 */
export function RitualPlayer() {
  const t = useTranslations("marketing");
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reduced motion shortens the bar's animation to an instant, so it still
  // "ends": without this check the moments would flip every frame.
  const advance = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setStep((s) => (s + 1) % MOMENTS.length);
    setTick((n) => n + 1);
  };

  const pick = (i: number) => {
    setStep(i);
    setTick((n) => n + 1);
  };

  // Roving focus, as a tablist expects: arrows move and select.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (step + dir + MOMENTS.length) % MOMENTS.length;
    pick(next);
    tabs.current[next]?.focus();
  };

  const m = MOMENTS[step];
  const Screen = m.Screen;
  const tabId = (i: number) => `ritual-tab-${MOMENTS[i].key}`;

  return (
    <div
      className="animate-up relative isolate flex w-[520px] max-w-full flex-none flex-col items-center gap-4 overflow-hidden rounded-[40px] px-4 pt-5 pb-4 sm:px-7 sm:pt-7 sm:pb-[22px]"
      style={{ animationDelay: "200ms" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {MOMENTS.map((x, i) => (
        <span
          key={x.key}
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 transition-opacity duration-[1200ms] ease-out",
            x.well,
            i === step ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      <div className="flex w-full items-center justify-between gap-3">
        <span className="flex h-[34px] items-center gap-2 rounded-pill bg-surface/75 px-3.5 text-sm font-semibold">
          <span className="font-mono font-medium">{m.clock}</span>
          {t(`player.${m.key}Verb`)}
        </span>
        <div
          role="tablist"
          aria-label={t("player.tablist")}
          className="flex gap-1.5"
          onKeyDown={onKeyDown}
        >
          {MOMENTS.map((x, i) => (
            <button
              key={x.key}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={tabId(i)}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-controls="ritual-panel"
              tabIndex={i === step ? 0 : -1}
              aria-label={t(`player.${x.key}`)}
              onClick={() => pick(i)}
              className="flex h-6 w-11 cursor-pointer items-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="block h-1.5 w-full overflow-hidden rounded-pill bg-fg/15">
                {i < step && <span className="block h-full w-full rounded-pill bg-fg" />}
                {i === step && (
                  <span
                    key={tick}
                    className="animate-story block h-full w-full rounded-pill bg-fg"
                    style={{ animationPlayState: paused ? "paused" : "running" }}
                    onAnimationEnd={advance}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        id="ritual-panel"
        role="tabpanel"
        aria-labelledby={tabId(step)}
        className="overflow-hidden rounded-[36px] shadow-[0_30px_60px_-30px_rgb(var(--shadow-color)/0.35)] [--s:0.74] sm:[--s:0.83]"
        style={{ width: "calc(390px * var(--s))", height: "calc(844px * var(--s))" }}
      >
        {/* The screen is a picture; a screen reader gets its words instead. */}
        <p className="sr-only">{t(`ritual${step + 1}.title`)}</p>
        <p className="sr-only">{t(`ritual${step + 1}.body`, BODY_VALUES)}</p>
        <div aria-hidden inert className="origin-top-left scale-[var(--s)]">
          <Screen key={tick} />
        </div>
      </div>
    </div>
  );
}
