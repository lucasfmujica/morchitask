"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { finishOnboarding } from "@/lib/actions/onboarding";
import { formatMinutes } from "@/lib/format";
import { minutesToHHMM } from "@/components/day/use-agenda-scheduling";
import { DEFAULT_END_TARGET_MIN } from "@/lib/scheduling";
import {
  EXAMPLE_TASKS,
  firstDayFit,
  MAX_ONBOARDING_TASKS,
  NEW_TASK_ESTIMATE,
  nextEstimate,
  type ExampleKind,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { ArrowIcon, delay, OnboardingCta, OnboardingFrame, TILE, WELL } from "./onboarding-frame";

type Row = { id: number; title: string; minutes: number; kind: ExampleKind };

/**
 * Step 3: a first day that already has something in it.
 *
 * The examples are drafts until "Empezar mi día": nothing is written while
 * they are being edited, so deleting all three and leaving costs nothing.
 * The capacity tile is the one from step 1, so the choice made there is the
 * first thing they see their day measured against.
 */
export function FirstDayStep({
  capacityMin,
  colors,
}: {
  capacityMin: number;
  /** The person's own category colours for the two kinds, when they exist. */
  colors: Record<ExampleKind, string | null>;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    EXAMPLE_TASKS.map((e, i) => ({ id: i + 1, title: t(e.key), minutes: e.minutes, kind: e.kind })),
  );
  const nextId = useRef(EXAMPLE_TASKS.length + 1);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const planned = rows.reduce((a, r) => a + r.minutes, 0);
  const fit = firstDayFit(planned, capacityMin);
  const over = fit === "over";
  const canAdd = draft.trim().length > 0 && rows.length < MAX_ONBOARDING_TASKS;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function add() {
    if (!canAdd) return;
    const id = nextId.current++;
    setRows((rs) => [...rs, { id, title: draft.trim(), minutes: NEW_TASK_ESTIMATE, kind: "work" }]);
    setDraft("");
  }

  function startDay() {
    start(async () => {
      setFailed(false);
      try {
        await finishOnboarding(rows.map(({ title, minutes, kind }) => ({ title, minutes, kind })));
        router.replace("/today");
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <OnboardingFrame
      step={3}
      footer={
        <>
          <OnboardingCta onClick={startDay} disabled={pending} className="px-[30px]">
            {t("startDay")}
            <ArrowIcon />
          </OnboardingCta>
          {failed && (
            <span role="alert" className="text-sm font-medium text-accent">
              {t("failed")}
            </span>
          )}
        </>
      }
    >
      <div className="mt-[26px] flex animate-up flex-col gap-1.5" style={delay(80)}>
        <h1 className="font-display text-[30px] leading-[34px] font-semibold tracking-[-0.01em]">
          {t("firstDayTitle")}
        </h1>
        <p className="text-[15px] leading-[21px] text-muted">{t("firstDayBody")}</p>
      </div>

      <section
        aria-label={t("capacityLabel")}
        className={cn(WELL, "mt-4 animate-up")}
        style={delay(180)}
      >
        <div className={cn(TILE, "flex flex-col gap-2 px-4 py-3.5")}>
          <div className="flex items-baseline justify-between leading-[normal]">
            <span className="tabular-nums">
              {t.rich("plannedOf", {
                planned: formatMinutes(planned),
                capacity: formatMinutes(capacityMin),
                big: (chunks) => (
                  <span className="font-display text-[26px] font-semibold tracking-[-0.01em] tabular-nums">
                    {chunks}
                  </span>
                ),
                small: (chunks) => (
                  <span className="text-sm font-semibold text-muted">{chunks}</span>
                ),
              })}
            </span>
            <span className="text-2xs text-muted">{t("whatYouChose")}</span>
          </div>
          <div aria-hidden className="flex h-2.5 overflow-hidden rounded-pill bg-surface-2">
            <div
              className={cn(
                "h-full animate-fill rounded-pill transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] [animation-delay:400ms]",
                over ? "bg-hatch" : "bg-fit",
              )}
              style={{ width: `${Math.min(100, (planned / capacityMin) * 100)}%` }}
            />
          </div>
          <span
            role="status"
            className={cn(
              "text-2xs leading-[normal] font-semibold",
              over ? "text-accent" : "text-primary",
            )}
          >
            {fit === "over"
              ? t("fitOver", { over: formatMinutes(planned - capacityMin) })
              : fit === "empty"
                ? t("fitEmpty")
                : fit === "exact"
                  ? t("fitExact")
                  : t("fitFits", { left: formatMinutes(capacityMin - planned) })}
          </span>
        </div>
      </section>

      <section
        aria-label={t("tasksLabel")}
        className={cn(WELL, "mt-3 flex animate-up flex-col gap-1.5")}
        style={delay(260)}
      >
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex animate-drop items-center gap-2 rounded-[18px] bg-surface py-2 pr-2 pl-3.5 shadow-tile transition-transform duration-200 hover:-translate-y-px"
            style={delay(320 + i * 90)}
          >
            <span
              aria-hidden
              className="h-[22px] w-1.5 shrink-0 rounded-pill bg-border-strong"
              style={colors[r.kind] ? { backgroundColor: colors[r.kind]! } : undefined}
            />
            <input
              aria-label={t("taskNameAria", { n: i + 1 })}
              value={r.title}
              onChange={(e) => update(r.id, { title: e.target.value })}
              maxLength={200}
              className="h-[30px] w-full min-w-0 flex-1 rounded-md bg-transparent p-0 text-sm font-semibold text-fg outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)]"
            />
            <button
              type="button"
              onClick={() => update(r.id, { minutes: nextEstimate(r.minutes) })}
              aria-label={t("taskEstimateAria", { time: formatMinutes(r.minutes) })}
              className="h-[30px] shrink-0 cursor-pointer rounded-pill bg-bg px-2.5 font-mono text-2xs text-muted transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {formatMinutes(r.minutes)}
            </button>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              aria-label={t("taskDeleteAria", { title: r.title })}
              className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-pill text-subtle transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-3 py-2.5 text-center text-[13px] text-muted">{t("emptyList")}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-0.5 flex items-center gap-2 rounded-pill bg-surface py-1.5 pr-1.5 pl-4"
        >
          <label htmlFor="onboarding-own-task" className="sr-only">
            {t("addOwnLabel")}
          </label>
          <input
            id="onboarding-own-task"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("addOwnPlaceholder")}
            maxLength={200}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <span className="font-mono text-2xs text-subtle">{formatMinutes(NEW_TASK_ESTIMATE)}</span>
          <button
            type="submit"
            aria-label={t("add")}
            aria-disabled={!canAdd}
            className={cn(
              "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-fit text-on-primary transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              canAdd ? "cursor-pointer" : "cursor-default opacity-45",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </form>
      </section>

      <div className="mt-3 flex animate-up items-center gap-3 px-1.5" style={delay(520)}>
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-surface text-on-wash shadow-pill">
          <svg
            viewBox="0 0 16 16"
            className="h-[15px] w-[15px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
          </svg>
        </span>
        <p className="text-[13px] leading-[18px] text-muted">
          {t.rich("closeNote", {
            time: minutesToHHMM(DEFAULT_END_TARGET_MIN),
            t: (chunks) => <span className="font-mono text-fg">{chunks}</span>,
          })}
        </p>
      </div>
    </OnboardingFrame>
  );
}
