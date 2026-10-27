"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { suggestChecklist } from "@/lib/actions/ai";
import { useCreateSubtask } from "@/lib/queries/subtasks";
import { orderForAppend } from "@/lib/ordering";
import type { Subtask, Task } from "@/lib/queries/types";

/**
 * "Desglosar con IA": Claude proposes checklist steps; nothing is saved until
 * you tap. Each step can be added on its own, or all at once.
 */
export function ChecklistAiSuggest({
  task,
  notes,
  subtasks,
}: {
  task: Task;
  /** The notes as currently typed (may not be saved yet). */
  notes: string;
  subtasks: Subtask[];
}) {
  const createSub = useCreateSubtask(task.id);
  const [items, setItems] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const res = await suggestChecklist({
        title: task.title,
        notes,
        existing: subtasks.map((s) => s.title),
      });
      if (!res.ok) setError(res.error);
      else if (res.data.length === 0) setError("Claude no encontró pasos para agregar.");
      else setItems(res.data);
    } catch {
      setError("No pudimos hablar con Claude ahora. Probá de nuevo en un rato.");
    } finally {
      setLoading(false);
    }
  }

  function add(titles: string[]) {
    const base = orderForAppend(subtasks.map((s) => s.sort_order));
    // orderForAppend steps by 1000; space a batch the same way so the
    // optimistic list and the saved order agree.
    titles.forEach((title, i) => createSub.mutate({ title, sortOrder: base + i * 1000 }));
    const left = (items ?? []).filter((t) => !titles.includes(t));
    setItems(left.length ? left : null);
  }

  if (!items) {
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <button
          onClick={ask}
          disabled={loading}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:cursor-default disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          {loading ? "Pensando pasos…" : "Desglosar con IA"}
        </button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-lg border border-accent/30 bg-accent-soft/50 p-2">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
        <p className="flex-1 text-xs font-semibold text-accent">Propuesta de Claude</p>
        <button
          onClick={() => setItems(null)}
          aria-label="Descartar propuesta"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface hover:text-fg"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col">
        {items.map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-md px-1 py-1">
            <span className="min-w-0 flex-1 text-sm text-fg">{t}</span>
            <button
              onClick={() => add([t])}
              aria-label={`Agregar "${t}"`}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-primary hover:bg-primary/12"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => add(items)}
        className="mt-1 w-full cursor-pointer rounded-md bg-primary py-1.5 text-xs font-bold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Agregar {items.length === 1 ? "el paso" : `los ${items.length}`}
      </button>
    </div>
  );
}
