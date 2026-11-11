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
import { Button, EmptyState } from "@/components/ui";
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
    <div className="flex max-w-5xl flex-col gap-4">
      <header className="flex flex-col gap-0.5 px-2 pt-3">
        <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="max-w-[560px] text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="flex items-center gap-2 rounded-pill bg-surface p-1.5 pl-5 shadow-soft">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newPlaceholder")}
          aria-label={t("newLabel")}
          className="h-10 w-full min-w-0 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <Button onClick={add} disabled={!title.trim()} className="shrink-0 px-[18px]">
          {t("add")}
        </Button>
      </div>

      {routines.length === 0 ? (
        <EmptyState icon={Repeat} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] items-start gap-4">
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
  const monthly = routine.freq === "monthly";
  const days = routine.weekdays ?? [];
  const every = routine.repeat_every ?? 1;
  const monthDay = routine.month_day ?? Number(routine.active_from.slice(8, 10));

  const done = completed ?? new Set<string>();
  const today = todayISO();
  const streak = currentStreak(routine, done, today);
  const history = recentOccurrences(routine, done, today, 14);

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

  const channel = channels.find((c) => c.id === routine.channel_id);
  const active = !routine.paused;

  return (
    // Each routine sits in its own well: the grey tray is what tells one routine
    // from the next now that the cards have no border.
    <li
      className={cn(
        "rounded-2xl bg-surface-2 p-2 transition-opacity",
        routine.paused && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-3.5 rounded-xl bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-2.5">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-[2px]", !channel && "bg-border-strong")}
            style={channel ? { backgroundColor: channel.color } : undefined}
            aria-hidden
          />
          <input
            defaultValue={routine.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== routine.title) patch({ title: v });
            }}
            className="min-w-0 flex-1 bg-transparent font-display text-base font-semibold text-fg outline-none"
            aria-label={t("titleLabel")}
          />
          <span className="shrink-0 text-xs text-muted">
            {active ? t("statusActive") : t("statusPaused")}
          </span>
          {/* Pause used to be a text button down among the settings; a switch
              in the corner says the state and changes it in one place. */}
          <button
            role="switch"
            aria-checked={active}
            aria-label={t("switchLabel", { title: routine.title })}
            title={active ? t("pause") : t("resume")}
            onClick={() => patch({ paused: !routine.paused })}
            className={cn(
              "h-[26px] w-11 shrink-0 cursor-pointer rounded-pill p-[3px] transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none",
              active ? "bg-fit" : "bg-border",
            )}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-pill bg-surface shadow-soft transition-transform duration-300",
                active && "translate-x-[18px]",
              )}
            />
          </button>
        </div>

        <Seg
          options={[
            { value: "daily", label: t("freqDaily") },
            { value: "weekly", label: t("freqWeekly") },
            { value: "monthly", label: t("freqMonthly") },
          ]}
          value={routine.freq}
          onChange={(v) => patch({ freq: v })}
        />

        {weekly && (
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.n}
                onClick={() => toggleDay(d.n)}
                aria-pressed={days.includes(d.n)}
                aria-label={t(`weekdayNames.${d.key}`)}
                className={cn(
                  "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-pill text-xs font-bold transition-colors duration-200",
                  days.includes(d.n)
                    ? "bg-primary text-on-primary"
                    : "bg-bg text-fg hover:bg-border",
                )}
              >
                {tw(`weekdayInitials.${d.key}`)}
              </button>
            ))}
          </div>
        )}

        {monthly && (
          <p className="text-[13px] text-muted">
            {t.rich("monthDayRule", {
              last: String(monthDay === 31),
              day: () => (
                <select
                  value={monthDay}
                  onChange={(e) => patch({ month_day: Number(e.target.value) })}
                  aria-label={t("monthDayLabel")}
                  className="mx-0.5 h-7 cursor-pointer appearance-none field-sizing-content rounded-md bg-bg px-2 text-center font-mono text-xs font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 31 ? t("monthDayLast") : n}
                    </option>
                  ))}
                </select>
              ),
            })}
            {monthDay >= 29 && monthDay < 31 && (
              <span className="text-subtle"> {t("monthDayShortMonths")}</span>
            )}
          </p>
        )}

        {routine.freq === "daily" && every === 1 && (
          <p className="text-[13px] text-muted">{t("dailyHint")}</p>
        )}

        {completed !== undefined && history.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
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
                      "h-2.5 w-2.5 rounded-[3px] transition-colors sm:h-3 sm:w-3 sm:rounded-[4px]",
                      c.done ? "bg-fit" : "bg-border",
                    )}
                  />
                ))}
              </div>
              <span
                className={cn(
                  "ml-auto shrink-0 text-xs font-semibold tabular-nums",
                  streak > 0 ? "text-primary" : "text-muted",
                )}
              >
                {streak > 0 ? t("streak", { n: streak }) : t("noStreak")}
              </span>
            </div>
            <span className="text-[11px] text-muted" aria-hidden>
              {t("history", { n: history.length, done: history.filter((c) => c.done).length })}
            </span>
          </div>
        )}

        {/* What the canvas leaves out but a routine still needs: the "every N"
            interval, the estimate its tasks inherit, the category and delete.
            One quiet row at the foot, below what you read at a glance. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <EveryStepper
            value={every}
            freq={routine.freq}
            onChange={(n) => patch({ repeat_every: n })}
          />
          <button
            onClick={cycleEstimate}
            aria-label={tt("estimate")}
            className={cn(
              "h-7 shrink-0 cursor-pointer rounded-pill px-2.5 font-mono text-[11px] transition-colors",
              routine.time_estimate_min
                ? "bg-bg text-muted hover:bg-border"
                : "text-subtle hover:bg-bg hover:text-muted",
            )}
          >
            {routine.time_estimate_min ? formatMinutes(routine.time_estimate_min) : tt("addTime")}
          </button>
          {channels.length > 0 && (
            <select
              value={routine.channel_id ?? ""}
              onChange={(e) => patch({ channel_id: e.target.value || null })}
              aria-label={tt("category")}
              className="h-7 max-w-36 min-w-0 cursor-pointer truncate field-sizing-content rounded-pill bg-bg px-2.5 text-xs font-medium text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">{tt("noCategory")}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => remove.mutate(routine.id)}
            aria-label={t("delete")}
            className="ml-auto flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

/** "cada [−] 2 [+] semanas" — 1 reads as the plain frequency. */
function EveryStepper({
  value,
  freq,
  onChange,
}: {
  value: number;
  freq: string;
  onChange: (n: number) => void;
}) {
  const t = useTranslations("routines");
  const btn =
    "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-sm text-muted transition-colors hover:bg-border hover:text-fg disabled:cursor-default disabled:opacity-30";
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      {t("everyPrefix")}
      <button
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={t("everyLess")}
        className={btn}
      >
        −
      </button>
      <span className="min-w-4 text-center font-semibold text-fg tabular-nums">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={value >= 52}
        aria-label={t("everyMore")}
        className={btn}
      >
        +
      </button>
      {t("everyUnit", { freq, n: value })}
    </div>
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
    <div className="flex gap-0.5 rounded-pill bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "h-8 flex-1 cursor-pointer rounded-pill px-3 text-xs font-semibold transition-colors duration-200",
            value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
