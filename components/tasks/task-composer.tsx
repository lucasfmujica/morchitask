"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Channel } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

export type ComposerSubmit = {
  title: string;
  channelId: string | null;
  timeEstimateMin: number | null;
};

export function TaskComposer({
  channels,
  onSubmit,
}: {
  channels: Channel[];
  onSubmit: (input: ComposerSubmit) => void;
}) {
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, channelId, timeEstimateMin: null });
    setTitle("");
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-2 shadow-soft">
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!title.trim()}
          aria-label="Agregar tarea"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Agregar una tarea…"
          aria-label="Nueva tarea"
          className="h-8 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
      </div>

      {channels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
          <ChannelChip
            label="Sin categoría"
            active={channelId === null}
            onClick={() => setChannelId(null)}
          />
          {channels.map((c) => (
            <ChannelChip
              key={c.id}
              label={c.name}
              color={c.color}
              active={channelId === c.id}
              onClick={() => setChannelId(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
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
