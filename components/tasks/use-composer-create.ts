"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/queries/profiles";
import { taskKeys, useCreateTask, useMoveTaskToDate } from "@/lib/queries/tasks";
import { useCreateBlockOnDay } from "@/lib/queries/task-blocks";
import { syncBlockCalendar } from "@/lib/queries/calendar";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useToast } from "@/lib/stores/toast";
import { orderForAppend } from "@/lib/ordering";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_TIMEZONE, addDays, blockInstant, todayISO } from "@/lib/date";
import { useDateLabels } from "@/lib/use-date-labels";
import type { Task } from "@/lib/queries/types";
import { minutesToHHMM } from "@/components/day/use-agenda-scheduling";
import type { ComposerSubmit } from "./task-composer";

/** Which phrase "va para …" uses — the catalog turns it into words. */
function dayKind(day: string | null, today: string): "today" | "tomorrow" | "backlog" | "day" {
  if (day === null) return "backlog";
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  return "day";
}

/**
 * What the composer's Enter does, shared by the Day view and the backlog.
 *
 * `viewDate` is where a task lands when the text names no day (null = backlog).
 * A parsed day wins; a parsed time with no day means today in the backlog. A
 * parsed time also schedules a block on that day, as long as the estimate (or
 * 30m). A task that lands somewhere this view doesn't show says so in a toast
 * with Deshacer instead of opening its detail into thin air.
 */
export function useComposerCreate(viewDate: string | null) {
  const qc = useQueryClient();
  const create = useCreateTask();
  const createBlock = useCreateBlockOnDay();
  const move = useMoveTaskToDate();
  const openDetail = useTaskDetail((s) => s.open);
  const toast = useToast();
  const connected = !!useMe().data?.google_calendar_connected;
  const t = useTranslations("tasks");
  const locale = useLocale();
  const labels = useDateLabels();

  return function add(input: ComposerSubmit, viewTasks: Task[]) {
    const today = todayISO();
    const target = input.plannedDate ?? (input.time ? (viewDate ?? today) : viewDate);
    const elsewhere = target !== viewDate;
    const targetOrders = elsewhere
      ? (qc.getQueryData<Task[]>(target ? taskKeys.date(target) : taskKeys.backlog) ?? []).map(
          (t) => t.sort_order,
        )
      : viewTasks.map((t) => t.sort_order);

    create.mutate(
      {
        title: input.title,
        plannedDate: target,
        channelId: input.channelId,
        timeEstimateMin: input.timeEstimateMin,
        priority: input.priority,
        sortOrder: orderForAppend(targetOrders),
      },
      {
        onSuccess: (task) => {
          if (input.time && target) {
            const [h, m] = input.time.split(":").map(Number);
            const startMin = h * 60 + m;
            createBlock.mutate(
              {
                date: target,
                taskId: task.id,
                startISO: blockInstant(target, input.time, DEFAULT_TIMEZONE),
                endISO: blockInstant(
                  target,
                  minutesToHHMM(startMin + (input.timeEstimateMin ?? 30)),
                  DEFAULT_TIMEZONE,
                ),
              },
              {
                onSuccess: (block) => {
                  if (connected) {
                    syncBlockCalendar({ action: "upsert", blockId: block.id }).catch(() => {});
                  }
                },
              },
            );
          }

          if (!elsewhere) {
            // Open the new task's detail right away so you can add notes,
            // subtasks, or complete it without hunting for the card.
            openDetail(task);
            return;
          }
          const day = target ? labels.fullDayLabel(target) : "";
          toast(
            t("quickAddGoesTo", {
              title: task.title,
              kind: dayKind(target, today),
              // Mid-sentence in Spanish ("va para el viernes…"); English keeps
              // its capitalized weekday.
              day: locale === "es" ? day.toLowerCase() : day,
            }),
            {
              label: t("undo"),
              // Back to where it would have gone without the date — moving also
              // drops the block it got from "18hs".
              run: () =>
                move.mutate({
                  task,
                  toDate: viewDate,
                  sortOrder: orderForAppend(viewTasks.map((t) => t.sort_order)),
                }),
            },
          );
        },
      },
    );
  };
}
