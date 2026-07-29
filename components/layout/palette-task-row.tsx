"use client";

import type { MatchRange } from "@/lib/palette";
import type { Channel, Task } from "@/lib/queries/types";
import { relativeLabel, todayISO } from "@/lib/date";
import { PRIORITY_RAIL } from "@/components/tasks/priority-badge";
import { cn } from "@/lib/utils";

/**
 * One task result inside the ⌘K palette.
 *
 * Deliberately NOT `<CompactTaskRow>`: that mounts `useToggleTask` and its own
 * `openDetail`, so eight of them inside the palette would be eight live
 * mutations and a second, competing way to open a task. This is presentational
 * — the palette owns the click.
 */
export function PaletteTaskRow({
  task,
  channel,
  ranges,
}: {
  task: Task;
  channel?: Channel;
  ranges: MatchRange[];
}) {
  const done = task.status === "done";
  const where = task.planned_date ? relativeLabel(task.planned_date, todayISO()) : "Backlog";

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {/* Priority as a rail rather than a pill — a pill per row would be noise. */}
      <span
        className={cn(
          "h-4 w-[3px] shrink-0 rounded-pill",
          task.priority ? PRIORITY_RAIL[task.priority] : "bg-transparent",
        )}
        aria-hidden
      />
      {channel && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: channel.color }}
          aria-hidden
        />
      )}
      <span className={cn("min-w-0 flex-1 truncate", done && "text-subtle line-through")}>
        <Highlight text={task.title} ranges={ranges} />
      </span>
      <span className="shrink-0 text-2xs text-subtle">{where}</span>
    </span>
  );
}

/** Bolds the characters that matched the query. Ranges index into `text` and
 *  arrive already sorted and non-overlapping (see lib/palette.ts). */
function Highlight({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className="bg-transparent font-semibold text-fg">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
