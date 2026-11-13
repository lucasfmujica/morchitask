"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { CALENDAR_AUTHORIZATION_PARAMS } from "@/lib/google-grant";
import { onboardingStepPath } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import {
  ArrowIcon,
  CheckIcon,
  delay,
  OnboardingCta,
  OnboardingFrame,
  TILE,
  WELL,
} from "./onboarding-frame";

const PROMISES = ["promiseBlocks", "promiseMeetings", "promiseLeave"] as const;

/** The picture's clock: a two-hour window with one thing in each hour. Times,
 *  not words, so they are the same in every language. */
const PREVIEW_FROM = "10:00";
const PREVIEW_NEXT = "11:00";
const PREVIEW_TO = "12:00";

/**
 * Step 2: Google Calendar, optional.
 *
 * Connecting is the same incremental grant Settings asks for (sign-in only
 * asks for identity, see lib/google-grant.ts), and Google sends them back to
 * step 3. Someone who comes back here already connected, with the back
 * button, sees that instead of the button.
 *
 * The three promises were checked against the Calendar routes: the app only
 * creates, moves or deletes the events of blocks scheduled here
 * (app/api/calendar/blocks, which keeps each block's own event id), and
 * everything else on the person's calendars is only ever listed
 * (app/api/calendar). If either route ever starts touching other events, the
 * copy has to change with it.
 */
export function CalendarStep({ connected }: { connected: boolean }) {
  const t = useTranslations("onboarding");
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      await signIn("google", { redirectTo: onboardingStepPath(3) }, CALENDAR_AUTHORIZATION_PARAMS);
    } catch {
      setConnecting(false);
    }
  }

  return (
    <OnboardingFrame
      step={2}
      footer={
        connected ? (
          <>
            <span
              role="status"
              className="flex animate-up items-center gap-2 rounded-pill bg-surface py-2 pr-3.5 pl-2 text-[13px] font-semibold shadow-pill"
            >
              <span
                className="flex h-[22px] w-[22px] animate-pop items-center justify-center rounded-pill bg-fit text-on-primary"
                style={delay(150)}
              >
                <CheckIcon size={10} />
              </span>
              {t("calendarConnected")}
            </span>
            <NextLink />
          </>
        ) : (
          <>
            <OnboardingCta onClick={connect} disabled={connecting} className="gap-2.5 px-7">
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden
              >
                <rect x="2" y="3" width="12" height="11" rx="2" />
                <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
              </svg>
              {t("connectCalendar")}
            </OnboardingCta>
            <Link
              href={onboardingStepPath(3)}
              className="animate-up rounded-pill text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus"
              style={delay(1000)}
            >
              {t("notNow")}
            </Link>
          </>
        )
      }
    >
      <CalendarPreview />

      <div className="mt-5 flex animate-up flex-col gap-2" style={delay(500)}>
        <span className="self-start rounded-pill bg-surface/75 px-2.5 py-1 text-2xs font-semibold text-on-wash">
          {t("optional")}
        </span>
        <h1 className="font-display text-[30px] leading-[34px] font-bold tracking-[-0.02em]">
          {t("calendarTitle")}
        </h1>
        <p className="max-w-[330px] text-[15px] leading-[21px] text-muted">{t("calendarBody")}</p>
      </div>

      <ul
        className="mt-4 flex animate-up flex-col gap-2.5 rounded-[22px] bg-surface px-3.5 py-3 shadow-soft"
        style={delay(650)}
      >
        {PROMISES.map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-[13px] leading-[18px]">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-pill bg-fit text-on-primary">
              <CheckIcon size={9} />
            </span>
            <span>
              {t.rich(key, { b: (chunks) => <span className="font-semibold">{chunks}</span> })}
            </span>
          </li>
        ))}
        <li className="border-t border-surface-2 pt-2.5 text-2xs leading-[17px] text-muted">
          {t("permissionNote")}
        </li>
      </ul>
    </OnboardingFrame>
  );
}

/** "Seguir" once connected: a link, since nothing is left to save. */
function NextLink() {
  const t = useTranslations("onboarding");
  return (
    <span className="flex animate-up" style={delay(200)}>
      <Link
        href={onboardingStepPath(3)}
        className="flex h-[54px] animate-glow items-center gap-2 rounded-pill bg-fg px-[34px] text-[15px] font-semibold text-bg [animation-delay:1000ms] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus"
      >
        {t("next")}
        <ArrowIcon />
      </Link>
    </span>
  );
}

/**
 * Both directions in one picture: a meeting read from Google next to a block
 * Morchitask writes back. Decoration, so hidden from screen readers: the copy
 * underneath says the same in words.
 */
function CalendarPreview() {
  const t = useTranslations("onboarding");
  return (
    <div aria-hidden className={cn(WELL, "mt-[26px]")}>
      <div className={cn(TILE, "flex flex-col gap-1.5 py-3.5 pr-3.5 pl-3")}>
        <div className="flex items-center justify-between px-0.5 pb-1 leading-[normal]">
          <span className="text-2xs font-semibold text-muted">{t("previewDay")}</span>
          <span className="font-mono text-[11px] text-subtle">
            {t("previewRange", { from: PREVIEW_FROM, to: PREVIEW_TO })}
          </span>
        </div>
        <div className="flex animate-drop items-stretch gap-2.5" style={delay(300)}>
          <span className="w-9 pt-[9px] font-mono text-[11px] text-subtle">{PREVIEW_FROM}</span>
          <div className="flex flex-1 items-center gap-2.5 rounded-[14px] bg-bg px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)]">
            <span className="flex flex-1 flex-col gap-px leading-[normal]">
              <span className="text-[13px] font-semibold">{t("previewMeeting")}</span>
              <span className="text-[11px] text-muted">{t("previewMeetingSource")}</span>
            </span>
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          </div>
        </div>
        <div className="flex animate-drop items-stretch gap-2.5" style={delay(480)}>
          <span className="w-9 pt-[9px] font-mono text-[11px] text-subtle">{PREVIEW_NEXT}</span>
          <div className="flex h-[60px] flex-1 items-center gap-2.5 rounded-[14px] bg-mint-soft px-3 py-2">
            <span className="flex flex-1 flex-col gap-px self-start leading-[normal]">
              <span className="text-[13px] font-semibold">{t("previewBlock")}</span>
              <span className="text-[11px] text-on-wash">{t("previewBlockSource")}</span>
            </span>
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 5.5h9M9 3l2.5 2.5L9 8M13.5 10.5h-9M7 8l-2.5 2.5L7 13" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
