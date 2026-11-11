"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Pause, Play, Plus, Trash2, UserPlus, X } from "lucide-react";
import { CHANNEL_COLORS, useChannels, useCreateChannel } from "@/lib/queries/channels";
import { useObjectives } from "@/lib/queries/objectives";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import {
  backlogQueryOptions,
  taskKeys,
  tasksForDateQueryOptions,
  useDeleteTask,
  useMoveTaskToDate,
  useUpdateTask,
} from "@/lib/queries/tasks";
import {
  useCreateSubtask,
  useDeleteSubtask,
  useSubtasks,
  useToggleSubtask,
  useUpdateSubtask,
} from "@/lib/queries/subtasks";
import { useAttachments } from "@/lib/queries/attachments";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { orderForAppend } from "@/lib/ordering";
import {
  NO_PRIORITY_LABEL_KEY,
  PRIORITY_DOT,
  PRIORITY_LABEL_KEY,
  TASK_PRIORITIES,
} from "@/lib/priority";
import { DEFAULT_TIMEZONE, addDays, blockInstant, timeInTimeZone, todayISO } from "@/lib/date";
import {
  REMINDER_OFFSETS,
  offsetFromRemindAt,
  remindAtFromBlock,
  reminderOffsetLabelKey,
} from "@/lib/reminders";
import { TimePicker } from "@/components/ui/time-picker";
import {
  formatClock,
  formatMinutes,
  formatDuration,
  parseDuration,
  TIME_ESTIMATES,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Profile, Subtask, Task } from "@/lib/queries/types";
import { ChecklistAiSuggest } from "./checklist-ai-suggest";
import { TaskAttachments } from "./task-attachments";
import { TaskCheckbox } from "./task-checkbox";
import { OwnerAvatar } from "./owner-avatar";
import { TaskReactions } from "./task-reactions";
import { TaskComments } from "./task-comments";
import { TaskTimeBreakdown } from "./task-time-breakdown";
import { useTaskTimer } from "./use-task-timer";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/**
 * The sheet is opened with a snapshot of the task, but edits go to the React
 * Query cache. Read the live row from that cache (same key the list view uses)
 * so toggling category/share/estimate reflects instantly. Falls back to the
 * snapshot when the list isn't cached.
 */
function useLiveTask(snapshot: Task): Task {
  const options = snapshot.planned_date
    ? tasksForDateQueryOptions(snapshot.planned_date)
    : backlogQueryOptions();
  const { data } = useQuery<Task[]>({
    // The two option sets have differently-shaped tuple keys; widen so the union
    // is accepted (the actual key value is still correct per branch).
    queryKey: options.queryKey as readonly unknown[],
    queryFn: options.queryFn,
    enabled: false,
  });
  return data?.find((t) => t.id === snapshot.id) ?? snapshot;
}

export function TaskDetailSheet() {
  const tt = useTranslations("tasks");
  const openTask = useTaskDetail((s) => s.openTask);
  const close = useTaskDetail((s) => s.close);

  return (
    <AnimatePresence>
      {openTask && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            className="fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-bg pb-safe shadow-pop md:inset-y-2 md:right-2 md:left-auto md:max-h-none md:w-[460px] md:rounded-2xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label={tt("detailTitle")}
          >
            <TaskDetailContent key={openTask.id} task={openTask} onClose={close} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TaskDetailContent({ task: snapshot, onClose }: { task: Task; onClose: () => void }) {
  const tc = useTranslations("common");
  const tch = useTranslations("channels");
  const tcm = useTranslations("common");
  const tt = useTranslations("tasks");
  const labels = useDateLabels();
  // Live row from the cache so chips/toggles reflect edits instantly.
  const task = useLiveTask(snapshot);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const move = useMoveTaskToDate();
  const qc = useQueryClient();
  const reopen = useTaskDetail((s) => s.open);
  const channelsQ = useChannels();
  const createChannel = useCreateChannel();
  const objectivesQ = useObjectives();
  const profiles = useProfiles().data ?? [];
  const me = useMe().data;
  const partner = profiles.find((p) => p.id !== me?.id);
  const subtasksQ = useSubtasks(task.id);
  const createSub = useCreateSubtask(task.id);
  const toggleSub = useToggleSubtask(task.id);
  const deleteSub = useDeleteSubtask(task.id);
  const updateSub = useUpdateSubtask(task.id);
  const attachmentCount = useAttachments(task.id).data?.length ?? 0;
  const timer = useTaskTimer(task);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [newSub, setNewSub] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannel, setNewChannel] = useState("");
  const [editingReal, setEditingReal] = useState(false);
  const [realInput, setRealInput] = useState("");

  const subtasks = subtasksQ.data ?? [];
  const channels = channelsQ.data ?? [];

  async function addChannel() {
    const name = newChannel.trim();
    if (!name) {
      setAddingChannel(false);
      setNewChannel("");
      return;
    }
    const created = await createChannel.mutateAsync({
      name,
      color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length],
    });
    // Assign the freshly-created category to this task right away.
    update.mutate({ task, patch: { channel_id: created.id } });
    setNewChannel("");
    setAddingChannel(false);
  }

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  /** Reschedule the task to another day (clears its time-blocks, like a drag).
   *  Refreshes the open snapshot so the sheet keeps editing the right day. */
  function reschedule(toDate: string) {
    if (toDate === task.planned_date) return;
    const list = qc.getQueryData<Task[]>(taskKeys.date(toDate)) ?? [];
    const sortOrder = orderForAppend(list.filter((t) => t.id !== task.id).map((t) => t.sort_order));
    move.mutate({ task, toDate, sortOrder });
    reopen({ ...task, planned_date: toDate, block_start: null, block_end: null });
  }

  function saveTitle() {
    const t = title.trim();
    if (t && t !== task.title) update.mutate({ task, patch: { title: t } });
    else if (!t) setTitle(task.title);
  }
  function saveNotes() {
    if (notes !== (task.notes ?? "")) update.mutate({ task, patch: { notes: notes || null } });
  }
  function addSub() {
    const t = newSub.trim();
    if (!t) return;
    createSub.mutate({ title: t, sortOrder: orderForAppend(subtasks.map((s) => s.sort_order)) });
    setNewSub("");
  }
  function startEditReal() {
    setRealInput(task.actual_time_min ? formatDuration(task.actual_time_min * 60) : "");
    setEditingReal(true);
  }
  function saveReal() {
    setEditingReal(false);
    const next = parseDuration(realInput); // minutes, or null to clear
    const cur = task.actual_time_min ?? null;
    if (next !== cur) update.mutate({ task, patch: { actual_time_min: next } });
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {/* Grab handle on the phone, where the sheet rises from the bottom. */}
      <span className="mx-auto -mb-1 h-1 w-10 rounded-pill bg-border md:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-2 px-2 pt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={tt("titleLabel")}
          className="min-w-0 flex-1 bg-transparent font-display text-xl font-bold tracking-tight text-fg outline-none"
        />
        <button
          onClick={onClose}
          aria-label={tc("close")}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface text-muted shadow-soft transition-colors hover:text-fg"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Every "where and when" setting lives in one white card, one row per
          setting split by hairlines, instead of a stack of separate boxes. */}
      <div className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4 shadow-soft">
        {/* Assign */}
        {profiles.length > 1 && (
          <Field label={tt("owner")}>
            <div className="flex flex-wrap gap-1.5">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => update.mutate({ task, patch: { owner_id: p.id } })}
                  aria-pressed={task.owner_id === p.id}
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors",
                    task.owner_id === p.id
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-2 text-muted hover:bg-border",
                  )}
                >
                  <OwnerAvatar profile={p} size={16} />
                  {p.id === me?.id ? tt("you") : p.display_name}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Share */}
        {partner && (
          <Field label={tt("share")}>
            <button
              onClick={() => update.mutate({ task, patch: { shared: !task.shared } })}
              aria-pressed={task.shared}
              className="flex cursor-pointer items-center gap-2.5 text-sm"
            >
              <span
                className={cn(
                  "relative h-[22px] w-10 shrink-0 rounded-pill transition-colors duration-300",
                  task.shared ? "bg-fit" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-on-scrim shadow-card transition-transform duration-300 ease-out",
                    task.shared && "translate-x-[18px]",
                  )}
                />
              </span>
              <span className="text-fg">
                {task.shared ? `${partner.display_name} también la ve` : tt("privateNote")}
              </span>
            </button>
          </Field>
        )}

        {/* Scheduled day — move the task to another day without dragging */}
        <Field label={tt("scheduledFor")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              active={task.planned_date === today}
              label={tcm("today")}
              onClick={() => reschedule(today)}
            />
            <Chip
              active={task.planned_date === tomorrow}
              label={tcm("tomorrow")}
              onClick={() => reschedule(tomorrow)}
            />
            <DateChip
              label={
                task.planned_date && task.planned_date !== today && task.planned_date !== tomorrow
                  ? labels.dueLabel(task.planned_date, today)
                  : tt("otherDay")
              }
              active={
                !!task.planned_date && task.planned_date !== today && task.planned_date !== tomorrow
              }
              value={task.planned_date ?? today}
              onChange={reschedule}
            />
          </div>
        </Field>

        {/* Due date — a deadline, independent of the day it's planned for */}
        <Field label={tt("dueLabel")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              active={!task.due_date}
              label={tt("noDate")}
              onClick={() => update.mutate({ task, patch: { due_date: null } })}
            />
            <Chip
              active={task.due_date === today}
              label={tcm("today")}
              onClick={() => update.mutate({ task, patch: { due_date: today } })}
            />
            <Chip
              active={task.due_date === tomorrow}
              label={tcm("tomorrow")}
              onClick={() => update.mutate({ task, patch: { due_date: tomorrow } })}
            />
            <DateChip
              label={
                task.due_date && task.due_date !== today && task.due_date !== tomorrow
                  ? labels.dueLabel(task.due_date, today)
                  : tt("otherDate")
              }
              active={!!task.due_date && task.due_date !== today && task.due_date !== tomorrow}
              value={task.due_date ?? today}
              onChange={(d) => update.mutate({ task, patch: { due_date: d } })}
            />
          </div>
        </Field>

        {/* Channel */}
        <Field label={tt("category")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              active={!task.channel_id}
              label={tt("noCategory")}
              onClick={() => update.mutate({ task, patch: { channel_id: null } })}
            />
            {channels.map((c) => (
              <Chip
                key={c.id}
                active={task.channel_id === c.id}
                label={c.name}
                color={c.color}
                onClick={() => update.mutate({ task, patch: { channel_id: c.id } })}
              />
            ))}

            {/* Create a new category right here */}
            {addingChannel ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-pill bg-primary-soft px-3 py-1.5 ring-1 ring-primary ring-inset">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length],
                  }}
                  aria-hidden
                />
                <input
                  autoFocus
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  onBlur={addChannel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addChannel();
                    if (e.key === "Escape") {
                      setNewChannel("");
                      setAddingChannel(false);
                    }
                  }}
                  placeholder={tt("categoryNamePlaceholder")}
                  aria-label={tch("newLabel")}
                  className="w-24 bg-transparent text-xs font-medium text-primary placeholder:text-primary/50 outline-none"
                />
              </span>
            ) : (
              <button
                onClick={() => setAddingChannel(true)}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-pill border border-dashed border-border-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {tcm("new")}
              </button>
            )}
          </div>
        </Field>

        {/* Priority — drives where the task sits in the Day and Week lists. */}
        <Field label={tt("priority")}>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={!task.priority}
              label={tt(NO_PRIORITY_LABEL_KEY)}
              onClick={() => update.mutate({ task, patch: { priority: null } })}
            />
            {TASK_PRIORITIES.map((p) => (
              <Chip
                key={p}
                active={task.priority === p}
                label={tt(PRIORITY_LABEL_KEY[p])}
                color={PRIORITY_DOT[p]}
                onClick={() => update.mutate({ task, patch: { priority: p } })}
              />
            ))}
          </div>
        </Field>

        {/* Estimate */}
        <Field label={tt("estimate2")}>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={!task.time_estimate_min}
              label={tt("none")}
              onClick={() => update.mutate({ task, patch: { time_estimate_min: null } })}
            />
            {TIME_ESTIMATES.map((m) => (
              <Chip
                key={m}
                active={task.time_estimate_min === m}
                label={formatMinutes(m)}
                onClick={() => update.mutate({ task, patch: { time_estimate_min: m } })}
              />
            ))}
          </div>
        </Field>

        {/* Reminder */}
        <Field label={tt("reminder")}>
          <ReminderControl task={task} update={update} />
        </Field>

        {/* Objective */}
        {(objectivesQ.data ?? []).length > 0 && (
          <Field label={tt("goal")}>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={!task.objective_id}
                label={tt("none")}
                onClick={() => update.mutate({ task, patch: { objective_id: null } })}
              />
              {(objectivesQ.data ?? []).map((o) => (
                <Chip
                  key={o.id}
                  active={task.objective_id === o.id}
                  label={o.title}
                  onClick={() => update.mutate({ task, patch: { objective_id: o.id } })}
                />
              ))}
            </div>
          </Field>
        )}
      </div>

      {/* Time tracking */}
      <Section label={tt("time")}>
        {/* The one dark card in the sheet: time is the live thing here, so it
            gets the hero treatment (and flips with the theme like the others). */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-fg px-4 py-3.5 text-bg">
          <div className="flex items-baseline gap-6">
            <div className="flex flex-col">
              <span className="text-2xs font-semibold uppercase tracking-wide text-bg/60">
                {tt("actualTime")}
              </span>
              {timer.running ? (
                <span className="flex items-center gap-1.5 font-display text-xl font-bold tabular-nums">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-fit" aria-hidden />
                  {formatClock(timer.liveSeconds)}
                </span>
              ) : editingReal ? (
                <input
                  autoFocus
                  value={realInput}
                  onChange={(e) => setRealInput(e.target.value)}
                  onBlur={saveReal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingReal(false);
                  }}
                  placeholder={tt("timePlaceholder")}
                  aria-label={tt("realTime")}
                  className="w-24 border-b border-bg/50 bg-transparent font-display text-xl font-bold tabular-nums text-bg outline-none placeholder:text-base placeholder:font-normal placeholder:text-bg/50"
                />
              ) : (
                <button
                  onClick={startEditReal}
                  title={tt("logTimeManually")}
                  className="cursor-pointer text-left font-display text-xl font-bold tabular-nums text-bg underline decoration-bg/40 decoration-dotted decoration-from-font underline-offset-4 transition-opacity hover:opacity-80"
                >
                  {task.actual_time_min ? formatDuration(task.actual_time_min * 60) : "—"}
                </button>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-2xs font-semibold uppercase tracking-wide text-bg/60">
                {tt("estimatedTime")}
              </span>
              <span className="font-display text-xl font-bold tabular-nums text-bg/70">
                {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : "—"}
              </span>
            </div>
          </div>
          <button
            onClick={timer.toggle}
            aria-pressed={timer.running}
            className={cn(
              "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-pill px-4 text-sm font-semibold transition-colors",
              timer.running
                ? "bg-danger text-on-danger hover:opacity-90"
                : "bg-bg text-fg hover:bg-bg/85",
            )}
          >
            {timer.running ? (
              <>
                <Pause className="h-4 w-4" aria-hidden /> {tt("stop")}
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden /> {tt("startTimerShort")}
              </>
            )}
          </button>
        </div>
        <TaskTimeBreakdown task={task} liveSegments={timer.liveSegments} meId={me?.id} />
      </Section>

      {/* Description */}
      <Section label={tt("description")} card>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder={tt("descriptionPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-lg bg-transparent text-sm leading-relaxed text-fg placeholder:text-subtle outline-none"
        />
      </Section>

      {/* Checklist */}
      <Section
        card
        label={`Checklist${subtasks.length ? ` · ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ""}`}
      >
        <div className="flex flex-col gap-0.5">
          {subtasks.map((s) => (
            <ChecklistItemRow
              key={s.id}
              sub={s}
              profiles={profiles}
              meId={me?.id}
              onToggle={() => toggleSub.mutate(s)}
              onRename={(title) => updateSub.mutate({ id: s.id, title })}
              onAssign={(assignee_id) => updateSub.mutate({ id: s.id, assignee_id })}
              onDelete={() => deleteSub.mutate(s.id)}
            />
          ))}

          {/* Add item — clearly visible field with its own add button */}
          <div className="mt-1.5 flex items-center gap-2 rounded-pill bg-surface-2 py-1 pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-focus">
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
              placeholder={tt("checklistPlaceholder")}
              aria-label={tt("newChecklistItem")}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
            <button
              onClick={addSub}
              disabled={!newSub.trim()}
              aria-label={tt("addChecklistItem")}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fg text-bg transition-colors hover:bg-fg/85 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>

          <ChecklistAiSuggest task={task} notes={notes} subtasks={subtasks} />
        </div>
      </Section>

      {/* Files — photos, PDFs and documents that belong with the task */}
      <Section card label={`Archivos${attachmentCount ? ` · ${attachmentCount}` : ""}`}>
        <TaskAttachments taskId={task.id} />
      </Section>

      {/* Kudos — celebrate a finished shared task */}
      {partner && task.shared && task.status === "done" && (
        <Section card label={tt("reactions")}>
          <TaskReactions taskId={task.id} />
        </Section>
      )}

      {/* Comments — discussion on a shared task */}
      {partner && task.shared && (
        <Section card label={tt("comments")}>
          <TaskComments taskId={task.id} />
        </Section>
      )}

      <button
        onClick={() => {
          timer.cancel();
          remove.mutate(task);
          onClose();
        }}
        className="mt-1 mb-2 ml-1 flex h-9 w-fit cursor-pointer items-center gap-2 rounded-pill bg-surface px-4 text-sm font-semibold text-danger shadow-soft transition-colors hover:bg-danger/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {tt("deleteTask")}
      </button>
    </div>
  );
}

const TZ = DEFAULT_TIMEZONE;

function ReminderControl({
  task,
  update,
}: {
  task: Task;
  update: ReturnType<typeof useUpdateTask>;
}) {
  const tt = useTranslations("tasks");
  const hasBlock = !!task.block_start;
  const currentOffset = offsetFromRemindAt(task.block_start, task.remind_at);
  const customTime =
    task.remind_at && currentOffset === null ? timeInTimeZone(task.remind_at, TZ) : null;

  function setOffset(o: number) {
    if (!task.block_start) return;
    update.mutate({
      task,
      patch: { remind_at: remindAtFromBlock(task.block_start, o), reminder_sent_at: null },
    });
  }
  function clear() {
    update.mutate({ task, patch: { remind_at: null, reminder_sent_at: null } });
  }
  function setCustom(time: string) {
    if (!task.planned_date) return;
    update.mutate({
      task,
      patch: { remind_at: blockInstant(task.planned_date, time, TZ), reminder_sent_at: null },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!task.remind_at} label={tt("noReminder")} onClick={clear} />
        {REMINDER_OFFSETS.map((o) => (
          <Chip
            key={o}
            active={task.remind_at != null && currentOffset === o}
            label={tt(reminderOffsetLabelKey(o), { n: o })}
            disabled={!hasBlock}
            onClick={() => setOffset(o)}
          />
        ))}
      </div>
      {!hasBlock && <p className="text-xs text-subtle">{tt("reminderNeedsBlock")}</p>}
      {task.planned_date && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{tt("orAtATime")}</span>
          <TimePicker value={customTime} onChange={setCustom} placeholder={tt("pick")} />
        </div>
      )}
    </div>
  );
}

/** A chip that opens the native date picker. Styled like {@link Chip} so it
 *  sits inline with the quick tt("todayTomorrow") options.
 *
 *  We open the picker with `showPicker()` on click instead of relying on the
 *  browser to open it when a stretched, transparent date input is clicked — on
 *  desktop that only focuses the field (the calendar opens from the hidden
 *  native icon), so tt("otherDay") appeared to do nothing. */
function DateChip({
  label,
  value,
  active,
  onChange,
}: {
  label: string;
  value: string;
  active: boolean;
  onChange: (date: string) => void;
}) {
  const tt = useTranslations("tasks");
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    // showPicker() must be called from a user gesture; fall back to focus if the
    // browser rejects it (e.g. Safari before the ISO date is committed).
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }

  return (
    <button
      type="button"
      onClick={openPicker}
      aria-label={tt("pickDate")}
      className={cn(
        "relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted hover:bg-border",
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {label}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </button>
  );
}

/**
 * One checklist item: toggle done, rename inline (click the text), (re)assign to
 * a person via a small avatar menu, and delete. Rename/assign are optimistic in
 * the parent's mutation, so the row updates instantly.
 */
function ChecklistItemRow({
  sub,
  profiles,
  meId,
  onToggle,
  onRename,
  onAssign,
  onDelete,
}: {
  sub: Subtask;
  profiles: Profile[];
  meId?: string;
  onToggle: () => void;
  onRename: (title: string) => void;
  onAssign: (assigneeId: string | null) => void;
  onDelete: () => void;
}) {
  const tt = useTranslations("tasks");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sub.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const assignee = profiles.find((p) => p.id === sub.assignee_id);
  const canAssign = profiles.length > 1;

  function commit() {
    const t = draft.trim();
    if (t && t !== sub.title) onRename(t);
    else setDraft(sub.title);
    setEditing(false);
  }

  return (
    <div className="group -mx-1 flex items-start gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-2">
      <span className="mt-0.5">
        <TaskCheckbox checked={sub.done} onToggle={onToggle} size="sm" />
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(sub.title);
              setEditing(false);
            }
          }}
          aria-label={tt("editItem")}
          className="min-w-0 flex-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(sub.title);
            setEditing(true);
          }}
          title={tt("tapToEdit")}
          className={cn(
            "min-w-0 flex-1 cursor-text break-words text-left text-sm leading-snug",
            sub.done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {sub.title}
        </button>
      )}

      {/* Assignee — small avatar that opens a person picker */}
      {canAssign && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={assignee ? `Asignado a ${assignee.display_name}` : tt("assignTo")}
            title={assignee ? `Asignado a ${assignee.display_name}` : tt("assignTo")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-opacity",
              assignee
                ? "cursor-pointer"
                : "cursor-pointer text-subtle opacity-0 hover:text-muted group-hover:opacity-100 touch:opacity-100",
            )}
          >
            {assignee ? (
              <OwnerAvatar profile={assignee} size={20} />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden />
            )}
          </button>

          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-hidden
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl bg-surface p-1 shadow-pop">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onAssign(p.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                  >
                    <OwnerAvatar profile={p} size={18} />
                    <span className="min-w-0 flex-1 truncate">
                      {p.id === meId ? tt("you") : p.display_name}
                    </span>
                    {sub.assignee_id === p.id && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
                <button
                  onClick={() => {
                    onAssign(null);
                    setMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface-2"
                >
                  <span
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-dashed border-border"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{tt("unassigned")}</span>
                  {!sub.assignee_id && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={onDelete}
        aria-label={tt("deleteItem")}
        className="-m-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 touch:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** One row of the settings card: its label on top, the control under it. The
 *  hairline between rows comes from the parent's `divide-y`. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <p className="mb-2 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

/** A block of the sheet outside the settings card. With `card`, its content
 *  sits on a white card; without, it is laid straight on the sheet's paper
 *  (the time block brings its own dark card). */
function Section({
  label,
  card,
  children,
}: {
  label: string;
  card?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(card && "rounded-xl bg-surface p-4 shadow-soft")}>
      <p className={cn("mb-2 text-xs font-semibold text-muted", !card && "px-2")}>{label}</p>
      {children}
    </section>
  );
}

function Chip({
  active,
  label,
  color,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  color?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors",
        disabled ? "cursor-not-allowed bg-surface-2 text-subtle opacity-50" : "cursor-pointer",
        !disabled &&
          (active ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted hover:bg-border"),
      )}
    >
      {color && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      )}
      {label}
    </button>
  );
}
