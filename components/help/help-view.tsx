"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { SHORTCUTS, shortcutKeys, useIsApple } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** The three moments of the day, with the glyphs the canvas draws them with. */
const RITUAL = [
  {
    when: "morning",
    icon: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5",
    dot: "bg-fit text-on-primary",
  },
  {
    when: "day",
    icon: "M2 3h12v11H2zM2 6.5h12M5.5 1.5v3M10.5 1.5v3",
    dot: "bg-mint-soft text-primary",
  },
  {
    when: "night",
    icon: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5",
    dot: "bg-wash-peach text-accent",
  },
] as const;

/** Every answer here was checked against what the app actually does (billing
 *  in lib/billing.ts, deletion in lib/db/queries/account.ts). Change one of
 *  those and the matching answer has to change with it. */
const FAQ = [
  ["faqTrialQ", "faqTrialA"],
  ["faqTwoQ", "faqTwoA"],
  ["faqWhoQ", "faqWhoA"],
  ["faqCardQ", "faqCardA"],
  ["faqCancelQ", "faqCancelA"],
  ["faqDataQ", "faqDataA"],
] as const;

/**
 * Ayuda: the ritual in three steps, the shortcuts, what billing does, and a
 * person to write to. Reached from the foot of the sidebar, so it is one click
 * away from every screen without being one more place to visit every day.
 */
export function HelpView() {
  const t = useTranslations("help");
  const ts = useTranslations("shortcuts");
  const detectedApple = useIsApple();
  // The toggle lets someone read the other system's keys (a Mac at home, a PC
  // at work); it starts on whatever the browser says this one is.
  const [picked, setPicked] = useState<"mac" | "win" | null>(null);
  const apple = picked ? picked === "mac" : detectedApple;
  const [open, setOpen] = useState<number>(0);
  const mail = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(t("contactSubject"))}`;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex animate-up flex-col gap-1 px-2 pt-3 [animation-duration:600ms]">
        <h1 className="font-display text-[32px] leading-9 font-bold tracking-[-0.02em] text-fg">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">{t("lead")}</p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section
            aria-labelledby="ritual-h"
            className="flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:40ms] [animation-duration:600ms]"
          >
            <h2
              id="ritual-h"
              className="px-3 pt-2.5 pb-1 font-display text-lg font-semibold text-fg"
            >
              {t("ritualTitle")}
            </h2>
            {RITUAL.map((r) => (
              <div key={r.when} className="flex gap-3.5 rounded-[20px] bg-surface px-4 py-3.5">
                <span className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-[34px] w-[34px] items-center justify-center rounded-full",
                      r.dot,
                    )}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={r.icon} />
                    </svg>
                  </span>
                  <span className="font-mono text-[10px] text-on-wash">{t(r.when)}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-[15px] font-semibold text-fg">{t(`${r.when}Title`)}</span>
                  <span className="text-xs leading-[19px] text-muted">{t(`${r.when}Body`)}</span>
                </span>
              </div>
            ))}
          </section>

          <section
            aria-labelledby="shortcuts-h"
            className="flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:100ms] [animation-duration:600ms]"
          >
            <div className="flex flex-wrap items-center gap-2.5 pt-2 pr-2 pb-1 pl-3">
              <h2 id="shortcuts-h" className="mr-auto font-display text-lg font-semibold text-fg">
                {t("shortcutsTitle")}
              </h2>
              <div
                role="radiogroup"
                aria-label={t("systemLabel")}
                className="flex gap-0.5 rounded-pill bg-border p-[3px]"
              >
                {(["mac", "win"] as const).map((os) => {
                  const on = (os === "mac") === apple;
                  return (
                    <button
                      key={os}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPicked(os)}
                      className={cn(
                        "h-[30px] cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-colors duration-200",
                        on ? "bg-surface text-fg shadow-nav" : "text-muted hover:text-fg",
                      )}
                    >
                      {os === "mac" ? t("mac") : t("windows")}
                    </button>
                  );
                })}
              </div>
            </div>
            <ul className="rounded-[20px] bg-surface px-4 py-1.5">
              {SHORTCUTS.map((s, i) => (
                <li
                  key={s.labelKey}
                  className={cn(
                    "flex min-h-11 items-center gap-3",
                    i > 0 && "border-t border-surface-2",
                  )}
                >
                  <span className="flex-1 text-xs text-fg">{ts(s.labelKey)}</span>
                  <span className="flex gap-1">
                    {shortcutKeys(s.keys, apple).map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-[8px] bg-surface px-[7px] font-mono text-2xs text-fg shadow-[inset_0_0_0_1px_var(--color-border),0_1px_0_var(--color-border)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-3 pt-0.5 pb-1.5 text-2xs text-muted">
              {t("shortcutsNote", { os: detectedApple ? "mac" : "other" })}
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section
            aria-labelledby="faq-h"
            className="flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:160ms] [animation-duration:600ms]"
          >
            <h2 id="faq-h" className="px-3 pt-2.5 pb-1 font-display text-lg font-semibold text-fg">
              {t("faqTitle")}
            </h2>
            {FAQ.map(([q, a], i) => {
              const expanded = open === i;
              return (
                <div key={q} className="overflow-hidden rounded-[18px] bg-surface">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOpen(expanded ? -1 : i)}
                    className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-fg transition-colors hover:bg-bg/60"
                  >
                    <span className="flex-1 text-sm font-semibold">{t(q)}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={cn(
                        "shrink-0 text-subtle transition-transform duration-[250ms]",
                        expanded && "rotate-180",
                      )}
                    >
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                  {expanded && (
                    <p
                      id={`faq-${i}`}
                      className="animate-up px-4 pb-3.5 text-xs leading-[19px] text-muted [animation-duration:300ms]"
                    >
                      {t(a)}
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          <section
            aria-labelledby="contact-h"
            className="animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:220ms] [animation-duration:600ms]"
          >
            <div className="flex flex-wrap items-center gap-4 rounded-[22px] bg-surface p-[18px]">
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                <h2 id="contact-h" className="font-display text-lg font-semibold text-fg">
                  {t("contactTitle")}
                </h2>
                <p className="text-xs leading-[19px] text-muted">{t("contactBody")}</p>
              </div>
              <a
                href={mail}
                className="flex h-[46px] items-center gap-2 rounded-pill bg-fg px-[22px] text-sm font-semibold text-surface transition-opacity hover:opacity-90"
              >
                <Mail className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                {t("contactAction")}
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
