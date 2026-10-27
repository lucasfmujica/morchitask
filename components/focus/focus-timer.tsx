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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-7">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
          {(["focus", "break"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "cursor-pointer rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
              )}
            >
              {m === "focus" ? tnav("focus") : t("break")}
            </button>
          ))}
        </div>

        <div className="relative grid place-items-center">
          <svg
            viewBox="0 0 280 280"
            className="h-[226px] w-[226px] -rotate-90 lg:h-[220px] lg:w-[220px]"
          >
            <circle
              cx="140"
              cy="140"
              r={R}
              fill="none"
              stroke="var(--color-surface-2)"
              strokeWidth="12"
            />
            <circle
              cx="140"
              cy="140"
              r={R}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute flex flex-col items-center gap-1">
            <span className="text-[42px] leading-none font-extrabold tabular-nums tracking-tight text-fg">
              {mmss(secondsLeft)}
            </span>
            <span className="text-sm text-muted">{status}</span>
            {mode === "focus" && (
              <span className="mt-1 rounded-pill bg-surface-2 px-2.5 py-0.5 text-2xs font-semibold text-muted">
                {t("blockOf", {
                  n: Math.min(completed + 1, BLOCKS_PER_SET),
                  total: BLOCKS_PER_SET,
                })}
              </span>
            )}
          </div>
        </div>

        {/* The task you're on, as a card rather than a bare dropdown — with the
            rail, the category and how far the block has got you against your
            own estimate. */}
        {mode === "focus" && (
          <div className="mx-auto w-full max-w-xs">
            <TaskPicker tasks={tasks} channels={channels} value={taskId} onChange={setTaskId} />
            {selected && (
              <div className="relative mt-2 overflow-hidden rounded-card border border-primary bg-surface px-3.5 py-2.5 shadow-soft">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-[3px]",
                    !selectedChannel && "bg-border",
                  )}
                  style={selectedChannel ? { background: selectedChannel.color } : undefined}
                  aria-hidden
                />
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                    {selected.title}
                  </span>
                  {selectedChannel && (
                    <span className="shrink-0 text-2xs text-muted">#{selectedChannel.name}</span>
                  )}
                </div>
                <TaskProgress task={selected} />
              </div>
            )}
          </div>
        )}

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center justify-self-end rounded-full border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={t("reset")}
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={toggleRun}
            className="inline-flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-card transition-colors hover:bg-primary-hover"
            aria-label={running ? t("pause") : t("start")}
          >
            {running ? (
              <Pause className="h-7 w-7" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-7 w-7" aria-hidden />
            )}
          </button>
          {/* You used to have to leave the timer, find the card and tick it. */}
          <button
            onClick={finishTask}
            disabled={!selected}
            aria-label={t("finishTask")}
            title={t("finishTask")}
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 justify-self-start rounded-full border border-border px-3.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-default disabled:opacity-40"
          >
            <Check className="h-4 w-4" aria-hidden />
            {t("finish")}
          </button>
        </div>

        {/* The set, as four bars. A count in prose made you read a sentence to
            learn something a shape says instantly. */}
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: BLOCKS_PER_SET }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-5 rounded-pill",
                  i < completed ? "bg-primary" : "bg-border-strong/60",
                )}
              />
            ))}
          </span>
          <span className="text-2xs font-semibold tabular-nums text-muted">
            {t("setProgress", { done: completed, total: BLOCKS_PER_SET })}
          </span>
        </div>

        {/* Lives inside the timer's column, not beside it: the sound follows
            the block, and centred on the page it sat off the ring's axis. */}
        <FocusAudioPanel />
      </div>

      <FocusSidebar tasks={tasks} activeId={taskId} onPick={setTaskId} channels={channels} />
    </div>
  );
}

/** How far the day's tracked time has got you against your own estimate. */
function TaskProgress({ task }: { task: Task }) {
  const t = useTranslations("focus");
  const actual = task.actual_time_min ?? 0;
  const estimate = task.time_estimate_min;
  if (!estimate) {
    return (
      <p className="mt-1.5 text-2xs text-subtle">
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
            className={cn("h-[3px] w-2.5 rounded-pill", i < filled ? "bg-primary" : "bg-surface-2")}
          />
        ))}
      </span>
      <span className="text-2xs tabular-nums text-muted">
        {t("workedOfEstimate", {
          actual: formatMinutes(actual),
          estimate: formatMinutes(estimate),
        })}
      </span>
    </div>
  );
}

/**
 * The queue beside the timer: what's next, and how today's estimates are
 * holding up. Both answer "should I keep going?" without leaving the page.
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
    <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
      <section className="rounded-2xl border border-border bg-surface p-3.5 shadow-soft">
        <h2 className="text-xs font-bold text-fg">{t("queue")}</h2>
        {tasks.length === 0 ? (
          <p className="mt-2 text-2xs text-subtle">{t("queueEmpty")}</p>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {tasks.slice(0, 6).map((t) => {
              const channel = channels.find((c) => c.id === t.channel_id);
              const active = t.id === activeId;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onPick(t.id)}
                    className={cn(
                      "relative flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-xl border py-2 pr-2.5 pl-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
                      style={channel ? { background: channel.color } : undefined}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">{t.title}</span>
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
      </section>

      {(estimatedMin > 0 || actualMin > 0) && (
        <section className="rounded-2xl border border-border bg-surface p-3.5 shadow-soft">
          <h2 className="text-xs font-bold text-fg">{t("estimateVsActual")}</h2>
          <div className="mt-2.5 flex flex-col gap-2">
            {(
              [
                [t("estimatedBar"), estimatedMin, "bg-primary/45"],
                [t("actualBar"), actualMin, "bg-primary"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between gap-2 text-2xs">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold tabular-nums text-fg">{formatMinutes(value)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-pill bg-surface-2">
                  <div
                    className={cn("h-full rounded-pill", tone)}
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
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
          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-left text-sm shadow-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
          open ? "border-primary" : "border-border hover:bg-surface-2",
        )}
      >
        {selected ? (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(selected.channel_id) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-fg">{selected.title}</span>
            {selected.time_estimate_min && (
              <span className="shrink-0 text-xs font-medium text-subtle">
                {formatMinutes(selected.time_estimate_min)}
              </span>
            )}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">{t("pickTaskPrompt")}</span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
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
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 origin-top overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card"
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
