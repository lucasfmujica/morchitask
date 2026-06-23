"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { useChannels } from "@/lib/queries/channels";
import { useObjectives } from "@/lib/queries/objectives";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useDeleteTask, useUpdateTask } from "@/lib/queries/tasks";
import {
  useCreateSubtask,
  useDeleteSubtask,
  useSubtasks,
  useToggleSubtask,
} from "@/lib/queries/subtasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { orderForAppend } from "@/lib/ordering";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/queries/types";
import { TaskCheckbox } from "./task-checkbox";
import { OwnerAvatar } from "./owner-avatar";

const ESTIMATES = [15, 30, 45, 60, 90];

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

function TaskDetailContent({ task, onClose }: { task: Task; onClose: () => void }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const channelsQ = useChannels();
  const objectivesQ = useObjectives();
  const profiles = useProfiles().data ?? [];
  const me = useMe().data;
  const partner = profiles.find((p) => p.id !== me?.id);
  const subtasksQ = useSubtasks(task.id);
  const createSub = useCreateSubtask(task.id);
  const toggleSub = useToggleSubtask(task.id);
  const deleteSub = useDeleteSubtask(task.id);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [newSub, setNewSub] = useState("");

  const subtasks = subtasksQ.data ?? [];

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
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-pill border px-2 py-1 text-xs font-medium transition-colors",
                  task.owner_id === p.id
                    ? "border-transparent bg-primary-soft text-primary"
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

      {/* Channel */}
      <Field label="Categoría">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!task.channel_id}
            label="Sin categoría"
            onClick={() => update.mutate({ task, patch: { channel_id: null } })}
          />
          {(channelsQ.data ?? []).map((c) => (
            <Chip
              key={c.id}
              active={task.channel_id === c.id}
              label={c.name}
              color={c.color}
              onClick={() => update.mutate({ task, patch: { channel_id: c.id } })}
            />
          ))}
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
          {ESTIMATES.map((m) => (
            <Chip
              key={m}
              active={task.time_estimate_min === m}
              label={formatMinutes(m)}
              onClick={() => update.mutate({ task, patch: { time_estimate_min: m } })}
            />
          ))}
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
        label={`Checklist${subtasks.length ? ` (${subtasks.filter((s) => s.done).length}/${subtasks.length})` : ""}`}
      >
        <div className="flex flex-col gap-1">
          {subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-2">
              <TaskCheckbox checked={s.done} onToggle={() => toggleSub.mutate(s)} size="sm" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  s.done ? "text-subtle line-through" : "text-fg",
                )}
              >
                {s.title}
              </span>
              <button
                onClick={() => deleteSub.mutate(s.id)}
                aria-label="Eliminar subtarea"
                className="cursor-pointer text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <span
              className="h-4 w-4 shrink-0 rounded border-2 border-dashed border-gray-300"
              aria-hidden
            />
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSub()}
              placeholder="Agregar un ítem…"
              aria-label="Nueva subtarea"
              className="h-6 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
          </div>
        </div>
      </Field>

      <button
        onClick={() => {
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
