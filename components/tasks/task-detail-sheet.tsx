"use client";

import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, ChevronDown, Plus, Trash2, UserPlus } from "lucide-react";
import { CHANNEL_COLORS, useChannels, useCreateChannel } from "@/lib/queries/channels";
import { useObjectives } from "@/lib/queries/objectives";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import {
  backlogQueryOptions,
  taskKeys,
  tasksForDateQueryOptions,
  useDeleteTask,
  useMoveTaskToDate,
  useToggleTask,
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
import type { HouseholdMember, Subtask, Task } from "@/lib/queries/types";
import { ChecklistAiSuggest } from "./checklist-ai-suggest";
import { DueDateBadge } from "./due-date-badge";
import { TaskAttachments } from "./task-attachments";
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
  // The sheet only exists after a click, never in the server HTML, so reading
  // the viewport here can't cause a hydration mismatch. On a desktop it slides
  // in from the right edge it is pinned to; on a phone it rises from the bottom.
  const fromSide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  const offscreen = fromSide ? { opacity: 0, x: 40 } : { opacity: 0, y: 24 };

  return (
    <AnimatePresence>
      {openTask && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            onClick={close}
          />
          {/* A flex column so the header stays put and only the body scrolls:
              the close button must never scroll away on a long task. */}
          <motion.aside
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[28px] bg-bg pb-safe shadow-[0_20px_60px_rgb(var(--shadow-color)/0.25)] md:inset-y-4 md:right-4 md:left-auto md:max-h-none md:w-[520px] md:max-w-[calc(100%-2rem)] md:rounded-[28px] md:pb-0"
            initial={offscreen}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={offscreen}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
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

/** Which row of the settings card has its options open. One at a time, so
 *  the card never turns back into the wall of chips it replaced. */
type OpenRow = "due" | "category" | "priority" | "owner" | "reminder" | "goal" | "estimate";

function TaskDetailContent({ task: snapshot, onClose }: { task: Task; onClose: () => void }) {
  const tc = useTranslations("common");
  const tch = useTranslations("channels");
  const tcm = useTranslations("common");
  const tt = useTranslations("tasks");
  const labels = useDateLabels();
  // Live row from the cache so chips/toggles reflect edits instantly.
  const task = useLiveTask(snapshot);
  const update = useUpdateTask();
  const toggle = useToggleTask();
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
  const [openRow, setOpenRow] = useState<OpenRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const subtasks = subtasksQ.data ?? [];
  const channels = channelsQ.data ?? [];
  const objectives = objectivesQ.data ?? [];
  const done = task.status === "done";
  const doneSubs = subtasks.filter((s) => s.done).length;
  const channel = channels.find((c) => c.id === task.channel_id);
  // A task with no owner row loaded yet reads as mine, which is who created it.
  const owner =
    profiles.find((p) => p.id === task.owner_id) ?? profiles.find((p) => p.id === me?.id);
  const objective = objectives.find((o) => o.id === task.objective_id);

  const rowToggle = (row: OpenRow) => () => setOpenRow((cur) => (cur === row ? null : row));

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

  function toggleDone() {
    // Same as the card: finishing a task stops its stopwatch, or the time would
    // keep counting on something that's already done.
    if (timer.running) timer.stopTimer();
    toggle.mutate(task);
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

  // "Real" is your own time. On a shared task someone else owns, a hand edit
  // has no undated bucket of yours to land in (the server refuses it), so it
  // is read-only there and days are how you log time.
  const realByDayOnly = task.shared && !!me && task.owner_id !== me.id;

  // How far into the estimate the real time is. Clamped: past the estimate the
  // bar is simply full, the numbers beside it say by how much.
  const elapsedMin = timer.running ? timer.liveSeconds / 60 : (task.actual_time_min ?? 0);
  const progress = task.time_estimate_min
    ? Math.min(100, (elapsedMin / task.time_estimate_min) * 100)
    : 0;

  const reminderOffset = offsetFromRemindAt(task.block_start, task.remind_at);

  return (
    <>
      {/* Header: what this is, and the two ways out. Delete lives behind "more"
          so it's never one stray tap away from the title. */}
      <div className="shrink-0 px-3.5 pt-2 pb-1.5 md:pt-3.5">
        {/* Grab handle on the phone, where the sheet rises from the bottom. */}
        <span
          className="mx-auto mb-2 block h-1 w-10 rounded-pill bg-border md:hidden"
          aria-hidden
        />
        <div className="flex items-center gap-2">
          <span className="mr-auto pl-1.5 text-[11px] leading-normal font-semibold tracking-[0.06em] text-muted uppercase">
            {tt("detailTitle")}
          </span>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={tt("moreOptions")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-fg transition-colors hover:bg-border"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <circle cx="3.5" cy="8" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="12.5" cy="8" r="1.3" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1.5 w-48 rounded-lg bg-surface p-1 shadow-pop"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      timer.cancel();
                      remove.mutate(task);
                      onClose();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {tt("deleteTask")}
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={tc("close")}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-fg transition-colors hover:bg-border"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3.5 pt-1.5 pb-3.5">
        {/* Title, with the round check that finishes the task from here. */}
        <div className="flex items-start gap-3 px-1.5 py-1">
          <DoneCircle done={done} onToggle={toggleDone} />
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={tt("titleLabel")}
            // A textarea, not an input: a long title wraps like the heading it
            // is instead of scrolling sideways out of sight.
            className={cn(
              "field-sizing-content min-w-0 flex-1 resize-none bg-transparent font-display text-[26px] leading-[31px] font-bold tracking-[-0.015em] outline-none transition-colors",
              done ? "text-subtle line-through" : "text-fg",
            )}
          />
        </div>

        {/* Every "where and when" setting lives in one white card: label on the
            left, current value on the right, one row each. Tapping a value opens
            its options under the row, so the card stays a summary at rest. */}
        <div className="flex flex-col divide-y divide-surface-2 rounded-[22px] bg-surface px-4 py-1.5">
          {/* Scheduled day: the one setting changed often enough to stay inline */}
          <MetaRow label={tt("scheduledFor")}>
            <div className="flex flex-wrap gap-1">
              <Segment
                active={task.planned_date === today}
                label={tcm("today")}
                onClick={() => reschedule(today)}
              />
              <Segment
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
                  !!task.planned_date &&
                  task.planned_date !== today &&
                  task.planned_date !== tomorrow
                }
                value={task.planned_date ?? today}
                onChange={reschedule}
              />
            </div>
          </MetaRow>

          {/* Due date: a deadline, independent of the day it's planned for */}
          <MetaRow
            label={tt("dueLabel")}
            open={openRow === "due"}
            onToggle={rowToggle("due")}
            value={
              task.due_date ? (
                <DueDateBadge dueDate={task.due_date} className="px-2 py-0.5 text-2xs" />
              ) : (
                <Unset>{tt("noDate")}</Unset>
              )
            }
          >
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
                tone="chip"
              />
            </div>
          </MetaRow>

          {/* Category */}
          <MetaRow
            label={tt("category")}
            open={openRow === "category"}
            onToggle={rowToggle("category")}
            value={
              channel ? (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: channel.color }}
                    aria-hidden
                  />
                  <span className="truncate">{channel.name}</span>
                </>
              ) : (
                <Unset>{tt("noCategory")}</Unset>
              )
            }
          >
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
          </MetaRow>

          {/* Priority: drives where the task sits in the Day and Week lists. */}
          <MetaRow
            label={tt("priority")}
            open={openRow === "priority"}
            onToggle={rowToggle("priority")}
            value={
              task.priority ? (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PRIORITY_DOT[task.priority] }}
                    aria-hidden
                  />
                  {tt(PRIORITY_LABEL_KEY[task.priority])}
                </>
              ) : (
                <Unset>{tt(NO_PRIORITY_LABEL_KEY)}</Unset>
              )
            }
          >
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
          </MetaRow>

          {/* Owner: a picker only when there's someone to hand it to */}
          <MetaRow
            label={tt("owner")}
            open={openRow === "owner"}
            onToggle={profiles.length > 1 ? rowToggle("owner") : undefined}
            value={
              <>
                <OwnerAvatar profile={owner} size={24} />
                <span className="truncate">
                  {!owner || owner.id === me?.id ? tt("you") : owner.display_name}
                </span>
              </>
            }
          >
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
          </MetaRow>

          {/* Share: not in the canvas; it sits beside the owner because both
              answer "who is this for". A switch needs no options panel. */}
          {partner && (
            <MetaRow label={tt("share")}>
              <button
                onClick={() => update.mutate({ task, patch: { shared: !task.shared } })}
                aria-pressed={task.shared}
                className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left"
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
                <span className="truncate text-[13px] font-semibold text-fg">
                  {task.shared
                    ? tt("sharedWithPartner", { name: partner.display_name })
                    : tt("privateNote")}
                </span>
              </button>
            </MetaRow>
          )}

          {/* Reminder */}
          <MetaRow
            label={tt("reminder")}
            open={openRow === "reminder"}
            onToggle={rowToggle("reminder")}
            value={
              !task.remind_at ? (
                <Unset>{tt("noReminder")}</Unset>
              ) : reminderOffset !== null ? (
                tt(reminderOffsetLabelKey(reminderOffset), { n: reminderOffset })
              ) : (
                tt("reminderAtTime", { time: timeInTimeZone(task.remind_at, TZ) })
              )
            }
          >
            <ReminderControl task={task} update={update} />
          </MetaRow>

          {/* Goal: only once there's a goal to link to */}
          {objectives.length > 0 && (
            <MetaRow
              label={tt("goal")}
              open={openRow === "goal"}
              onToggle={rowToggle("goal")}
              value={
                objective ? (
                  <span className="truncate">{objective.title}</span>
                ) : (
                  <Unset>{tt("none")}</Unset>
                )
              }
            >
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  active={!task.objective_id}
                  label={tt("none")}
                  onClick={() => update.mutate({ task, patch: { objective_id: null } })}
                />
                {objectives.map((o) => (
                  <Chip
                    key={o.id}
                    active={task.objective_id === o.id}
                    label={o.title}
                    onClick={() => update.mutate({ task, patch: { objective_id: o.id } })}
                  />
                ))}
              </div>
            </MetaRow>
          )}
        </div>

        {/* Time tracking: the one dark card in the sheet. Time is the live thing
            here, so it gets the hero treatment (and flips with the theme). The
            estimate lives in it too, as the yardstick the bar measures against. */}
        <section className="flex flex-col gap-3 rounded-[22px] bg-fg p-4 text-surface">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <div className="mr-auto flex flex-col gap-0.5">
              <span className="text-2xs text-surface/65">
                {task.shared ? tt("yourRealTime") : tt("realTime")}
              </span>
              {timer.running ? (
                <span className="flex items-center gap-2 font-display text-[28px] leading-8 font-bold tabular-nums">
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-duration:1.2s]"
                    aria-hidden
                  />
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
                  className="h-8 w-28 border-b border-surface/50 bg-transparent font-display text-[28px] font-bold tabular-nums text-surface outline-none placeholder:text-base placeholder:font-normal placeholder:text-surface/50"
                />
              ) : realByDayOnly ? (
                // Someone else's shared task: there is nowhere to keep an
                // undated hand edit that is yours alone, so time goes in by
                // day, in the breakdown below.
                <span
                  title={tt("realTimeByDayOnly")}
                  className="font-display text-[28px] leading-8 font-bold tabular-nums text-surface"
                >
                  {formatMinutes(task.actual_time_min ?? 0)}
                </span>
              ) : (
                <button
                  onClick={startEditReal}
                  title={tt("logTimeManually")}
                  className="cursor-pointer text-left font-display text-[28px] leading-8 font-bold tabular-nums text-surface underline decoration-surface/30 decoration-dotted decoration-from-font underline-offset-4 transition-opacity hover:opacity-80"
                >
                  {formatMinutes(task.actual_time_min ?? 0)}
                </button>
              )}
            </div>
            <button
              onClick={rowToggle("estimate")}
              aria-expanded={openRow === "estimate"}
              title={tt("changeField", { field: tt("estimate2") })}
              className="cursor-pointer rounded-pill px-2 py-1 text-2xs text-surface/65 transition-colors hover:bg-surface/10 hover:text-surface"
            >
              {task.time_estimate_min
                ? tt("ofEstimate", { time: formatMinutes(task.time_estimate_min) })
                : tt("estimateTime")}
            </button>
            <button
              onClick={timer.toggle}
              aria-pressed={timer.running}
              className={cn(
                "inline-flex h-10 shrink-0 cursor-pointer items-center rounded-pill px-4 text-xs font-bold transition-opacity hover:opacity-90",
                // Start wears the brightened mint the bar below fills with.
                // Its ink is on-marker because that is the one dark ink that
                // stays dark in both themes, and this mint is light in both.
                timer.running
                  ? "bg-accent text-on-accent"
                  : "bg-linear-135 from-[color-mix(in_srgb,var(--color-fit-from)_70%,var(--color-surface))] to-[color-mix(in_srgb,var(--color-fit-from)_30%,var(--color-primary))] text-on-marker",
              )}
            >
              {timer.running ? tt("stop") : tt("startTimerShort")}
            </button>
          </div>

          {task.time_estimate_min ? (
            <div className="h-2 overflow-hidden rounded-pill bg-surface/8" aria-hidden>
              <div
                className="h-full rounded-pill bg-linear-to-r from-[color-mix(in_srgb,var(--color-fit-from)_70%,var(--color-surface))] to-[color-mix(in_srgb,var(--color-fit-from)_30%,var(--color-primary))] transition-[width] duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}

          {openRow === "estimate" && (
            <div className="flex flex-wrap gap-1.5">
              <DarkChip
                active={!task.time_estimate_min}
                label={tt("none")}
                onClick={() => update.mutate({ task, patch: { time_estimate_min: null } })}
              />
              {TIME_ESTIMATES.map((m) => (
                <DarkChip
                  key={m}
                  active={task.time_estimate_min === m}
                  label={formatMinutes(m)}
                  onClick={() => update.mutate({ task, patch: { time_estimate_min: m } })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Day by day: not in the canvas, kept right under the total it splits. */}
        <TaskTimeBreakdown
          task={task}
          liveSegments={timer.liveSegments}
          meId={me?.id}
          showEmpty={realByDayOnly}
        />

        {/* Description */}
        <Card>
          <label htmlFor={`notes-${task.id}`} className="font-display text-sm font-semibold">
            {tt("description")}
          </label>
          <textarea
            id={`notes-${task.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder={tt("descriptionPlaceholder")}
            rows={2}
            className="field-sizing-content min-h-[64px] w-full resize-none rounded-[14px] bg-bg p-3 text-sm leading-5 text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </Card>

        {/* Checklist */}
        <Card gap="gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="mr-auto font-display text-sm font-semibold">{tt("checklist")}</h2>
            {subtasks.length > 0 && (
              <span className="font-mono text-2xs text-muted">
                {tt("checklistProgress", { done: doneSubs, total: subtasks.length })}
              </span>
            )}
          </div>
          {subtasks.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
              <div
                className="h-full rounded-pill bg-linear-to-r from-fit-from to-primary transition-[width] duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{ width: `${(doneSubs / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          <div className="flex flex-col">
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
          </div>

          {/* Add item: a visible field with its own add button */}
          <div className="flex items-center gap-2 rounded-pill bg-bg py-1 pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-focus">
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
        </Card>

        {/* Files: photos, PDFs and documents that belong with the task */}
        <Card>
          <div className="flex items-center gap-2.5">
            <h2 className="mr-auto font-display text-sm font-semibold">{tt("files")}</h2>
            {attachmentCount > 0 && (
              <span className="font-mono text-2xs text-muted">{attachmentCount}</span>
            )}
          </div>
          <TaskAttachments taskId={task.id} />
        </Card>

        {/* Kudos: celebrate a finished shared task */}
        {partner && task.shared && task.status === "done" && (
          <Card>
            <h2 className="font-display text-sm font-semibold">{tt("reactions")}</h2>
            <TaskReactions taskId={task.id} />
          </Card>
        )}

        {/* Comments: discussion on a shared task */}
        {partner && task.shared && (
          <Card gap="gap-3">
            <h2 className="font-display text-sm font-semibold">{tt("comments")}</h2>
            <TaskComments taskId={task.id} />
          </Card>
        )}
      </div>
    </>
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

/** A chip that opens the native date picker, styled to sit inline with the
 *  quick today/tomorrow options next to it.
 *
 *  We open the picker with `showPicker()` on click instead of relying on the
 *  browser to open it when a stretched, transparent date input is clicked — on
 *  desktop that only focuses the field (the calendar opens from the hidden
 *  native icon), so "Otro día" appeared to do nothing. */
function DateChip({
  label,
  value,
  active,
  onChange,
  tone = "segment",
}: {
  label: string;
  value: string;
  active: boolean;
  onChange: (date: string) => void;
  /** "segment" sits in the scheduled-day control; "chip" among option chips. */
  tone?: "segment" | "chip";
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
        "relative inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 text-2xs font-semibold transition-colors duration-200",
        tone === "segment" ? SEGMENT_BASE : "min-h-8 py-1.5",
        tone === "segment"
          ? active
            ? SEGMENT_ON
            : SEGMENT_OFF
          : active
            ? "bg-primary-soft text-primary"
            : "bg-surface-2 text-muted hover:bg-border",
      )}
    >
      {tone === "chip" && <CalendarClock className="h-3.5 w-3.5" aria-hidden />}
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
  profiles: HouseholdMember[];
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
    <div className="group -mx-1.5 flex min-h-9 items-center gap-2.5 rounded-md px-1.5 transition-colors hover:bg-bg">
      <ItemCheck checked={sub.done} onToggle={onToggle} />

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
            "min-w-0 flex-1 cursor-text break-words text-left text-xs leading-snug transition-colors duration-200",
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
            aria-label={
              assignee ? tt("assignedTo", { name: assignee.display_name }) : tt("assignTo")
            }
            title={assignee ? tt("assignedTo", { name: assignee.display_name }) : tt("assignTo")}
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

/** One row of the settings card: the label in a fixed column on the left and
 *  the current value on the right. With `onToggle` the value is a button and
 *  `children` (its options) open under the row. The hairline between rows
 *  comes from the parent's `divide-y`. */
function MetaRow({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const tt = useTranslations("tasks");
  const id = useId();
  // Rows without a value prop put their control (segments, switch) inline.
  const inline = value === undefined;
  return (
    <div>
      <div className="flex min-h-[46px] items-center gap-2.5 py-1.5">
        <span id={`${id}-l`} className="w-24 shrink-0 text-2xs text-muted sm:w-[120px]">
          {label}
        </span>
        {inline ? (
          <div className="min-w-0 flex-1">{children}</div>
        ) : onToggle ? (
          <button
            onClick={onToggle}
            aria-expanded={!!open}
            // Named "Categoría Trabajo", not just "Trabajo": the label sits
            // outside the button.
            aria-labelledby={`${id}-l ${id}-v`}
            title={tt("changeField", { field: label })}
            className="group/row -my-1 -mr-2 flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-left text-xs leading-normal font-semibold text-fg"
          >
            <span id={`${id}-v`} className="flex min-w-0 items-center gap-2">
              {value}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-subtle transition-transform group-hover/row:text-fg",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs leading-normal font-semibold text-fg">
            {value}
          </div>
        )}
      </div>
      {!inline && open && <div className="pb-3 sm:pl-[130px]">{children}</div>}
    </div>
  );
}

/** The value of a row that has nothing set yet: quieter than a real value. */
function Unset({ children }: { children: React.ReactNode }) {
  return <span className="truncate font-medium text-muted">{children}</span>;
}

/** A white card on the sheet's paper, with its heading as the first child. */
function Card({ children, gap = "gap-2.5" }: { children: React.ReactNode; gap?: string }) {
  return (
    <section className={cn("flex flex-col rounded-[22px] bg-surface p-4", gap)}>{children}</section>
  );
}

/** The finish check beside the title: round and big, like the canvas, unlike
 *  the square checkbox of a checklist item. */
function DoneCircle({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const t = useTranslations("tasks");
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? t("markPending") : t("complete")}
      whileTap={{ scale: 0.85 }}
      className={cn(
        "mt-[3px] flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background,box-shadow] duration-[250ms]",
        done
          ? "bg-fit"
          : "shadow-[inset_0_0_0_2px_var(--color-border-strong)] hover:shadow-[inset_0_0_0_2px_var(--color-primary)]",
      )}
    >
      {done && <Tick size={13} className="animate-pop [animation-duration:400ms]" />}
    </motion.button>
  );
}

/** The canvas's white tick, shared by the finish circle and checklist boxes. */
function Tick({
  size,
  strokeWidth = 2.6,
  className,
}: {
  size: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--color-on-primary)"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

/** A checklist item's box: square-ish, 20px, unlike the round check of a
 *  task. The canvas keeps the two shapes apart so a step never reads as a
 *  task of its own. */
function ItemCheck({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const t = useTranslations("tasks");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={checked ? t("markPending") : t("complete")}
      className={cn(
        "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[6px] transition-[background,box-shadow] duration-200",
        checked
          ? "bg-fit"
          : "shadow-[inset_0_0_0_1.5px_var(--color-border-strong)] hover:shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
      )}
    >
      {checked && (
        <Tick size={10} strokeWidth={2.8} className="animate-pop [animation-duration:400ms]" />
      )}
    </button>
  );
}

const SEGMENT_BASE = "h-[30px]";
const SEGMENT_ON = "bg-fg text-surface";
const SEGMENT_OFF = "bg-surface-2 text-fg hover:bg-border";

/** One option of the scheduled-day control: ink when chosen, like the canvas. */
function Segment({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-pill px-3 text-2xs font-semibold transition-colors duration-200",
        SEGMENT_BASE,
        active ? SEGMENT_ON : SEGMENT_OFF,
      )}
    >
      {label}
    </button>
  );
}

/** {@link Chip} for the dark time card, where the paper colours would vanish. */
function DarkChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-surface text-fg" : "bg-surface/10 text-surface hover:bg-surface/20",
      )}
    >
      {label}
    </button>
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
