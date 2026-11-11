"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useCommandPalette } from "@/lib/stores/command-palette";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useChannelLookup, useChannels, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { taskKeys, useTaskSearch } from "@/lib/queries/tasks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { buildPaletteItems, type ActionMeta, type PaletteItem } from "@/lib/palette";
import { parseQuickAdd, type QuickAddResult } from "@/lib/quick-add";
import { PRIORITY_DOT, PRIORITY_LABEL_KEY } from "@/lib/priority";
import { formatMinutes } from "@/lib/format";
import type { Channel, Task } from "@/lib/queries/types";
import { todayISO } from "@/lib/date";
import { useDateLabels } from "@/lib/use-date-labels";
import { SPRING_SOFT } from "@/lib/motion";
import { Skeleton } from "@/components/ui";
import { useComposerCreate } from "@/components/tasks/use-composer-create";
import { PaletteTaskRow } from "./palette-task-row";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function CommandPalette() {
  const tp = useTranslations("palette");
  const isOpen = useCommandPalette((s) => s.isOpen);
  const close = useCommandPalette((s) => s.close);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-scrim p-4 pt-[8dvh] sm:pt-[120px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={close}
        >
          <motion.div
            // max-h in dvh + a flex column: on a phone the on-screen keyboard
            // eats ~40% of the viewport, and a fixed vh panel would push the
            // results out of reach.
            className="flex max-h-[80dvh] w-full max-w-[640px] flex-col gap-1.5 overflow-hidden rounded-[28px] bg-bg p-2 shadow-[0_24px_70px_rgb(var(--shadow-color)/0.3)]"
            initial={{ opacity: 0, scale: 0.98, y: -14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={tp("label")}
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
  const tp = useTranslations("palette");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const qc = useQueryClient();
  const createFromText = useComposerCreate(todayISO());
  const openDetail = useTaskDetail((s) => s.open);
  const pushRecent = useCommandPalette((s) => s.pushRecent);
  const recentTaskIds = useCommandPalette((s) => s.recentTaskIds);
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;
  const channels = useChannels().data;

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
      { id: "today", label: tp("goTo", { view: tn("today") }), run: go("/today") },
      { id: "week", label: tp("goTo", { view: tn("week") }), run: go("/week") },
      { id: "month", label: tp("goTo", { view: tn("month") }), run: go("/month") },
      { id: "plan", label: tn("plan"), run: go(`/plan/${today}`) },
      { id: "shutdown", label: tn("shutdown"), run: go(`/shutdown/${today}`) },
      { id: "review", label: tn("review"), run: go("/review") },
      { id: "backlog", label: tp("goTo", { view: tn("backlog") }), run: go("/backlog") },
      { id: "routines", label: tp("goTo", { view: tn("routines") }), run: go("/routines") },
      { id: "metas", label: tp("goTo", { view: tn("goals") }), run: go("/metas") },
      { id: "focus", label: tp("goTo", { view: tn("focus") }), run: go("/focus") },
      { id: "resumen", label: tp("goTo", { view: tn("summary") }), run: go("/resumen") },
      { id: "settings", label: tp("goTo", { view: tn("settings") }), run: go("/settings") },
    ];
    // tp/tn belong here: without them the labels would keep the language they
    // were built in, so switching to English left a Spanish palette behind.
  }, [router, close, tp, tn]);

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

  // The same quick-add the composer understands ("mañana 10hs 30m #trabajo"),
  // so the create card can show what it read before you press Enter.
  const parsed = useMemo(
    () => parseQuickAdd(query, { today: todayISO(), channels: channels ?? [] }),
    [query, channels],
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
    // Same rules as the composer: typing only "mañana" leaves no title, and
    // then the words ARE the title (and nothing is taken from them).
    const raw = item.title.trim();
    const clean = parsed.title.trim();
    const today = todayISO();
    close();
    createFromText(
      {
        title: clean || raw,
        channelId: (clean && parsed.channelId) || null,
        timeEstimateMin: (clean && parsed.estimateMin) || null,
        priority: (clean && parsed.priority) || null,
        ...(clean && parsed.plannedDate && { plannedDate: parsed.plannedDate }),
        ...(clean && parsed.time && { time: parsed.time }),
      },
      qc.getQueryData<Task[]>(taskKeys.date(today)) ?? [],
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Wraps around: the create card is drawn on top but is the LAST item of
    // the flat list (lib/palette keeps it last so Enter on "sema" still
    // navigates). Wrapping makes up-from-the-first-result land on it, which is
    // where the eye expects it.
    const move = (delta: number) => {
      if (flat.length === 0) return;
      setSelected((active + delta + flat.length) % flat.length);
    };

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
  const createIndex = flat.findIndex((item) => item.kind === "create");
  const createItem = createIndex === -1 ? undefined : flat[createIndex];
  const listSections = sections.filter((section) => section.id !== "create");
  let index = -1;

  return (
    <>
      {/* The input is a white pill on the paper panel: it's where you are. */}
      <div className="flex shrink-0 items-center gap-2.5 rounded-[22px] bg-surface py-1.5 pr-2 pl-[18px]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="shrink-0 text-muted"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={tp("placeholder")}
          aria-label={tp("inputLabel")}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={flat[active] ? `palette-item-${active}` : undefined}
          className="h-[46px] w-full min-w-0 bg-transparent text-[17px] text-fg placeholder:text-subtle outline-none"
        />
        {/* Also a way out by touch, where there is no Escape key. */}
        <button
          onClick={close}
          aria-label={tc("close")}
          className="shrink-0 cursor-pointer rounded-[6px] bg-surface-2 px-[7px] py-[3px] font-mono text-[11px] leading-normal text-muted transition-colors hover:text-fg"
        >
          esc
        </button>
      </div>

      <div
        ref={listRef}
        id="palette-list"
        role="listbox"
        aria-label={tp("results")}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
      >
        {createItem?.kind === "create" && (
          <CreateCard
            item={createItem}
            index={createIndex}
            active={createIndex === active}
            parsed={parsed}
            channelsById={channelsById}
            onRun={() => runItem(createItem)}
            onMouseMove={(e) => onMouseMove(createIndex, e)}
          />
        )}

        {showSkeleton ? (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[42px] rounded-lg" />
            ))}
          </div>
        ) : flat.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">
            {tp("empty", { query: query.trim() })}
          </p>
        ) : (
          listSections.map((section) => (
            <div
              key={section.id}
              role="group"
              aria-label={tp(section.headingKey)}
              className="flex flex-col gap-0.5 px-1 pt-1 pb-0.5"
            >
              <p className="px-2.5 py-1.5 text-[11px] leading-normal font-semibold tracking-[0.06em] text-muted uppercase">
                {tp(section.headingKey)}
              </p>
              {section.items.map((item) => {
                index = flat.indexOf(item, index + 1);
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
                    // isolate: once framer drops the panel transform, a bare -z-10 highlight
                    // would slide under the panel background and vanish.
                    className="relative isolate flex h-[42px] w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-sm text-fg"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="palette-active"
                        transition={SPRING_SOFT}
                        className="absolute inset-0 -z-10 rounded-lg bg-surface-2"
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

      <div className="flex shrink-0 items-center gap-4 border-t border-border px-3.5 pt-2 pb-1.5 text-[11px] leading-normal text-muted">
        <span>
          <span className="font-mono">{"↑↓"}</span> {tp("navigate")}
        </span>
        <span>
          <span className="font-mono">{"↵"}</span> {tp("openItem")}
        </span>
        <span>
          <span className="font-mono">esc</span> {tp("closeItem")}
        </span>
      </div>
    </>
  );
}

/**
 * "Crear tarea" as its own card on top, with what the quick-add parser read
 * from the text as chips under the title, so "mañana 10hs #trabajo" visibly
 * becomes a date, a time and a category before you commit to it.
 */
function CreateCard({
  item,
  index,
  active,
  parsed,
  channelsById,
  onRun,
  onMouseMove,
}: {
  item: Extract<PaletteItem, { kind: "create" }>;
  index: number;
  active: boolean;
  parsed: QuickAddResult;
  channelsById: Map<string, Channel>;
  onRun: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
}) {
  const tp = useTranslations("palette");
  const tt = useTranslations("tasks");
  const labels = useDateLabels();
  const today = todayISO();
  const clean = parsed.title.trim();
  // With nothing left once the tokens are taken, the words are the title and
  // nothing is parsed out of them (same rule as runItem).
  const useParsed = !!clean;
  const channel = useParsed && parsed.channelId ? channelsById.get(parsed.channelId) : undefined;

  return (
    <button
      id={`palette-item-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      onClick={onRun}
      onMouseMove={onMouseMove}
      className={cn(
        // Rises in as soon as there is something to create, like the canvas.
        "flex shrink-0 animate-up cursor-pointer flex-col gap-2.5 rounded-[20px] bg-surface px-3.5 py-3 text-left ring-2 transition-shadow ring-inset [animation-duration:350ms]",
        active ? "ring-fit-from" : "ring-transparent",
      )}
    >
      <span className="text-[11px] leading-normal font-semibold tracking-[0.06em] text-muted uppercase">
        {tp("createHeading")}
      </span>
      <span className="flex items-center gap-2.5">
        {/* Green disc: creating it is the "yes, add this" of the palette. */}
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-fit text-on-primary">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {tp("createTask", { title: clean || item.title })}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted" aria-hidden>
          {"↵"}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5 pl-9">
        {/* Where it lands: the parsed day, or today like before. */}
        <ParsedChip className="bg-primary-soft text-fg">
          {labels.relativeLabel(
            useParsed && parsed.plannedDate ? parsed.plannedDate : today,
            today,
          )}
        </ParsedChip>
        {useParsed && parsed.time && (
          <ParsedChip className="bg-surface-2 font-mono text-fg">{parsed.time}</ParsedChip>
        )}
        {useParsed && parsed.estimateMin && (
          <ParsedChip className="bg-surface-2 font-mono text-fg">
            {formatMinutes(parsed.estimateMin)}
          </ParsedChip>
        )}
        {channel && (
          <ParsedChip className="text-on-scrim" style={{ backgroundColor: channel.color }}>
            {channel.name}
          </ParsedChip>
        )}
        {useParsed && parsed.priority && (
          <ParsedChip
            className={
              parsed.priority === "high" ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg"
            }
          >
            {parsed.priority !== "high" && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PRIORITY_DOT[parsed.priority] }}
                aria-hidden
              />
            )}
            {tt(PRIORITY_LABEL_KEY[parsed.priority])}
          </ParsedChip>
        )}
      </span>
    </button>
  );
}

function ParsedChip({
  className,
  style,
  children,
}: {
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        // Each chip rises in as the parser reads it out of the text.
        "inline-flex animate-up items-center gap-1.5 rounded-pill px-2.5 py-1 text-2xs font-semibold [animation-duration:350ms]",
        className,
      )}
      style={style}
    >
      {children}
    </span>
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
  if (item.kind === "create") return null;
  // Places get a neutral swatch where tasks get their category's colour, so
  // the two kinds of row line up but never read as each other.
  return (
    <>
      <span className="h-2 w-2 shrink-0 rounded-[2px] bg-border-strong" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
    </>
  );
}
