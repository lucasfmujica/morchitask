"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Inbox,
  Moon,
  Plus,
  Repeat,
  Settings,
  Sun,
  Target,
  Timer,
} from "lucide-react";
import { useCommandPalette } from "@/lib/stores/command-palette";
import { taskKeys, useCreateTask } from "@/lib/queries/tasks";
import type { Task } from "@/lib/queries/types";
import { todayISO } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";

type Action = { id: string; label: string; icon: typeof CalendarCheck; run: () => void };

export function CommandPalette() {
  const isOpen = useCommandPalette((s) => s.isOpen);
  const close = useCommandPalette((s) => s.close);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-gray-900/40 p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="w-full max-w-lg overflow-hidden rounded-card border border-border bg-surface shadow-card"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Buscar y acciones rápidas"
          >
            {/* Keyed by mount: state resets fresh every time the palette opens. */}
            <PaletteBody close={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateTask();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const actions: Action[] = useMemo(() => {
    const today = todayISO();
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    return [
      { id: "today", label: "Ir a Hoy", icon: CalendarCheck, run: go("/today") },
      { id: "week", label: "Ir a Semana", icon: CalendarRange, run: go("/week") },
      { id: "month", label: "Ir a Mes", icon: CalendarDays, run: go("/month") },
      { id: "plan", label: "Planificar el día", icon: Sun, run: go(`/plan/${today}`) },
      { id: "shutdown", label: "Cerrar el día", icon: Moon, run: go(`/shutdown/${today}`) },
      { id: "backlog", label: "Ir a Backlog", icon: Inbox, run: go("/backlog") },
      { id: "routines", label: "Ir a Rutinas", icon: Repeat, run: go("/routines") },
      { id: "metas", label: "Ir a Metas", icon: Target, run: go("/metas") },
      { id: "focus", label: "Ir a Foco", icon: Timer, run: go("/focus") },
      { id: "resumen", label: "Ir a Resumen", icon: BarChart3, run: go("/resumen") },
      { id: "settings", label: "Ir a Ajustes", icon: Settings, run: go("/settings") },
    ];
  }, [router, close]);

  const q = query.trim().toLowerCase();
  const filtered = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;

  const createItem: Action | null = q
    ? {
        id: "create",
        label: `Crear tarea: "${query.trim()}"`,
        icon: Plus,
        run: () => {
          const today = todayISO();
          const tasks = qc.getQueryData<Task[]>(taskKeys.date(today)) ?? [];
          create.mutate({
            title: query.trim(),
            plannedDate: today,
            sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
          });
          close();
        },
      }
    : null;

  const items = createItem ? [...filtered, createItem] : filtered;
  // Clamp at render rather than in an effect — selection follows a shrinking list.
  const active = Math.max(0, Math.min(selected, items.length - 1));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(active + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <>
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Buscar o escribir una tarea nueva…"
        aria-label="Comando o tarea"
        className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm text-fg placeholder:text-subtle outline-none"
      />
      <ul className="max-h-[50vh] overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados</li>
        ) : (
          items.map((a, i) => {
            const Icon = a.icon;
            return (
              <li key={a.id}>
                <button
                  onClick={a.run}
                  onMouseMove={() => setSelected(i)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-primary-soft text-primary" : "text-fg hover:bg-surface-2",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{a.label}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
