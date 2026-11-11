"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Trash2 } from "lucide-react";
import {
  useCreateObjective,
  useDeleteObjective,
  useObjectiveProgress,
  useObjectives,
  useUpdateObjective,
} from "@/lib/queries/objectives";
import type { ObjectiveProgress } from "@/lib/queries/objectives";
import type { Objective, ObjectivePeriod } from "@/lib/queries/types";
import { addDays, addMonths, todayISO, weekRange } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import type { DateLabels } from "@/lib/date-labels";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/** Start/end calendar days for a period anchored on `today`. */
function periodRange(period: ObjectivePeriod, today: string) {
  if (period === "week") {
    const w = weekRange(today);
    return { start: w[0], end: w[6] };
  }
  const start = `${today.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

/** Takes `labels` rather than reaching for the hook: this sits outside the
 *  component, where hooks cannot run. */
function rangeLabel(o: Objective, labels: DateLabels) {
  return o.period === "month"
    ? labels.monthLabel(o.start_date)
    : labels.weekRangeLabel([o.start_date, o.end_date]);
}

export function ObjectivesView() {
  const labels = useDateLabels();
  const t = useTranslations("goals");
  const objectivesQ = useObjectives();
  const progressQ = useObjectiveProgress();
  const objectives = objectivesQ.data ?? [];
  const progress = progressQ.data ?? new Map();

  const week = objectives.filter((o) => o.period === "week");
  const month = objectives.filter((o) => o.period === "month");

  const today = todayISO();
  const thisWeek = periodRange("week", today);
  const thisMonth = periodRange("month", today);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <header className="flex flex-col gap-0.5 px-2 pt-3">
        <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <NewObjective />

      {/* Two wells side by side on desktop; stacked on the phone, where a
          second column would squeeze every title to a couple of words. */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Group
          title={t("thisWeek")}
          range={labels.weekRangeLabel([thisWeek.start, thisWeek.end])}
          current={thisWeek}
          objectives={week}
          progress={progress}
          emptyTitle={t("emptyWeek")}
          emptyHint={t("emptyWeekHint")}
        />
        <Group
          title={t("thisMonth")}
          range={labels.monthLabel(today)}
          current={thisMonth}
          objectives={month}
          progress={progress}
          emptyTitle={t("emptyMonth", { month: labels.monthLabel(today) })}
          emptyHint={
            week.length > 0 ? t("emptyMonthFromWeek", { n: week.length }) : t("emptyMonthHint")
          }
        />
      </div>
    </div>
  );
}

function NewObjective() {
  const t = useTranslations("goals");
  const create = useCreateObjective();
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState<ObjectivePeriod>("week");

  function add() {
    const value = title.trim();
    if (!value) return;
    const { start, end } = periodRange(period, todayISO());
    create.mutate({ title: value, period, start_date: start, end_date: end });
    setTitle("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-1.5 pl-5 shadow-soft sm:flex-row sm:items-center sm:rounded-pill">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={t("newPlaceholder")}
        aria-label={t("newLabel")}
        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 rounded-pill bg-surface-2 p-[3px]">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                "h-[34px] cursor-pointer rounded-pill px-3.5 text-xs font-semibold transition-colors",
                period === p ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
              )}
            >
              {p === "week" ? t("periodWeek") : t("periodMonth")}
            </button>
          ))}
        </div>
        <Button onClick={add} className="ml-auto shrink-0 px-[18px]">
          {t("add")}
        </Button>
      </div>
    </div>
  );
}

function Group({
  title,
  range,
  current,
  objectives,
  progress,
  emptyTitle,
  emptyHint,
}: {
  title: string;
  /** The period on show, under the heading ("9 al 15 de noviembre"). */
  range: string;
  current: { start: string; end: string };
  objectives: Objective[];
  progress: Map<string, ObjectiveProgress>;
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    // Same shape as <Well>, kept a <section> so the heading still scopes it.
    <section className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-2">
      <div className="flex flex-wrap items-baseline gap-x-2 px-3 pt-3 pb-1">
        <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
        <span className="text-xs text-muted">{range}</span>
      </div>
      {objectives.length === 0 ? (
        // A muted one-liner said "nothing here" and stopped. This says what a
        // goal for this period would be for.
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
          <p className="text-sm font-semibold text-fg">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{emptyHint}</p>
        </div>
      ) : (
        objectives.map((o) => (
          <ObjectiveRow
            key={o.id}
            objective={o}
            progress={progress.get(o.id)}
            current={o.start_date === current.start && o.end_date === current.end}
          />
        ))
      )}
    </section>
  );
}

function ObjectiveRow({
  objective,
  progress,
  current,
}: {
  objective: Objective;
  progress?: ObjectiveProgress;
  /** Inside the period the well's heading names; its own range would repeat it. */
  current: boolean;
}) {
  const labels = useDateLabels();
  const t = useTranslations("goals");
  const update = useUpdateObjective();
  const remove = useDeleteObjective();
  const done = objective.status === "done";
  const total = progress?.total ?? 0;
  const completed = progress?.done ?? 0;
  const actualMin = progress?.actualMin ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="group flex items-center gap-3 rounded-xl bg-surface p-3.5 shadow-soft sm:gap-3.5">
      <ProgressRing pct={done ? 100 : pct} label={done ? null : `${pct}%`} done={done} />

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", done ? "text-muted" : "text-fg")}>
          {objective.title}
        </p>

        {/* Tasks AND the hours they absorbed: the count alone made a goal you
            poured 6 hours into look identical to one you touched twice. */}
        <p className="mt-0.5 text-xs text-muted">
          {total > 0 ? t("taskProgress", { done: completed, total }) : t("noTasks")}
          {actualMin > 0 && t("contributed", { time: formatMinutes(actualMin) })}
          {/* The list keeps goals from earlier periods too; only those still
              need their own dates, the rest sit under the heading's. */}
          {!current && <span className="text-subtle"> · {rangeLabel(objective, labels)}</span>}
        </p>
      </div>

      <button
        onClick={() =>
          update.mutate({ id: objective.id, patch: { status: done ? "active" : "done" } })
        }
        aria-pressed={done}
        aria-label={done ? t("markActive") : t("markDone")}
        className={cn(
          "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-xs font-semibold transition-colors duration-200",
          done ? "bg-primary text-on-primary" : "bg-surface-2 text-fg hover:bg-border",
        )}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
        {/* On the phone the label would crowd the title out; the ring and the
            green pill already say which state it is in. */}
        <span className={cn(!done && "hidden sm:inline")}>
          {done ? t("achieved") : t("markDone")}
        </span>
        {!done && <Check className="h-3.5 w-3.5 text-subtle sm:hidden" aria-hidden />}
      </button>

      <button
        onClick={() => remove.mutate(objective.id)}
        aria-label={t("delete")}
        className="shrink-0 cursor-pointer text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

/** Small progress ring: a full green ring means the goal is met. Drawn with the
 *  theme tokens so it flips with dark mode like everything else. */
function ProgressRing({ pct, label, done }: { pct: number; label: string | null; done: boolean }) {
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r={RING_R}
          fill="none"
          strokeWidth="5"
          className="stroke-surface-2"
        />
        <motion.circle
          cx="22"
          cy="22"
          r={RING_R}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          stroke="var(--fit-from)"
          strokeDasharray={RING_C}
          initial={false}
          animate={{ strokeDashoffset: RING_C * (1 - Math.min(pct, 100) / 100) }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium tabular-nums text-fg">
        {done ? <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-hidden /> : label}
      </span>
    </div>
  );
}
