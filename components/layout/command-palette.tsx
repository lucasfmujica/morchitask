"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Settings,
  Sun,
  Target,
  Timer,
} from "lucide-react";
import { useCommandPalette } from "@/lib/stores/command-palette";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { taskKeys, useCreateTask, useTaskSearch } from "@/lib/queries/tasks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { buildPaletteItems, type ActionMeta, type PaletteItem } from "@/lib/palette";
import type { Channel, Task } from "@/lib/queries/types";
import { todayISO } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { EASE_OUT_EXPO, SPRING_SOFT } from "@/lib/motion";
import { Kbd, Skeleton } from "@/components/ui";
import { PaletteTaskRow } from "./palette-task-row";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, typeof CalendarCheck> = {
  today: CalendarCheck,
  week: CalendarRange,
  month: CalendarDays,
  plan: Sun,
  shutdown: Moon,
  backlog: Inbox,
  routines: Repeat,
  metas: Target,
  focus: Timer,
  resumen: BarChart3,
  settings: Settings,
};

export function CommandPalette() {
  const isOpen = useCommandPalette((s) => s.isOpen);
  const close = useCommandPalette((s) => s.close);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-scrim p-4 pt-[8dvh] sm:pt-[12dvh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            // max-h in dvh + a flex column: on a phone the on-screen keyboard
            // eats ~40% of the viewport, and a fixed vh panel would push the
            // results out of reach.
            className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
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
  const openDetail = useTaskDetail((s) => s.open);
  const pushRecent = useCommandPalette((s) => s.pushRecent);
  const recentTaskIds = useCommandPalette((s) => s.recentTaskIds);
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  // One request per pause, not one per keystroke.
  const debouncedQuery = useDebouncedValue(query, 180);
  const searchQ = useTaskSearch(debouncedQuery);

  const actions: ActionMeta[] = useMemo(() => {
    const today = todayISO();
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    return [
      { id: "today", label: "Ir a Hoy", run: go("/today") },
      { id: "week", label: "Ir a Semana", run: go("/week") },
      { id: "month", label: "Ir a Mes", run: go("/month") },
      { id: "plan", label: "Planificar el día", run: go(`/plan/${today}`) },
      { id: "shutdown", label: "Cerrar el día", run: go(`/shutdown/${today}`) },
      { id: "backlog", label: "Ir a Backlog", run: go("/backlog") },
      { id: "routines", label: "Ir a Rutinas", run: go("/routines") },
      { id: "metas", label: "Ir a Metas", run: go("/metas") },
      { id: "focus", label: "Ir a Foco", run: go("/focus") },
      { id: "resumen", label: "Ir a Resumen", run: go("/resumen") },
      { id: "settings", label: "Ir a Ajustes", run: go("/settings") },
    ];
  }, [router, close]);

  // Recents resolve against whatever task data is already cached. Ids that no
  // longer resolve (deleted, or on a day never loaded) simply drop out.
  const recents = useMemo(() => {
    if (query.trim()) return [];
    const byId = new Map<string, Task>();
    for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
      // taskKeys.all namespaces the counts cache too, which holds a Map.
      if (!Array.isArray(data)) continue;
      for (const task of data) if (task?.id) byId.set(task.id, task);
    }
    return recentTaskIds.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  }, [query, recentTaskIds, qc]);

  const { sections, flat } = useMemo(
    () => buildPaletteItems({ query, actions, tasks: searchQ.data ?? [], recents }),
    [query, actions, searchQ.data, recents],
  );

  // Clamp at render rather than in an effect — selection follows a shrinking list.
  const active = Math.max(0, Math.min(selected, flat.length - 1));

  // With 8 results plus 11 actions the list scrolls; without this, arrowing
  // walks the selection straight off-screen.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function runItem(item: PaletteItem | undefined) {
    if (!item) return;
    if (item.kind === "action") {
      item.run();
      return;
    }
    if (item.kind === "task") {
      pushRecent(item.task.id);
      // Close first, then open — the detail sheet is mounted by AppChrome, so
      // otherwise both would be on screen at once.
      close();
      openDetail(item.task);
      return;
    }
    const today = todayISO();
    const tasks = qc.getQueryData<Task[]>(taskKeys.date(today)) ?? [];
    create.mutate({
      title: item.title,
      plannedDate: today,
      sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
    });
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const move = (delta: number) =>
      setSelected(Math.max(0, Math.min(active + delta, flat.length - 1)));

    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelected(flat.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  /** Scrolling the list under a still cursor fires synthetic mousemove events,
   *  which would yank the selection away from the keyboard. Only react when the
   *  pointer actually moved. */
  function onMouseMove(index: number, e: React.MouseEvent) {
    const prev = lastPointer.current;
    if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setSelected(index);
  }

  const searching = query.trim().length >= 2;
  const showSkeleton = searching && searchQ.isFetching && !searchQ.data;
  let index = -1;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Buscar una tarea o escribir una nueva…"
          aria-label="Buscar tarea o acción"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={flat[active] ? `palette-item-${active}` : undefined}
          className="w-full bg-transparent py-3.5 text-sm text-fg placeholder:text-subtle outline-none"
        />
      </div>

      <div
        ref={listRef}
        id="palette-list"
        role="listbox"
        aria-label="Resultados"
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {showSkeleton ? (
          <div className="flex flex-col gap-1 p-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">
            Sin resultados para «{query.trim()}»
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id} role="group" aria-label={section.heading}>
              <p className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
                {section.heading}
              </p>
              {section.items.map((item) => {
                index += 1;
                const i = index;
                const isActive = i === active;
                return (
                  <button
                    key={`${section.id}-${item.id}`}
                    id={`palette-item-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => runItem(item)}
                    onMouseMove={(e) => onMouseMove(i, e)}
                    className={cn(
                      "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      isActive ? "text-primary" : "text-fg hover:bg-surface-2",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="palette-active"
                        transition={SPRING_SOFT}
                        className="absolute inset-0 -z-10 rounded-lg bg-primary-soft"
                        aria-hidden
                      />
                    )}
                    <PaletteRowContent item={item} channelsById={channelsById} />
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-2xs text-subtle">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⏎</Kbd> abrir
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd> cerrar
        </span>
      </div>
    </>
  );
}

function PaletteRowContent({
  item,
  channelsById,
}: {
  item: PaletteItem;
  channelsById: Map<string, Channel>;
}) {
  if (item.kind === "task") {
    return (
      <PaletteTaskRow
        task={item.task}
        channel={item.task.channel_id ? channelsById.get(item.task.channel_id) : undefined}
        ranges={item.ranges}
      />
    );
  }
  if (item.kind === "create") {
    return (
      <>
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Crear tarea: «{item.title}»</span>
        <span className="shrink-0 text-2xs text-subtle">Hoy</span>
      </>
    );
  }
  const Icon = NAV_ICONS[item.id] ?? CalendarCheck;
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </>
  );
}
