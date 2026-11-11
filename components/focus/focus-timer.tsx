"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Pause, Play, RotateCcw } from "lucide-react";
import { setActualTime as setActualTimeAction } from "@/lib/actions/tasks";
import { taskKeys, useTasksForDate, useToggleTask } from "@/lib/queries/tasks";
import { useChannels } from "@/lib/queries/channels";
import { useToast } from "@/lib/stores/toast";
import { useAudio } from "@/lib/stores/audio";
import type { Channel, Task } from "@/lib/queries/types";
import { formatMinutes } from "@/lib/format";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Well } from "@/components/ui";
import { FocusAudioPanel } from "./focus-audio-panel";
import { useTranslations } from "next-intl";

type Mode = "focus" | "break";
const DURATION: Record<Mode, number> = { focus: 25 * 60, break: 5 * 60 };
/** A pomodoro set. Four blocks is the classic before a long break. */
const BLOCKS_PER_SET = 4;

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * A short chime + a system notification when a focus block ends (best-effort).
 *
 * The two strings arrive as arguments: this is a plain function, not a
 * component, so it has no translator of its own — and a rules-of-hooks
 * violation here would be silent, since the whole body is inside a try/catch.
 */
function notifyFocusDone(title: string, body: string) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch {
    // audio not available — ignore
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export function FocusTimer() {
  const t = useTranslations("focus");
  const tt = useTranslations("tasks");
  const tnav = useTranslations("nav");
  const qc = useQueryClient();
  const today = todayISO();
  const tasksQ = useTasksForDate(today);
  const tasks = (tasksQ.data ?? []).filter((t) => t.status === "todo");
  const channels = useChannels().data ?? [];

  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(DURATION.focus);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string>("");
  const [completed, setCompleted] = useState(0);
  const toggle = useToggleTask();
  const toast = useToast();

  // Optional: let the focus timer nudge the background-sound player.
  const audioAutoStart = useAudio((s) => s.autoStartWithFocus);
  const audioSource = useAudio((s) => s.source);
  const soundscapeId = useAudio((s) => s.soundscapeId);
  const setAudioPlaying = useAudio((s) => s.setPlaying);
  const setAudioSource = useAudio((s) => s.setSource);

  // Tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Completion: stop, and (for a focus block) log the time onto the chosen task.
  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(false);
    if (mode === "focus") {
      setCompleted((c) => c + 1);
      notifyFocusDone(t("blockDoneTitle"), t("blockDoneBody"));
      // Stop the background sound alongside the end chime.
      if (audioAutoStart && audioSource === "soundscape") setAudioPlaying(false);
    }
    if (mode === "focus" && taskId) {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (task) {
        setActualTimeAction(task.id, (task.actual_time_min ?? 0) + DURATION.focus / 60).then(() =>
          qc.invalidateQueries({ queryKey: taskKeys.date(today) }),
        );
      }
    }
  }, [
    t,
    secondsLeft,
    running,
    mode,
    taskId,
    tasks,
    qc,
    today,
    audioAutoStart,
    audioSource,
    setAudioPlaying,
  ]);

  function toggleRun() {
    // Ask once, when the user first starts a block, so the end chime can notify.
    if (!running && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const willRun = !running;
    // Auto-start the background sound when a focus block begins; pause on pause.
    if (audioAutoStart && soundscapeId) {
      if (willRun && mode === "focus") {
        if (audioSource !== "spotify") setAudioSource("soundscape");
        setAudioPlaying(true);
      } else {
        setAudioPlaying(false);
      }
    }
    setRunning(willRun);
  }
  function switchMode(m: Mode) {
    setMode(m);
    setSecondsLeft(DURATION[m]);
    setRunning(false);
    if (audioAutoStart && audioSource === "soundscape") setAudioPlaying(false);
  }
  function reset() {
    setSecondsLeft(DURATION[mode]);
    setRunning(false);
    if (audioAutoStart && audioSource === "soundscape") setAudioPlaying(false);
  }

  const total = DURATION[mode];
  const progress = 1 - secondsLeft / total;
  const R = 120;
  const C = 2 * Math.PI * R;
  const selected = tasks.find((t) => t.id === taskId);
  const selectedChannel = channels.find((c) => c.id === selected?.channel_id);
  const status = running
    ? mode === "focus"
      ? t("statusFocus")
      : t("statusBreak")
    : secondsLeft < total
      ? t("statusPaused")
      : t("statusIdle");

  /** Tick the block's task off without leaving the timer. */
  function finishTask() {
    if (!selected) return;
    toggle.mutate(selected);
    setTaskId("");
    toast(t("taskDone", { title: selected.title }), {
      label: tt("undo"),
      run: () => toggle.mutate({ ...selected, status: "done" } as Task),
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {/* The one dark tile on the page: the timer is the screen's single big
          number, so it gets the inverted hero card. Everything inside reads
          off `text-bg` tints, which flip with the card in dark mode. */}
      <section className="flex flex-col items-center gap-5 rounded-2xl bg-fg p-5 text-bg sm:p-7 lg:min-h-[640px] lg:justify-center">
        <div className="flex gap-1 rounded-pill bg-bg/10 p-1">
          {(["focus", "break"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "cursor-pointer rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors",
                mode === m ? "bg-bg text-fg shadow-soft" : "text-bg/70 hover:text-bg",
              )}
            >
              {m === "focus" ? tnav("focus") : t("break")}
            </button>
          ))}
        </div>

        <div className="relative grid place-items-center">
          <svg
            viewBox="0 0 280 280"
            className="h-[248px] w-[248px] -rotate-90 sm:h-[288px] sm:w-[288px]"
          >
            <circle
              cx="140"
              cy="140"
              r={R}
              fill="none"
              stroke="var(--color-bg)"
              strokeOpacity={0.12}
              strokeWidth="16"
            />
            <circle
              cx="140"
              cy="140"
              r={R}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute flex flex-col items-center gap-1.5">
            <span className="font-display text-[56px] leading-none font-bold tracking-tight tabular-nums sm:text-[64px]">
              {mmss(secondsLeft)}
            </span>
            <span className="text-sm text-bg/75">{status}</span>
            {mode === "focus" && (
              <span className="text-2xs font-semibold text-bg/55">
                {t("blockOf", {
                  n: Math.min(completed + 1, BLOCKS_PER_SET),
                  total: BLOCKS_PER_SET,
                })}
              </span>
            )}
          </div>
        </div>

        {/* The set, as four bars. A count in prose made you read a sentence to
            learn something a shape says instantly. */}
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            {Array.from({ length: BLOCKS_PER_SET }, (_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-7 rounded-pill", i < completed ? "bg-fit" : "bg-bg/15")}
              />
            ))}
          </span>
          <span className="text-2xs font-semibold tabular-nums text-bg/60">
            {t("setProgress", { done: completed, total: BLOCKS_PER_SET })}
          </span>
        </div>

        {/* The task you're on, as a card rather than a bare dropdown — with the
            rail, the category and how far the block has got you against your
            own estimate. */}
        {mode === "focus" && (
          <div className="mx-auto w-full max-w-xs">
            <TaskPicker tasks={tasks} channels={channels} value={taskId} onChange={setTaskId} />
            {selected && (
              <div className="relative mt-2 overflow-hidden rounded-xl bg-bg/10 px-3.5 py-2.5">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-[3px]",
                    !selectedChannel && "bg-bg/20",
                  )}
                  style={selectedChannel ? { background: selectedChannel.color } : undefined}
                  aria-hidden
                />
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {selected.title}
                  </span>
                  {selectedChannel && (
                    <span className="shrink-0 text-2xs text-bg/60">#{selectedChannel.name}</span>
                  )}
                </div>
                <TaskProgress task={selected} />
              </div>
            )}
          </div>
        )}

        {/* flex-wrap, not a fixed grid: three pills side by side are ~330px, and
            an iPhone SE leaves the card about that much. */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-pill bg-bg/10 text-bg transition-colors hover:bg-bg/20"
            aria-label={t("reset")}
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={toggleRun}
            className="inline-flex h-16 cursor-pointer items-center justify-center gap-2 rounded-pill bg-fit px-6 text-base font-bold text-on-primary shadow-card transition-[filter] hover:brightness-105 sm:px-8"
            aria-label={running ? t("pause") : t("start")}
          >
            {running ? (
              <Pause className="h-5 w-5" aria-hidden />
            ) : (
              <Play className="h-5 w-5" aria-hidden />
            )}
            <span aria-hidden>{running ? t("pause") : t("start")}</span>
          </button>
          {/* You used to have to leave the timer, find the card and tick it. */}
          <button
            onClick={finishTask}
            disabled={!selected}
            aria-label={t("finishTask")}
            title={t("finishTask")}
            className="inline-flex h-12 cursor-pointer items-center gap-1.5 rounded-pill bg-bg/10 px-4 text-sm font-semibold text-bg transition-colors hover:bg-bg/20 disabled:cursor-default disabled:opacity-40"
          >
            <Check className="h-4 w-4" aria-hidden />
            {t("finish")}
          </button>
        </div>
      </section>

      <FocusSidebar tasks={tasks} activeId={taskId} onPick={setTaskId} channels={channels} />
    </div>
  );
}

/** How far the day's tracked time has got you against your own estimate.
 *  Only rendered on the timer's dark card, hence the `text-bg` tints. */
function TaskProgress({ task }: { task: Task }) {
  const t = useTranslations("focus");
  const actual = task.actual_time_min ?? 0;
  const estimate = task.time_estimate_min;
  if (!estimate) {
    return (
      <p className="mt-1.5 text-2xs text-bg/60">
        {actual > 0 ? t("workedUnestimated", { time: formatMinutes(actual) }) : t("unestimated")}
      </p>
    );
  }
  const filled = Math.min(3, Math.round((actual / estimate) * 3));
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("h-1 w-3 rounded-pill", i < filled ? "bg-fit" : "bg-bg/15")}
          />
        ))}
      </span>
      <span className="text-2xs tabular-nums text-bg/60">
        {t("workedOfEstimate", {
          actual: formatMinutes(actual),
          estimate: formatMinutes(estimate),
        })}
      </span>
    </div>
  );
}

/**
 * The queue beside the timer: what's next, the background sound, and how
 * today's estimates are holding up. All answer "should I keep going?" without
 * leaving the page. Each sits in its own well; on a phone they stack under the
 * timer in this same order.
 */
function FocusSidebar({
  tasks,
  activeId,
  onPick,
  channels,
}: {
  tasks: Task[];
  activeId: string;
  onPick: (id: string) => void;
  channels: Channel[];
}) {
  const t = useTranslations("focus");
  const estimatedMin = tasks.reduce((sum, task) => sum + (task.time_estimate_min ?? 0), 0);
  const actualMin = tasks.reduce((sum, task) => sum + (task.actual_time_min ?? 0), 0);
  const max = Math.max(estimatedMin, actualMin, 1);

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      <Well className="flex flex-col gap-1.5">
        <h2 className="px-2.5 pt-2 pb-1 text-base font-semibold text-fg">{t("queue")}</h2>
        {tasks.length === 0 ? (
          <p className="px-2.5 pb-2 text-xs text-subtle">{t("queueEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.slice(0, 6).map((t) => {
              const channel = channels.find((c) => c.id === t.channel_id);
              const active = t.id === activeId;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onPick(t.id)}
                    className={cn(
                      "relative flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-xl bg-surface py-2.5 pr-3 pl-3.5 text-left shadow-soft transition-shadow",
                      active ? "ring-2 ring-primary ring-inset" : "hover:shadow-card",
                    )}
                  >
                    <span
                      className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
                      style={channel ? { background: channel.color } : undefined}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {t.title}
                    </span>
                    {t.time_estimate_min ? (
                      <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                        {formatMinutes(t.time_estimate_min)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Well>

      {/* Moved here from under the ring: the bento layout gives the sound its
          own well beside the timer, so the dark card holds only the block. */}
      <Well>
        <FocusAudioPanel />
      </Well>

      {(estimatedMin > 0 || actualMin > 0) && (
        <Well className="p-4">
          <h2 className="text-base font-semibold text-fg">{t("estimateVsActual")}</h2>
          <div className="mt-3 flex flex-col gap-2.5">
            {(
              [
                [t("estimatedBar"), estimatedMin, "bg-border-strong"],
                [t("actualBar"), actualMin, "bg-fit"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold tabular-nums text-fg">{formatMinutes(value)}</span>
                </div>
                <div className="mt-1 h-2.5 rounded-pill bg-border">
                  <div
                    className={cn("h-full rounded-pill transition-[width] duration-500", tone)}
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Well>
      )}
    </aside>
  );
}

/** A soft, custom dropdown to pick the task you're focusing on — with the
 *  category's color dot, time estimate and a check on the active one. */
function TaskPicker({
  tasks,
  channels,
  value,
  onChange,
}: {
  tasks: Task[];
  channels: Channel[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("focus");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const selected = tasks.find((t) => t.id === value);
  const colorFor = (channelId: string | null) =>
    channels.find((c) => c.id === channelId)?.color ?? "var(--color-subtle)";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("pickTask")}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-pill px-4 py-2.5 text-left text-sm text-bg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
          open ? "bg-bg/20" : "bg-bg/10 hover:bg-bg/15",
        )}
      >
        {selected ? (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(selected.channel_id) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-semibold">{selected.title}</span>
            {selected.time_estimate_min && (
              <span className="shrink-0 text-xs font-medium text-bg/60">
                {formatMinutes(selected.time_estimate_min)}
              </span>
            )}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-bg/75">{t("pickTaskPrompt")}</span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-bg/60 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 origin-top overflow-y-auto rounded-xl bg-surface p-1 text-fg shadow-pop"
          >
            <li role="option" aria-selected={!value}>
              <button
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  !value ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2",
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{t("noTask")}</span>
                {!value && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </button>
            </li>

            {tasks.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-subtle">{t("noTasksToday")}</li>
            )}

            {tasks.map((t) => {
              const active = t.id === value;
              return (
                <li key={t.id} role="option" aria-selected={active}>
                  <button
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      active ? "bg-primary-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorFor(t.channel_id) }}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        active ? "font-medium text-primary" : "text-fg",
                      )}
                    >
                      {t.title}
                    </span>
                    {t.time_estimate_min && (
                      <span className="shrink-0 text-xs font-medium text-subtle">
                        {formatMinutes(t.time_estimate_min)}
                      </span>
                    )}
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
