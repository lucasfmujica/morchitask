"use client";

import { useMe } from "@/lib/queries/profiles";
import { REACTION_EMOJIS, useReactions, useToggleReaction } from "@/lib/queries/reactions";
import type { TaskReaction } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

/**
 * Kudos bar for a shared task: tap an emoji to add/remove your reaction.
 * Each chip shows the emoji and how many people reacted with it.
 */
export function TaskReactions({ taskId, size = "md" }: { taskId: string; size?: "sm" | "md" }) {
  const me = useMe().data;
  const { data: reactions = [] } = useReactions(taskId);
  const toggle = useToggleReaction(taskId);

  const counts = new Map<string, { total: number; mine?: TaskReaction }>();
  for (const r of reactions) {
    const entry = counts.get(r.emoji) ?? { total: 0 };
    entry.total += 1;
    if (r.author_id === me?.id) entry.mine = r;
    counts.set(r.emoji, entry);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {REACTION_EMOJIS.map((emoji) => {
        const c = counts.get(emoji);
        const active = !!c?.mine;
        return (
          <button
            key={emoji}
            onClick={() => toggle.mutate({ emoji, mine: c?.mine })}
            aria-pressed={active}
            aria-label={`Reaccionar ${emoji}`}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border transition-colors",
              size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:bg-surface-2",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {c?.total ? <span className="tabular-nums">{c.total}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
