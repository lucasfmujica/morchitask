"use client";

import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import type { Channel } from "@/lib/queries/types";
import { todayISO } from "@/lib/date";
import { useDateLabels } from "@/lib/use-date-labels";
import { formatMinutes } from "@/lib/format";
import { parseQuickAdd, type QuickAddKind, type QuickAddMatch } from "@/lib/quick-add";
import {
  NO_PRIORITY_LABEL_KEY,
  PRIORITY_DOT,
  PRIORITY_LABEL_KEY,
  TASK_PRIORITIES,
  type PriorityKey,
} from "@/lib/priority";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type ComposerSubmit = {
  title: string;
  channelId: string | null;
  timeEstimateMin: number | null;
  priority: PriorityKey;
  /** Parsed from the text ("mañana", "el 15"). Absent = the view's own day. */
  plannedDate?: string;
  /** Parsed local "HH:mm" ("18hs", "a las 9") — becomes a time block. */
  time?: string;
};

export function TaskComposer({
  channels,
  onSubmit,
}: {
  channels: Channel[];
  onSubmit: (input: ComposerSubmit) => void;
}) {
  const t = useTranslations("tasks");
  const labels = useDateLabels();
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [priority, setPriority] = useState<PriorityKey>(null);
  // Manual chips win over what the text says, but only once actually touched —
  // "Sin prioridad" picked on purpose and "never opened the chips" are both null.
  const [channelTouched, setChannelTouched] = useState(false);
  const [priorityTouched, setPriorityTouched] = useState(false);
  // Parsed bits the user dismissed with ×: their words stay in the title.
  const [ignored, setIgnored] = useState<ReadonlySet<QuickAddKind>>(new Set());
  // The chips used to be two permanently visible rows — three lines of UI for
  // a field most tasks never set. They fold behind one button, and open
  // themselves as soon as a choice is made so the state stays visible.
  const [showChips, setShowChips] = useState(false);
  const chipsOpen = showChips || channelId !== null || priority !== null;

  const today = todayISO();
  const parsed = useMemo(
    () => parseQuickAdd(title, { today, channels, ignore: ignored }),
    [title, today, channels, ignored],
  );
  const effectiveChannel = channelTouched ? channelId : (parsed.channelId ?? channelId);
  const effectivePriority = priorityTouched ? priority : (parsed.priority ?? priority);
  const previews = parsed.matches.filter(
    (m) => !(m.kind === "channel" && channelTouched) && !(m.kind === "priority" && priorityTouched),
  );

  function previewLabel(m: QuickAddMatch): string {
    switch (m.kind) {
      case "date":
        return labels.weekDayHeading(parsed.plannedDate!, today);
      case "time":
        return parsed.time!;
      case "estimate":
        return formatMinutes(parsed.estimateMin!);
      case "priority":
        return t(PRIORITY_LABEL_KEY[parsed.priority!]);
      case "channel":
        return channels.find((c) => c.id === parsed.channelId)?.name ?? m.text;
    }
  }

  function submit() {
    const raw = title.trim();
    if (!raw) return;
    // Typing only "mañana" leaves no title — then the words ARE the title.
    const clean = parsed.title.trim();
    onSubmit({
      title: clean || raw,
      channelId: effectiveChannel,
      timeEstimateMin: (clean && parsed.estimateMin) || null,
      priority: effectivePriority,
      ...(clean && parsed.plannedDate && { plannedDate: parsed.plannedDate }),
      ...(clean && parsed.time && { time: parsed.time }),
    });
    setTitle("");
    setIgnored(new Set());
    setPriority(null); // the next task starts unprioritized, not sticky
    setPriorityTouched(false);
    // The category stays as the default for the next task, but a #tag typed
    // there should still win — so it's no longer "touched".
    setChannelTouched(false);
    setShowChips(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-2 shadow-soft">
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!title.trim()}
          aria-label={t("add")}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <input
          data-task-composer
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!e.target.value) setIgnored(new Set());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("addPlaceholder")}
          aria-label={t("newTask")}
          className="h-8 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={() => setShowChips((v) => !v)}
          aria-expanded={chipsOpen}
          aria-label={t("categoryAndPriority")}
          title={t("categoryAndPriority")}
          className={cn(
            "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
            chipsOpen ? "bg-surface-2 text-fg" : "text-subtle hover:bg-surface-2 hover:text-muted",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* What the text will set — "Mañana · 18:00 · 30m · Alta". × keeps the words in the title instead. */}
      {previews.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10" aria-live="polite">
          {previews.map((m) => {
            const label = previewLabel(m);
            const color =
              m.kind === "channel"
                ? channels.find((c) => c.id === parsed.channelId)?.color
                : m.kind === "priority"
                  ? PRIORITY_DOT[parsed.priority!]
                  : undefined;
            return (
              <span
                key={m.kind}
                title={`Detectado: "${m.text}"`}
                className="inline-flex items-center gap-1 rounded-pill bg-primary-soft py-0.5 pr-0.5 pl-2.5 text-xs font-medium text-primary"
              >
                {color && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                )}
                {label}
                <button
                  type="button"
                  onClick={() => setIgnored((prev) => new Set(prev).add(m.kind))}
                  aria-label={t("quickAddIgnore", { label })}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-primary/15"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {chipsOpen && channels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
          <ChannelChip
            label={t("noCategory")}
            active={effectiveChannel === null}
            onClick={() => {
              setChannelId(null);
              setChannelTouched(true);
            }}
          />
          {channels.map((c) => (
            <ChannelChip
              key={c.id}
              label={c.name}
              color={c.color}
              active={effectiveChannel === c.id}
              onClick={() => {
                setChannelId(c.id);
                setChannelTouched(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Priority — set it here and the task lands in the right group straight away. */}
      {chipsOpen && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
          <ChannelChip
            label={t(NO_PRIORITY_LABEL_KEY)}
            active={effectivePriority === null}
            onClick={() => {
              setPriority(null);
              setPriorityTouched(true);
            }}
          />
          {TASK_PRIORITIES.map((p) => (
            <ChannelChip
              key={p}
              label={t(PRIORITY_LABEL_KEY[p])}
              color={PRIORITY_DOT[p]}
              active={effectivePriority === p}
              onClick={() => {
                setPriority(p);
                setPriorityTouched(true);
              }}
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
