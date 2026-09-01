import { getTranslations } from "next-intl/server";
import { capacityState, DEFAULT_CAPACITY_MIN } from "@/lib/capacity";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The product, rendered on the marketing page.
 *
 * These are not screenshots. They are the real screens rebuilt out of the same
 * semantic tokens, the same type scale and the same capacity maths the app
 * uses, so that a landing crop cannot quietly drift away from what /today
 * actually looks like the way an exported PNG does. It also means the frames
 * are responsive, theme-aware and weigh nothing.
 *
 * Two rules hold everything together:
 *
 * - **The chrome text comes from the app's own catalog** (`day`, `plan`,
 *   `week`, `shutdown`). A frame that says "Capacidad del día" says it because
 *   the day view says it. These are server components, so those namespaces are
 *   rendered to HTML and never handed to the client provider — the landing
 *   still ships only `PUBLIC_NAMESPACES`, which `e2e/marketing.spec.ts` asserts.
 * - **The numbers come from `lib/capacity` and `lib/format`.** The overflow in
 *   the fold is a real `capacityState(405, 360)`: 45 minutes over a six hour
 *   day, split at the budget and hatched past it, exactly as the app draws it.
 */

/** The day the frames depict: 6h 45m planned against a 6h budget. */
const CAPACITY_MIN = DEFAULT_CAPACITY_MIN;
const CHESS_MIN = 180;
const FEEDBACK_MIN = 180;
const REVIEW_MIN = 45;
const PLANNED_MIN = CHESS_MIN + FEEDBACK_MIN + REVIEW_MIN;

/** Clock strings are data, not language: one place, so no literal lands in JSX. */
const CLOCK = {
  endAt: "18:00",
  now: "16:47",
  eventRange: "13:30–14:30",
  finish: "00:15",
  overnight: "(+1d)",
  blockRange: "17:30–20:30",
} as const;

/**
 * A recreated screen. Borders and elevation are a Week card's, deliberately:
 * a landing frame that floats on a shadow the product never uses reads as a
 * mockup of the app rather than the app.
 */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Category dots and task stripes, mapped onto semantic tokens. */
const CATEGORY = {
  work: { dot: "bg-primary", stripe: "bg-primary" },
  home: { dot: "bg-accent", stripe: "bg-accent" },
  personal: { dot: "bg-warning", stripe: "bg-warning" },
} as const;

type CategoryKey = keyof typeof CATEGORY;

/**
 * The capacity bar. Under budget it is one fill; over, it splits at the target
 * and the overrun is hatched OUTSIDE the budget, so you can see how much too
 * much it is. Same geometry as `components/day/capacity-bar.tsx`, minus the
 * animation, which would need a client bundle for a bar that never changes.
 */
function CapacityMeter({
  plannedMin,
  targetMin,
  height = "h-2",
}: {
  plannedMin: number;
  targetMin: number;
  height?: string;
}) {
  const { pct, over } = capacityState(plannedMin, targetMin);
  const targetPct = over ? (targetMin / plannedMin) * 100 : 100;

  return (
    <div className={cn("relative rounded-pill bg-surface-2", height)}>
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-pill bg-primary",
          over && "rounded-r-none",
        )}
        style={{ width: `${over ? targetPct : pct}%` }}
      />
      {over && (
        <>
          <div
            className="absolute inset-y-0 rounded-r-pill"
            style={{
              left: `${targetPct}%`,
              width: `${100 - targetPct}%`,
              background:
                "repeating-linear-gradient(115deg, var(--danger) 0 4px, color-mix(in srgb, var(--danger) 55%, var(--surface)) 4px 8px)",
            }}
          />
          <span
            className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-fg/55"
            style={{ left: `${targetPct}%` }}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

function TaskRow({
  title,
  estimateMin,
  category,
  categoryLabel,
  done = false,
}: {
  title: string;
  estimateMin: number;
  category: CategoryKey;
  categoryLabel?: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-card border border-border bg-surface py-2.5 pr-3 pl-0 shadow-soft">
      <span className={cn("h-9 w-[3px] shrink-0 rounded-r-pill", CATEGORY[category].stripe)} />
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full border-2",
          done ? "border-success bg-success" : "border-border-strong",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-base font-medium",
            done ? "text-muted line-through" : "text-fg",
          )}
        >
          {title}
        </p>
        {categoryLabel && (
          <p className="mt-0.5 truncate text-2xs text-subtle">
            {"#"}
            {categoryLabel}
          </p>
        )}
      </div>
      <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
        {formatMinutes(estimateMin)}
      </span>
    </div>
  );
}

/* ============================================================
   1 — HOY. The fold. Capacity, over budget, with the way out.
   ============================================================ */

export async function TodayFrame() {
  const [t, td, tt, tm] = await Promise.all([
    getTranslations("common"),
    getTranslations("day"),
    getTranslations("tasks"),
    getTranslations("marketing"),
  ]);

  const { overByMin } = capacityState(PLANNED_MIN, CAPACITY_MIN);
  const gaps = [
    { at: "08:00", min: 330 },
    { at: "14:30", min: 180 },
    { at: "20:30", min: 30 },
  ];

  return (
    <Frame>
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tracking-tight text-fg">{t("today")}</p>
          <p className="mt-0.5 truncate text-sm text-muted">{tm("frameDate")}</p>
        </div>
        <p className="shrink-0 text-2xs font-semibold text-subtle">
          {td("doneOfTotal", { done: 0, total: 3 })}
        </p>
      </div>

      {/* The capacity band, over budget. The one gesture this page gets. */}
      <div
        className="border-y px-5 py-3"
        style={{
          borderColor: "color-mix(in srgb, var(--danger) 28%, transparent)",
          background: "color-mix(in srgb, var(--danger) 5%, var(--surface))",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">{td("capacity")}</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
            <span className="tabular-nums">
              {formatMinutes(PLANNED_MIN)} {"/"} {formatMinutes(CAPACITY_MIN)}
            </span>
            <span className="inline-flex items-center rounded-pill bg-danger/12 px-1.5 py-0.5 text-2xs font-bold tabular-nums">
              {"+"}
              {formatMinutes(overByMin)}
            </span>
          </span>
        </div>

        <div className="mt-2">
          <CapacityMeter plannedMin={PLANNED_MIN} targetMin={CAPACITY_MIN} />
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs leading-[17px] text-fg">
            {td("overBy", { over: formatMinutes(overByMin) })}{" "}
            {td.rich("overMoveSuggestion", {
              title: tm("frameTaskChess"),
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
          </p>
          <span className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg">
            {td("moveAmount", { time: formatMinutes(CHESS_MIN) })}
          </span>
        </div>
      </div>

      <div className="grid gap-5 px-5 pt-4 pb-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div>
          <div className="rounded-card border border-border bg-surface px-4 py-3 text-base text-subtle shadow-soft">
            {tt("addPlaceholder")}
          </div>

          <p className="mt-4 mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">
            {td("fromCalendar")}
          </p>
          <div className="flex items-center gap-2.5 rounded-card border border-border bg-surface-2/60 px-3 py-2">
            <span className="h-6 w-[3px] shrink-0 rounded-pill bg-accent" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm text-fg">{tm("frameEventSync")}</p>
            <span className="shrink-0 text-2xs tabular-nums text-muted">{CLOCK.eventRange}</span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <TaskRow
              title={tm("frameTaskChess")}
              estimateMin={CHESS_MIN}
              category="personal"
              categoryLabel={tm("frameCatPersonal")}
            />
            <TaskRow
              title={tm("frameTaskFeedback")}
              estimateMin={FEEDBACK_MIN}
              category="work"
              categoryLabel={tm("frameCatWork")}
            />
            <TaskRow
              title={tm("frameTaskReview")}
              estimateMin={REVIEW_MIN}
              category="work"
              categoryLabel={tm("frameCatWork")}
            />
          </div>

          <p className="mt-3 rounded-card border border-dashed border-border px-4 py-2.5 text-sm text-muted">
            {td("unscheduledCount", { n: 2 })}
          </p>
        </div>

        {/* The agenda's head: where the day would end, and what is still free. */}
        <div className="flex flex-col gap-3">
          <p className="text-2xs font-semibold tracking-wide text-subtle uppercase">
            {td("agendaHint")}
          </p>

          <div className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2.5 shadow-soft">
            <span className="text-sm text-muted">{td("endAt")}</span>
            <span className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-semibold tabular-nums text-fg">
              {CLOCK.endAt}
            </span>
            <span className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary">
              {td("autoSchedule")}
            </span>
          </div>

          <div className="rounded-card border border-border bg-surface px-3 py-3 shadow-soft">
            <p className="text-2xs font-semibold tracking-wide text-subtle uppercase">
              {td("openings")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {gaps.map((gap) => (
                <span
                  key={gap.at}
                  className="rounded-pill bg-primary-soft px-2.5 py-1 text-2xs font-semibold tabular-nums text-primary"
                >
                  {gap.at} {"·"} {formatMinutes(gap.min)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
   2 — PLANIFICAR. The morning: intention, estimates, the cost.
   ============================================================ */

export async function PlanFrame() {
  const [tp, tm] = await Promise.all([getTranslations("plan"), getTranslations("marketing")]);
  const { overByMin } = capacityState(PLANNED_MIN, CAPACITY_MIN);

  const split = [
    { key: "personal", min: CHESS_MIN, label: tm("frameCatPersonal") },
    { key: "work", min: FEEDBACK_MIN, label: tm("frameCatWork") },
    { key: "home", min: REVIEW_MIN, label: tm("frameCatHome") },
  ] as const;

  return (
    <Frame>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xl font-extrabold tracking-tight text-fg">{tp("title")}</p>
          <p className="mt-0.5 text-sm text-muted">{tm("frameDate")}</p>

          <p className="mt-5 text-sm font-semibold text-fg">{tp("focusHeading")}</p>
          <div className="mt-2 rounded-card border border-border bg-surface px-4 py-3.5 text-base text-subtle shadow-soft">
            {tp("intentionPlaceholder")}
          </div>

          <p className="mt-5 text-sm font-semibold text-fg">{tp("dayHeading", { n: 3 })}</p>
          <div className="mt-2 flex flex-col gap-2">
            <TaskRow title={tm("frameTaskChess")} estimateMin={CHESS_MIN} category="personal" />
            <TaskRow title={tm("frameTaskFeedback")} estimateMin={FEEDBACK_MIN} category="work" />
            <TaskRow title={tm("frameTaskReview")} estimateMin={REVIEW_MIN} category="work" />
          </div>
        </div>

        {/* The rail that prices the day before it starts. */}
        <div className="flex flex-col gap-3">
          <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-3xl font-extrabold tracking-tight whitespace-nowrap tabular-nums text-danger">
                {formatMinutes(PLANNED_MIN)}
              </span>
              <span className="rounded-pill bg-danger/12 px-2 py-0.5 text-2xs font-bold tabular-nums text-danger">
                {"+"}
                {formatMinutes(overByMin)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {tp("capacityOf", { target: formatMinutes(CAPACITY_MIN) })}
            </p>

            <div className="mt-3">
              <CapacityMeter plannedMin={PLANNED_MIN} targetMin={CAPACITY_MIN} />
            </div>

            <div className="mt-3 flex gap-1.5">
              {[-30, 30].map((delta) => (
                <span
                  key={delta}
                  className="rounded-lg bg-surface-2 px-2 py-1 text-2xs font-medium text-muted"
                >
                  {tp("capacityDelta", {
                    delta: `${delta > 0 ? "+" : "−"}${formatMinutes(Math.abs(delta))}`,
                  })}
                </span>
              ))}
            </div>

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{tp("statBooked")}</dt>
                <dd className="font-semibold tabular-nums text-fg">{formatMinutes(180)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{tp("statLoose")}</dt>
                <dd className="font-semibold tabular-nums text-fg">{formatMinutes(225)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{tp("statFinish")}</dt>
                <dd className="font-semibold tabular-nums text-accent">
                  {CLOCK.finish} {CLOCK.overnight}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
            <p className="text-xs font-semibold text-fg">{tp("categoryHeading")}</p>
            <div className="mt-2.5 flex h-2 overflow-hidden rounded-pill">
              {split.map((s) => (
                <span
                  key={s.key}
                  className={CATEGORY[s.key].dot}
                  style={{ width: `${(s.min / PLANNED_MIN) * 100}%` }}
                />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {split.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-2xs">
                  <span className={cn("h-1.5 w-1.5 rounded-full", CATEGORY[s.key].dot)} />
                  <span className="text-muted">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums text-fg">
                    {formatMinutes(s.min)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <span className="rounded-card bg-primary px-4 py-3 text-center text-base font-semibold text-on-primary">
            {tp("start")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
   3 — AGENDA. The day: a task dropped on an hour, and what spills.
   ============================================================ */

const AGENDA_START_H = 8;
const AGENDA_END_H = 18;
const HOUR_PX = 34;
const toY = (hour: number) => (hour - AGENDA_START_H) * HOUR_PX;

export async function AgendaFrame() {
  const [td, tm] = await Promise.all([getTranslations("day"), getTranslations("marketing")]);
  const hours = Array.from({ length: AGENDA_END_H - AGENDA_START_H }, (_, i) => AGENDA_START_H + i);

  return (
    <Frame>
      <div className="flex items-center gap-4 border-b border-border px-5 py-3">
        <span className="flex items-center gap-1.5 text-2xs font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary-soft ring-1 ring-primary/40" />
          {td("legendPlanned")}
        </span>
        <span className="flex items-center gap-1.5 text-2xs font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-soft ring-1 ring-accent/40" />
          {"Google"}
        </span>
        <span className="ml-auto text-2xs font-semibold tabular-nums text-accent">
          {td("nowAt", { time: CLOCK.now })}
        </span>
      </div>

      <div className="relative px-5 py-4">
        <div className="relative" style={{ height: `${toY(AGENDA_END_H)}px` }}>
          {/* Hour rules and gutter. */}
          {hours.map((h) => (
            <div
              key={h}
              className="absolute right-0 left-0 flex items-start gap-3"
              style={{ top: `${toY(h)}px` }}
            >
              <span className="w-10 shrink-0 -translate-y-1.5 text-right text-2xs tabular-nums text-subtle">
                {String(h).padStart(2, "0")}
                {":00"}
              </span>
              <span className="mt-0 h-px flex-1 bg-border" aria-hidden />
            </div>
          ))}

          {/* The long free gap, waiting for something to be dropped into it. */}
          <div
            className="absolute right-0 left-[3.25rem] flex items-center justify-center rounded-card border border-dashed border-primary/45 bg-primary-soft px-3"
            style={{ top: `${toY(8)}px`, height: `${toY(13.5) - toY(8)}px` }}
          >
            <p className="text-center text-xs font-medium text-primary">
              {td("gapHint", { length: formatMinutes(330) })}
            </p>
          </div>

          {/* A calendar event, in the app's soft peach. */}
          <div
            className="absolute right-0 left-[3.25rem] overflow-hidden rounded-card border-l-[3px] border-accent bg-accent-soft px-3 py-1.5"
            style={{ top: `${toY(13.5)}px`, height: `${toY(14.5) - toY(13.5)}px` }}
          >
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                {tm("frameEventSync")}
              </p>
              <p className="shrink-0 text-2xs tabular-nums text-muted">{CLOCK.eventRange}</p>
            </div>
          </div>

          {/* A planned block, in the app's soft mint. */}
          <div
            className="absolute right-0 left-[3.25rem] overflow-hidden rounded-card border-l-[3px] border-primary bg-primary-soft px-3 py-1"
            style={{ top: `${toY(15)}px`, height: `${toY(16) - toY(15)}px` }}
          >
            <p className="truncate text-2xs font-semibold text-fg">{tm("frameTaskReview")}</p>
          </div>

          {/* Now. */}
          <div
            className="absolute right-0 left-[3.25rem] flex items-center"
            style={{ top: `${toY(16.783)}px` }}
          >
            <span className="h-2 w-2 -translate-x-1 rounded-full bg-accent" aria-hidden />
            <span className="h-px flex-1 bg-accent" aria-hidden />
          </div>

          {/* The block that does not fit: it runs off the bottom of the day. */}
          <div
            className="absolute right-0 left-[3.25rem] overflow-hidden rounded-card border-l-[3px] px-3 py-1.5"
            style={{
              top: `${toY(17.5)}px`,
              height: `${toY(20.5) - toY(17.5)}px`,
              borderColor: "var(--danger)",
              background: "color-mix(in srgb, var(--danger) 9%, var(--surface))",
            }}
          >
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                {tm("frameTaskFeedback")}
              </p>
              <p className="shrink-0 text-2xs tabular-nums text-muted">{CLOCK.blockRange}</p>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
   4 — CERRAR EL DÍA. The night: where each leftover goes.
   ============================================================ */

export async function ShutdownFrame() {
  const [t, ts, tm] = await Promise.all([
    getTranslations("common"),
    getTranslations("shutdown"),
    getTranslations("marketing"),
  ]);

  const leftovers = [
    { title: tm("frameTaskFeedback"), min: FEEDBACK_MIN },
    { title: tm("frameTaskReview"), min: REVIEW_MIN },
  ];
  const tomorrowMin = FEEDBACK_MIN + REVIEW_MIN;

  return (
    <Frame>
      <div className="p-5">
        <p className="text-xl font-extrabold tracking-tight text-fg">{ts("title")}</p>
        <p className="mt-0.5 text-sm text-muted">{tm("frameDate")}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1 flex-1 rounded-pill bg-primary" aria-hidden />
            ))}
          </div>
          <span className="shrink-0 text-2xs font-semibold tracking-wide text-subtle uppercase">
            {ts("stepOf", { step: 3, total: 3, name: ts("stepTomorrow") })}
          </span>
        </div>

        <p className="mt-6 text-lg font-extrabold tracking-tight text-fg">
          {ts("tomorrowHeading")}
        </p>
        <p className="mt-1 text-sm text-muted">{ts("pendingCount", { n: 2 })}</p>

        <div className="mt-4 flex flex-col gap-2">
          {leftovers.map((task) => (
            <div
              key={task.title}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-2.5 shadow-soft"
            >
              <p className="min-w-0 flex-1 truncate text-base text-fg">{task.title}</p>
              <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                {formatMinutes(task.min)}
              </span>
              <span className="shrink-0 rounded-pill bg-primary-soft px-2.5 py-1 text-2xs font-semibold text-primary">
                {t("tomorrow")}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 rounded-card border border-border bg-surface-2/50 px-4 py-3 text-sm text-muted">
          {ts.rich("wouldWeigh", {
            day: t("tomorrow"),
            planned: formatMinutes(tomorrowMin),
            capacity: formatMinutes(CAPACITY_MIN),
            b: (chunks) => <span className="font-semibold text-fg">{chunks}</span>,
          })}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted">{ts("back")}</span>
          <span className="rounded-card bg-primary px-5 py-2.5 text-base font-semibold text-on-primary">
            {ts("title")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
   5 — SEMANA. Five days, and how much of each is already spoken for.
   ============================================================ */

type WeekDay = {
  key: string;
  label: string;
  plannedMin: number;
  closed?: boolean;
  today?: boolean;
  tasks: { title: string; min: number; category: CategoryKey; done?: boolean }[];
  priority?: "high" | "medium" | "low";
};

export async function WeekStrip() {
  const [t, tw, tt, tm] = await Promise.all([
    getTranslations("common"),
    getTranslations("week"),
    getTranslations("tasks"),
    getTranslations("marketing"),
  ]);

  const days: WeekDay[] = [
    {
      key: "yesterday",
      label: t("yesterday"),
      plannedMin: 300,
      closed: true,
      priority: "high",
      tasks: [
        { title: tm("frameTaskReview"), min: 240, category: "work", done: true },
        { title: tm("frameTaskLaundry"), min: 60, category: "home", done: true },
      ],
    },
    {
      key: "today",
      label: t("today"),
      plannedMin: 180,
      today: true,
      priority: "high",
      tasks: [{ title: tm("frameTaskFeedback"), min: FEEDBACK_MIN, category: "work" }],
    },
    {
      key: "tomorrow",
      label: t("tomorrow"),
      plannedMin: 105,
      priority: "medium",
      tasks: [
        { title: tm("frameTaskLaundry"), min: 45, category: "home" },
        { title: tm("frameTaskFurniture"), min: 60, category: "home" },
      ],
    },
    { key: "thu", label: tm("frameDayThu"), plannedMin: 0, tasks: [] },
    { key: "fri", label: tm("frameDayFri"), plannedMin: 0, tasks: [] },
  ];

  const priorityLabel = {
    high: tt("priorityHigh"),
    medium: tt("priorityMedium"),
    low: tt("priorityLow"),
  };

  return (
    <div className="flex flex-col gap-3 md:snap-x md:snap-proximity md:flex-row md:overflow-x-auto md:overscroll-x-contain md:pb-4 md:[scrollbar-width:none] lg:grid lg:grid-cols-5 lg:overflow-x-visible lg:pb-0 md:[&::-webkit-scrollbar]:hidden">
      {days.map((day) => {
        const { pct, over } = capacityState(day.plannedMin, CAPACITY_MIN);
        const empty = day.plannedMin === 0;

        return (
          <div
            key={day.key}
            className={cn(
              "flex flex-col rounded-card border bg-surface p-3.5",
              "md:w-[19rem] md:shrink-0 md:snap-start lg:w-auto lg:min-w-0 lg:shrink",
              day.today ? "border-primary/50 shadow-card" : "border-border shadow-soft",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={cn(
                  "text-base font-bold tracking-tight",
                  day.today ? "text-primary" : "text-fg",
                )}
              >
                {day.label}
              </p>
              {day.tasks.length > 0 && (
                <p className="text-2xs font-semibold tabular-nums text-subtle">
                  {day.tasks.filter((task) => task.done).length}
                  {"/"}
                  {day.tasks.length}
                </p>
              )}
            </div>

            <div className="mt-2.5 h-1.5 rounded-pill bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-pill",
                  day.closed ? "bg-success" : over ? "bg-danger" : "bg-primary",
                )}
                style={{ width: `${day.closed ? 100 : pct}%` }}
              />
            </div>
            <p
              className={cn(
                "mt-1.5 text-2xs font-semibold",
                day.closed ? "text-success" : "text-muted",
              )}
            >
              {day.closed
                ? tw("closed", { time: formatMinutes(day.plannedMin) })
                : empty
                  ? tw("noLoad")
                  : tw("loadOf", {
                      planned: formatMinutes(day.plannedMin),
                      capacity: formatMinutes(CAPACITY_MIN),
                    })}
            </p>

            <p className="mt-3 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-2xs text-subtle">
              {tw("addTaskPlaceholder")}
            </p>

            {empty ? (
              <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border px-3 py-6 text-center">
                <p className="text-2xs font-semibold text-muted">{tw("freeDay")}</p>
                <p className="text-2xs text-subtle">
                  {tw("freeDayHint", {
                    day: day.label,
                    capacity: formatMinutes(CAPACITY_MIN),
                  })}
                </p>
                <span className="mt-1 rounded-pill bg-primary-soft px-2.5 py-1 text-2xs font-semibold text-primary">
                  {tw("fromBacklog")}
                </span>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {day.priority && (
                  <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-subtle uppercase">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        day.priority === "high"
                          ? "bg-accent"
                          : day.priority === "medium"
                            ? "bg-warning"
                            : "bg-subtle",
                      )}
                      aria-hidden
                    />
                    {priorityLabel[day.priority]}
                  </p>
                )}
                {day.tasks.map((task) => (
                  <TaskRow
                    key={task.title}
                    title={task.title}
                    estimateMin={task.min}
                    category={task.category}
                    done={task.done}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
