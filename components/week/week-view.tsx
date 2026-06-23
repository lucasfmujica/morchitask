"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { tasksForDateQueryOptions, useCreateTask } from "@/lib/queries/tasks";
import { subtasksForDateQueryOptions } from "@/lib/queries/subtasks";
import { useChannels } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import type { Subtask, Task } from "@/lib/queries/types";
import { addDays, todayISO, weekDayHeading, weekRange, weekRangeLabel } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/tasks/task-card";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

const NO_SUBTASKS = new Map<string, Subtask[]>();

export function WeekView({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();
  const week = useMemo(() => weekRange(date, 1), [date]);
  const thisWeek = week.includes(today);

  // On phones the week is a horizontal swipe; land on "today" instead of Monday.
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!thisWeek) return;
    const el = todayRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ inline: "start", block: "nearest" }));
  }, [thisWeek, date]);

  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const subResults = useQueries({ queries: week.map((d) => subtasksForDateQueryOptions(d)) });
  const channelsQ = useChannels();
  const profilesQ = useProfiles();
  const create = useCreateTask();

  const channelsById = useMemo(
    () => new Map((channelsQ.data ?? []).map((c) => [c.id, c])),
    [channelsQ.data],
  );
  const profilesById = useMemo(
    () => new Map((profilesQ.data ?? []).map((p) => [p.id, p])),
    [profilesQ.data],
  );

  return (
    <div className="flex flex-col gap-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Semana</h1>
          <p className="text-sm text-muted">{weekRangeLabel(week)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => router.push(`/week/${addDays(week[0], -7)}`)}
            aria-label="Semana anterior"
            className={arrow}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/week/${today}`)}
            disabled={thisWeek}
            className={cn(
              "h-9 cursor-pointer rounded-lg px-2.5 text-sm font-medium transition-colors",
              thisWeek ? "cursor-default text-subtle" : "text-primary hover:bg-primary-soft",
            )}
          >
            Esta semana
          </button>
          <button
            onClick={() => router.push(`/week/${addDays(week[0], 7)}`)}
            aria-label="Semana siguiente"
            className={arrow}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Wide day columns, horizontally swipeable (Sunsama-style). */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto overscroll-x-contain scroll-pl-4 px-4 pb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:-mx-8 md:scroll-pl-8 md:px-8 [&::-webkit-scrollbar]:hidden">
        {week.map((d, i) => {
          const tasks = (results[i].data ?? []) as Task[];
          const subsMap = (subResults[i].data ?? NO_SUBTASKS) as Map<string, Subtask[]>;
          const done = tasks.filter((t) => t.status === "done").length;
          const plannedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
          const isToday = d === today;
          return (
            <section
              key={d}
              ref={isToday ? todayRef : undefined}
              className="flex w-[86vw] shrink-0 snap-start flex-col gap-2 sm:w-[320px]"
            >
              <Link href={isToday ? "/today" : `/day/${d}`} className="group mb-1 block">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "text-[15px] font-bold tracking-tight transition-colors group-hover:text-primary",
                      isToday ? "text-primary" : "text-fg",
                    )}
                  >
                    {weekDayHeading(d, today)}
                  </span>
                  {tasks.length > 0 && (
                    <span className="shrink-0 text-[11px] font-medium text-subtle">
                      {done}/{tasks.length}
                      {plannedMin > 0 ? ` · ${formatMinutes(plannedMin)}` : ""}
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex flex-1 flex-col gap-2">
                {tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                    owner={profilesById.get(t.owner_id)}
                    subtasks={subsMap.get(t.id) ?? []}
                  />
                ))}
              </div>

              <QuickAdd
                onAdd={(title) =>
                  create.mutate({
                    title,
                    plannedDate: d,
                    channelId: null,
                    timeEstimateMin: null,
                    sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
                  })
                }
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");

  function submit() {
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle("");
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 transition-colors focus-within:border-primary/60">
      <button
        onClick={submit}
        disabled={!title.trim()}
        aria-label="Agregar tarea a este día"
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-subtle transition-colors hover:text-primary disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Agregar tarea…"
        aria-label="Nueva tarea"
        className="h-6 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
      />
    </div>
  );
}
