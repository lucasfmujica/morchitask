"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Pause, Play, Plus, Trash2, X } from "lucide-react";
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
} from "@/lib/queries/subtasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { orderForAppend } from "@/lib/ordering";
import {
  DEFAULT_TIMEZONE,
  addDays,
  blockInstant,
  dueLabel,
  timeInTimeZone,
  todayISO,
} from "@/lib/date";
import {
  REMINDER_OFFSETS,
  offsetFromRemindAt,
  remindAtFromBlock,
  reminderOffsetLabel,
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
import type { Task } from "@/lib/queries/types";
import { TaskCheckbox } from "./task-checkbox";
import { OwnerAvatar } from "./owner-avatar";
import { TaskReactions } from "./task-reactions";
import { TaskComments } from "./task-comments";
import { useTaskTimer } from "./use-task-timer";

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
  const openTask = useTaskDetail((s) => s.openTask);
  const close = useTaskDetail((s) => s.close);

  return (
    <AnimatePresence>
      {openTask && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-gray-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-2xl border border-border bg-surface pb-safe shadow-card md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Detalle de tarea"
          >
            <TaskDetailContent key={openTask.id} task={openTask} onClose={close} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TaskDetailContent({ task: snapshot, onClose }: { task: Task; onClose: () => void }) {
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
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Título de la tarea"
          className="min-w-0 flex-1 bg-transparent text-lg font-bold text-fg outline-none"
        />
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Assign */}
      {profiles.length > 1 && (
        <Field label="Responsable">
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => update.mutate({ task, patch: { owner_id: p.id } })}
                aria-pressed={task.owner_id === p.id}
                className={cn(
                  "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
                  task.owner_id === p.id
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted hover:bg-surface-2",
                )}
              >
                <OwnerAvatar profile={p} size={16} />
                {p.id === me?.id ? "Vos" : p.display_name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Share */}
      {partner && (
        <Field label="Compartir">
          <button
            onClick={() => update.mutate({ task, patch: { shared: !task.shared } })}
            aria-pressed={task.shared}
            className="flex cursor-pointer items-center gap-2.5 text-sm"
          >
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                task.shared ? "bg-primary" : "bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow-soft transition-transform",
                  task.shared && "translate-x-4",
                )}
              />
            </span>
            <span className="text-fg">
              {task.shared ? `${partner.display_name} también la ve` : "Solo la ves vos"}
            </span>
          </button>
        </Field>
      )}

      {/* Scheduled day — move the task to another day without dragging */}
      <Field label="Programada para">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            active={task.planned_date === today}
            label="Hoy"
            onClick={() => reschedule(today)}
          />
          <Chip
            active={task.planned_date === tomorrow}
            label="Mañana"
            onClick={() => reschedule(tomorrow)}
          />
          <DateChip
            label={
              task.planned_date && task.planned_date !== today && task.planned_date !== tomorrow
                ? dueLabel(task.planned_date, today)
                : "Otro día"
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
      <Field label="Vence">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            active={!task.due_date}
            label="Sin fecha"
            onClick={() => update.mutate({ task, patch: { due_date: null } })}
          />
          <Chip
            active={task.due_date === today}
            label="Hoy"
            onClick={() => update.mutate({ task, patch: { due_date: today } })}
          />
          <Chip
            active={task.due_date === tomorrow}
            label="Mañana"
            onClick={() => update.mutate({ task, patch: { due_date: tomorrow } })}
          />
          <DateChip
            label={
              task.due_date && task.due_date !== today && task.due_date !== tomorrow
                ? dueLabel(task.due_date, today)
                : "Otra fecha"
            }
            active={!!task.due_date && task.due_date !== today && task.due_date !== tomorrow}
            value={task.due_date ?? today}
            onChange={(d) => update.mutate({ task, patch: { due_date: d } })}
          />
        </div>
      </Field>

      {/* Channel */}
      <Field label="Categoría">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            active={!task.channel_id}
            label="Sin categoría"
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
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-primary bg-primary-soft px-3 py-1.5">
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
                placeholder="Nombre…"
                aria-label="Nueva categoría"
                className="w-24 bg-transparent text-xs font-medium text-primary placeholder:text-primary/50 outline-none"
              />
            </span>
          ) : (
            <button
              onClick={() => setAddingChannel(true)}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-pill border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nueva
            </button>
          )}
        </div>
      </Field>

      {/* Estimate */}
      <Field label="Estimación">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!task.time_estimate_min}
            label="Ninguna"
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
      <Field label="Recordatorio">
        <ReminderControl task={task} update={update} />
      </Field>

      {/* Time tracking */}
      <Field label="Tiempo">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
          <div className="flex items-baseline gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                Real
              </span>
              {timer.running ? (
                <span className="text-lg font-bold tabular-nums text-primary">
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
                  placeholder="ej. 1h 30m"
                  aria-label="Tiempo real"
                  className="w-24 border-b border-primary bg-transparent text-lg font-bold tabular-nums text-fg outline-none placeholder:text-base placeholder:font-normal placeholder:text-subtle"
                />
              ) : (
                <button
                  onClick={startEditReal}
                  title="Cargar el tiempo a mano"
                  className="cursor-pointer text-left text-lg font-bold tabular-nums text-fg underline decoration-dotted decoration-from-font underline-offset-4 transition-colors hover:text-primary"
                >
                  {task.actual_time_min ? formatDuration(task.actual_time_min * 60) : "—"}
                </button>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                Estimado
              </span>
              <span className="text-lg font-bold tabular-nums text-muted">
                {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : "—"}
              </span>
            </div>
          </div>
          <button
            onClick={timer.toggle}
            aria-pressed={timer.running}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
              timer.running
                ? "bg-danger/10 text-danger hover:bg-danger/15"
                : "bg-primary text-on-primary hover:bg-primary-hover",
            )}
          >
            {timer.running ? (
              <>
                <Pause className="h-4 w-4" aria-hidden /> Detener
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden /> Empezar
              </>
            )}
          </button>
        </div>
      </Field>

      {/* Objective */}
      {(objectivesQ.data ?? []).length > 0 && (
        <Field label="Meta">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={!task.objective_id}
              label="Ninguna"
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

      {/* Description */}
      <Field label="Descripción">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Agregar una descripción…"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </Field>

      {/* Checklist */}
      <Field
        label={`Checklist${subtasks.length ? ` · ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ""}`}
      >
        <div className="flex flex-col gap-0.5">
          {subtasks.map((s) => (
            <div
              key={s.id}
              className="group flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-surface-2"
            >
              <span className="mt-0.5">
                <TaskCheckbox checked={s.done} onToggle={() => toggleSub.mutate(s)} size="sm" />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 break-words text-sm leading-snug",
                  s.done ? "text-subtle line-through" : "text-fg",
                )}
              >
                {s.title}
              </span>
              <button
                onClick={() => deleteSub.mutate(s.id)}
                aria-label="Eliminar ítem"
                className="-m-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 touch:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}

          {/* Add item — clearly visible field with its own add button */}
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-focus">
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
              placeholder="Agregar un ítem…"
              aria-label="Nuevo ítem del checklist"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
            <button
              onClick={addSub}
              disabled={!newSub.trim()}
              aria-label="Agregar ítem"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>
      </Field>

      {/* Kudos — celebrate a finished shared task */}
      {partner && task.shared && task.status === "done" && (
        <Field label="Reacciones">
          <TaskReactions taskId={task.id} />
        </Field>
      )}

      {/* Comments — discussion on a shared task */}
      {partner && task.shared && (
        <Field label="Comentarios">
          <TaskComments taskId={task.id} />
        </Field>
      )}

      <button
        onClick={() => {
          timer.cancel();
          remove.mutate(task);
          onClose();
        }}
        className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Eliminar tarea
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
        <Chip active={!task.remind_at} label="Sin recordatorio" onClick={clear} />
        {REMINDER_OFFSETS.map((o) => (
          <Chip
            key={o}
            active={task.remind_at != null && currentOffset === o}
            label={reminderOffsetLabel(o)}
            disabled={!hasBlock}
            onClick={() => setOffset(o)}
          />
        ))}
      </div>
      {!hasBlock && (
        <p className="text-xs text-subtle">
          Programá un horario en la agenda para avisarte antes de empezar.
        </p>
      )}
      {task.planned_date && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>o a una hora:</span>
          <TimePicker value={customTime} onChange={setCustom} placeholder="Elegir" />
        </div>
      )}
    </div>
  );
}

/** A chip that opens the native date picker. Styled like {@link Chip} so it
 *  sits inline with the quick "Hoy / Mañana" options. */
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
  return (
    <label
      className={cn(
        "relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border text-muted hover:bg-surface-2",
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Elegir fecha"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {children}
    </div>
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
        "inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        disabled ? "cursor-not-allowed border-border text-subtle opacity-50" : "cursor-pointer",
        !disabled &&
          (active
            ? "border-primary bg-primary-soft text-primary"
            : "border-border text-muted hover:bg-surface-2"),
      )}
    >
      {color && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      )}
      {label}
    </button>
  );
}
