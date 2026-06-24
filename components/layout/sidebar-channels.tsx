"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import {
  CHANNEL_COLORS,
  useCreateChannel,
  useDeleteChannel,
  useReorderChannels,
  useUpdateChannel,
} from "@/lib/queries/channels";
import { useChannelFilter } from "@/lib/channel-filter";
import { useHydrated } from "@/lib/use-hydrated";
import type { Channel } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

// Drag handle — reserved space (no layout shift), revealed on hover/touch.
const GRIP_CLASS =
  "flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-subtle/50 opacity-0 transition-opacity hover:text-muted active:cursor-grabbing group-hover:opacity-100 touch:opacity-100";

/**
 * The sidebar's "Categorías" list. Each category can be renamed, recolored,
 * deleted and reordered right here (no trip to Ajustes). On views that filter by
 * category (Día, Semana, Backlog) the row body toggles that filter; elsewhere a
 * click just opens its options menu.
 */
export function SidebarChannels({
  channels,
  filterable,
}: {
  channels: Channel[];
  /** On views that filter by category, rows become toggle filters. */
  filterable: boolean;
}) {
  const create = useCreateChannel();
  const reorder = useReorderChannels();
  const { selected, toggle, clear } = useChannelFilter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // Only one category's options menu is open at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  // dnd-kit assigns non-deterministic a11y ids → render a plain list for SSR and
  // first paint, then enable drag after hydration (same trick as the task list).
  const mounted = useHydrated();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] });
    setName("");
    setAdding(false);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = channels.findIndex((c) => c.id === active.id);
    const newIndex = channels.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const orderedIds = arrayMove(channels, oldIndex, newIndex).map((c) => c.id);
    reorder.mutate(orderedIds);
  }

  const filtering = filterable && selected.size > 0;

  function rowProps(c: Channel) {
    return {
      channel: c,
      filterable,
      active: selected.has(c.id),
      menuOpen: openId === c.id,
      onToggle: () => toggle(c.id),
      onMenu: () => setOpenId((cur) => (cur === c.id ? null : c.id)),
    };
  }

  return (
    <div className="mt-5 flex flex-col px-3 pb-2">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Categorías
        </span>
        <button
          onClick={() => setAdding((a) => !a)}
          aria-label="Agregar categoría"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {filtering && (
        <button
          onClick={clear}
          className="mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-2"
        >
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">Mostrar todas</span>
        </button>
      )}

      {mounted ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={channels.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-0.5">
              {channels.map((c) => (
                <SortableChannelRow key={c.id} {...rowProps(c)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {channels.map((c) => (
            <li key={c.id} className="group relative">
              <ChannelRowBody
                {...rowProps(c)}
                handle={
                  <button aria-label="Reordenar categoría" tabIndex={-1} className={GRIP_CLASS}>
                    <GripVertical className="h-3.5 w-3.5" aria-hidden />
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] }}
            aria-hidden
          />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            placeholder="Nombre de la categoría…"
            aria-label="Nueva categoría"
            className="w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
          />
        </div>
      )}

      {channels.length === 0 && !adding && (
        <p className="px-2 py-1.5 text-xs text-subtle">
          Sin categorías. Tocá + para crear la primera.
        </p>
      )}
    </div>
  );
}

type RowProps = {
  channel: Channel;
  filterable: boolean;
  active: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMenu: () => void;
};

function SortableChannelRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.channel.id,
  });
  // Build the handle here so the dnd listeners keep their inferred types
  // (spreading them across a typed prop boundary would lose that).
  const handle = (
    <button
      {...attributes}
      {...listeners}
      aria-label="Reordenar categoría"
      tabIndex={-1}
      className={GRIP_CLASS}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative", isDragging && "z-10 opacity-90")}
    >
      <ChannelRowBody {...props} handle={handle} />
    </li>
  );
}

function ChannelRowBody({
  channel,
  filterable,
  active,
  menuOpen,
  onToggle,
  onMenu,
  handle,
}: RowProps & { handle: ReactNode }) {
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg pr-1 transition-colors",
          filterable && active ? "bg-surface-2" : "hover:bg-surface-2",
        )}
      >
        {handle}

        {/* Body: toggles the filter where available, otherwise opens the menu. */}
        <button
          onClick={filterable ? onToggle : onMenu}
          aria-pressed={filterable ? active : undefined}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1.5 text-left text-sm transition-colors",
            filterable && active ? "font-semibold text-fg" : "text-muted group-hover:text-fg",
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full transition-all"
            style={{
              backgroundColor: channel.color,
              ...(filterable && active
                ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px ${channel.color}` }
                : {}),
            }}
            aria-hidden
          />
          <span className="truncate">{channel.name}</span>
        </button>

        {/* Options menu trigger. */}
        <button
          onClick={onMenu}
          aria-label={`Opciones de ${channel.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={cn(
            "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-all hover:bg-border hover:text-fg",
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 touch:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {menuOpen && <ChannelMenuPanel channel={channel} onClose={onMenu} />}
    </>
  );
}

function ChannelMenuPanel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const update = useUpdateChannel();
  const remove = useDeleteChannel();
  const [confirming, setConfirming] = useState(false);

  function rename(value: string) {
    const v = value.trim();
    if (v && v !== channel.name) update.mutate({ id: channel.id, patch: { name: v } });
  }

  return (
    <div
      className="mt-1 ml-5 flex flex-col gap-2 rounded-lg border border-border bg-surface-2/60 p-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <input
        autoFocus
        defaultValue={channel.name}
        onBlur={(e) => rename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            rename((e.target as HTMLInputElement).value);
            onClose();
          }
        }}
        aria-label="Renombrar categoría"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-primary"
      />

      <div className="flex flex-wrap gap-1.5">
        {CHANNEL_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => update.mutate({ id: channel.id, patch: { color } })}
            aria-label={`Color ${color}`}
            className="h-5 w-5 cursor-pointer rounded-full transition-transform hover:scale-110"
            style={{
              backgroundColor: color,
              boxShadow:
                channel.color === color
                  ? `0 0 0 2px var(--surface-2), 0 0 0 3.5px ${color}`
                  : undefined,
            }}
          />
        ))}
      </div>

      {confirming ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              remove.mutate(channel.id);
              onClose();
            }}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-danger/10 px-2 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Borrar
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Borrar categoría
        </button>
      )}
    </div>
  );
}
