"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Target, Trash2 } from "lucide-react";
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Target className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
      </header>

      <NewObjective />

      <Group
        title={t("thisWeek")}
        objectives={week}
        progress={progress}
        emptyTitle={t("emptyWeek")}
        emptyHint={t("emptyWeekHint")}
      />
      <Group
        title={t("thisMonth")}
        objectives={month}
        progress={progress}
        emptyTitle={t("emptyMonth", { month: labels.monthLabel(todayISO()) })}
        emptyHint={
          week.length > 0 ? t("emptyMonthFromWeek", { n: week.length }) : t("emptyMonthHint")
        }
      />
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
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-soft sm:flex-row sm:items-center">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={t("newPlaceholder")}
        aria-label={t("newLabel")}
        className="min-w-0 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle outline-none"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                "cursor-pointer rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                period === p ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
              )}
            >
              {p === "week" ? t("periodWeek") : t("periodMonth")}
            </button>
          ))}
        </div>
        <button
          onClick={add}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("add")}
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  objectives,
  progress,
  emptyTitle,
  emptyHint,
}: {
  title: string;
  objectives: Objective[];
  progress: Map<string, ObjectiveProgress>;
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {objectives.length === 0 ? (
        // A muted one-liner said "nothing here" and stopped. This says what a
        // goal for this period would be for.
        <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center">
          <p className="text-sm font-semibold text-fg">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{emptyHint}</p>
        </div>
      ) : (
        objectives.map((o) => (
          <ObjectiveRow key={o.id} objective={o} progress={progress.get(o.id)} />
        ))
      )}
    </section>
  );
}

function ObjectiveRow({
  objective,
  progress,
}: {
  objective: Objective;
  progress?: ObjectiveProgress;
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
    <div className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <button
        onClick={() =>
          update.mutate({ id: objective.id, patch: { status: done ? "active" : "done" } })
        }
        aria-pressed={done}
        aria-label={done ? t("markActive") : t("markDone")}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-primary bg-primary text-on-primary"
            : "border-border text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-base font-bold",
              done ? "text-subtle line-through" : "text-fg",
            )}
          >
            {objective.title}
          </p>
          <span
            className={cn(
              "shrink-0 text-sm font-bold tabular-nums",
              done ? "text-success" : "text-fg",
            )}
          >
            {done ? t("achieved") : `${pct}%`}
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-2">
          <motion.div
            className={cn("h-full rounded-pill", done ? "bg-success" : "bg-primary")}
            initial={false}
            animate={{ width: `${done ? 100 : pct}%` }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          />
        </div>

        {/* Tasks AND the hours they absorbed: the count alone made a goal you
            poured 6 hours into look identical to one you touched twice. */}
        <p className="mt-2 text-xs text-muted">
          {total > 0 ? t("taskProgress", { done: completed, total }) : t("noTasks")}
          {actualMin > 0 && t("contributed", { time: formatMinutes(actualMin) })}
          <span className="text-subtle"> · {rangeLabel(objective, labels)}</span>
        </p>
      </div>

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
