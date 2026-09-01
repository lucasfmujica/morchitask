"use client";

import { useState } from "react";
import { Repeat, Trash2 } from "lucide-react";
import {
  useCreateRoutine,
  useDeleteRoutine,
  useRoutines,
  useRoutineStreaks,
  useUpdateRoutine,
} from "@/lib/queries/routines";
import { useChannels } from "@/lib/queries/channels";
import { formatMinutes } from "@/lib/format";
import { todayISO } from "@/lib/date";
import { currentStreak, recentOccurrences } from "@/lib/streaks";
import { cn } from "@/lib/utils";
import type { Channel, RecurringTemplate } from "@/lib/queries/types";
import { EmptyState } from "@/components/ui";
import { useTranslations } from "next-intl";

/** Monday..Sunday. The letters come from the `week` catalog, the same ones the
 *  week view's rail shows — one list, so the two can't drift. */
const WEEKDAYS = [
  { n: 1, key: "mon" },
  { n: 2, key: "tue" },
  { n: 3, key: "wed" },
  { n: 4, key: "thu" },
  { n: 5, key: "fri" },
  { n: 6, key: "sat" },
  { n: 7, key: "sun" },
] as const;
const ESTIMATES = [15, 30, 45, 60, 90];

export function RoutinesView() {
  const t = useTranslations("routines");
  const routinesQ = useRoutines();
  const channelsQ = useChannels();
  const streaksQ = useRoutineStreaks();
  const create = useCreateRoutine();
  const [title, setTitle] = useState("");

  function add() {
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, freq: "daily" });
    setTitle("");
  }

  const routines = routinesQ.data ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Repeat className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-soft">
        <Repeat className="ml-1 h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newPlaceholder")}
          aria-label={t("newLabel")}
          className="h-8 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={add}
          disabled={!title.trim()}
          className="h-8 shrink-0 cursor-pointer rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {t("add")}
        </button>
      </div>

      {routines.length === 0 ? (
        <EmptyState icon={Repeat} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {routines.map((r) => (
            <RoutineRow
              key={r.id}
              routine={r}
              channels={channelsQ.data ?? []}
              completed={streaksQ.data?.get(r.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutineRow({
  routine,
  channels,
  completed,
}: {
  routine: RecurringTemplate;
  channels: Channel[];
  completed?: Set<string>;
}) {
  const t = useTranslations("routines");
  const tt = useTranslations("tasks");
  const tw = useTranslations("week");
  const update = useUpdateRoutine();
  const remove = useDeleteRoutine();
  const patch = (p: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: routine.id, patch: p });

  const weekly = routine.freq === "weekly";
  const days = routine.weekdays ?? [];

  const done = completed ?? new Set<string>();
  const today = todayISO();
  const streak = currentStreak(routine.freq, routine.weekdays, done, today);
  const history = recentOccurrences(routine.freq, routine.weekdays, done, today, 14);

  function toggleDay(n: number) {
    const next = days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort();
    patch({ weekdays: next });
  }

  function cycleEstimate() {
    const cur = routine.time_estimate_min;
    const idx = cur ? ESTIMATES.indexOf(cur) : -1;
    const next =
      idx === -1 ? ESTIMATES[0] : idx >= ESTIMATES.length - 1 ? null : ESTIMATES[idx + 1];
    patch({ time_estimate_min: next });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft",
        routine.paused && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <input
          defaultValue={routine.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== routine.title) patch({ title: v });
          }}
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-fg outline-none"
          aria-label={t("titleLabel")}
        />
        {streak > 0 && (
          <span
            title={t("streak", { n: streak })}
            className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning tabular-nums"
          >
            🔥 {streak}
          </span>
        )}
        <button
          onClick={cycleEstimate}
          className={cn(
            "shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
            routine.time_estimate_min
              ? "bg-surface-2 text-muted hover:bg-border"
              : "text-subtle hover:text-muted",
          )}
        >
          {routine.time_estimate_min ? formatMinutes(routine.time_estimate_min) : tt("addTime")}
        </button>
        <button
          onClick={() => remove.mutate(routine.id)}
          aria-label={t("delete")}
          className="shrink-0 cursor-pointer text-muted transition-colors hover:text-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Seg
          options={[
            { value: "daily", label: t("freqDaily") },
            { value: "weekly", label: t("freqWeekly") },
          ]}
          value={routine.freq}
          onChange={(v) => patch({ freq: v })}
        />

        {weekly && (
          <div className="flex gap-1">
            {WEEKDAYS.map((d) => (
              <button
                key={d.n}
                onClick={() => toggleDay(d.n)}
                aria-pressed={days.includes(d.n)}
                className={cn(
                  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-colors",
                  days.includes(d.n)
                    ? "bg-primary text-on-primary"
                    : "bg-surface-2 text-muted hover:bg-border",
                )}
              >
                {tw(`weekdayInitials.${d.key}`)}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => patch({ paused: !routine.paused })}
          className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2"
        >
          {routine.paused ? t("resume") : t("pause")}
        </button>
      </div>

      {completed !== undefined && history.length > 0 && (
        <div
          className="flex flex-wrap gap-1"
          role="img"
          aria-label={t("history", {
            n: history.length,
            done: history.filter((c) => c.done).length,
          })}
        >
          {history.map((c) => (
            <span
              key={c.date}
              title={c.date}
              className={cn(
                "h-3.5 w-3.5 rounded-[4px]",
                c.done ? "bg-success" : "bg-surface-2 ring-1 ring-inset ring-border",
              )}
            />
          ))}
        </div>
      )}

      {channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!routine.channel_id}
            label={tt("noCategory")}
            onClick={() => patch({ channel_id: null })}
          />
          {channels.map((c) => (
            <Chip
              key={c.id}
              active={routine.channel_id === c.id}
              label={c.name}
              color={c.color}
              onClick={() => patch({ channel_id: c.id })}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "cursor-pointer rounded-pill px-2.5 py-0.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-primary-soft text-primary"
          : "border-border text-muted hover:bg-surface-2",
      )}
    >
      {color && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      )}
      {label}
    </button>
  );
}
