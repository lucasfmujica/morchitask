"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
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
  const reduce = useReducedMotion();

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
  const R = 130;
  const C = 2 * Math.PI * R;
  const selected = tasks.find((t) => t.id === taskId);
  const status = running
    ? mode === "focus"
      ? t("statusFocus")
      : t("statusBreak")
    : secondsLeft < total
      ? t("statusPaused")
      : t("statusIdle");
  const currentBlock = Math.min(completed, BLOCKS_PER_SET - 1);

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
    <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] lg:items-start">
      {/* The one dark tile on the page: the timer is the screen's single big
          number, so it gets the inverted hero card, as tall as the screen.
          Everything inside reads off `text-bg` tints, which flip with the card
          in dark mode. */}
      <section
        aria-label={t("timerLabel")}
        className="flex flex-col items-center gap-[22px] rounded-2xl bg-fg px-4 py-7 text-bg sm:px-7 lg:sticky lg:top-6 lg:min-h-[calc(100dvh-3rem)] lg:justify-center"
      >
        {/* The task you're on, as the chip over the ring. In a break there is
            no task to pick, so the chip steps aside. */}
        {mode === "focus" && (
          <TaskPicker tasks={tasks} channels={channels} value={taskId} onChange={setTaskId} />
        )}

        <div className="relative h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
          {/* A slow breath around the ring while a block runs: something alive
              on screen that isn't the seconds ticking. */}
          <motion.span
            aria-hidden
            className="absolute -inset-3.5 rounded-full border-[1.5px] border-fit-from"
            initial={false}
            animate={
              running && !reduce
                ? { scale: [1, 1.06, 1], opacity: [0.5, 0, 0.5] }
                : { scale: 1, opacity: 0.35 }
            }
            transition={
              running && !reduce
                ? { duration: 4, ease: "easeInOut", repeat: Infinity }
                : { duration: 0.3 }
            }
          />
          <svg viewBox="0 0 300 300" className="h-full w-full -rotate-90" aria-hidden>
            <defs>
              <linearGradient id="focus-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--color-fit-from)" />
                <stop offset="1" stopColor="var(--color-primary)" />
              </linearGradient>
            </defs>
            <circle
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke="var(--color-bg)"
              strokeOpacity={0.12}
              strokeWidth="16"
            />
            <circle
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke="url(#focus-ring)"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <span className="font-display text-[56px] leading-none font-bold tracking-tight tabular-nums sm:text-[68px]">
              {/* Digits stay tabular so the clock doesn't wobble each second,
                  but the display face's tabular colon is figure-wide ("25 : 00"),
                  so the colon alone goes back to proportional. */}
              {mmss(secondsLeft)
                .split(":")
                .map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="[font-variant-numeric:normal]">{":"}</span>}
                    {part}
                  </Fragment>
                ))}
            </span>
            <span className="text-sm text-bg/80">{status}</span>
          </div>
        </div>

        {/* The set, as four bars under its count: done, the one you're on,
            and what's left. */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-bg/60">
            {t("blockOf", { n: currentBlock + 1, total: BLOCKS_PER_SET })}
          </span>
          <span className="flex gap-1.5" aria-hidden>
            {Array.from({ length: BLOCKS_PER_SET }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-7 rounded-pill",
                  i < completed
                    ? "bg-fit"
                    : i === currentBlock && mode === "focus"
                      ? "bg-fit-from/45"
                      : "bg-bg/15",
                )}
              />
            ))}
          </span>
        </div>

        {/* flex-wrap, not a fixed grid: three pills side by side are ~370px, and
            an iPhone SE leaves the card less than that. */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-pill bg-bg/10 text-bg transition-colors hover:bg-bg/20"
            aria-label={t("reset")}
          >
            <RotateCcw className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            onClick={toggleRun}
            className="inline-flex h-16 min-w-40 cursor-pointer items-center justify-center rounded-pill bg-primary px-[34px] text-base font-bold text-on-primary shadow-[0_10px_30px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] transition-colors hover:bg-primary-hover"
          >
            {running ? t("pause") : t("start")}
          </button>
          {/* You used to have to leave the timer, find the card and tick it. */}
          <button
            onClick={finishTask}
            disabled={!selected}
            className="inline-flex h-[52px] cursor-pointer items-center rounded-pill bg-bg/10 px-[18px] text-sm font-semibold text-bg transition-colors hover:bg-bg/20 disabled:cursor-default disabled:opacity-40"
          >
            {t("finishTask")}
          </button>
        </div>

        {/* Focus or break. The canvas leaves this out, but a break is the other
            half of the method, so it stays: small, under the controls. */}
        <div className="flex gap-0.5 rounded-pill bg-bg/10 p-0.5">
          {(["focus", "break"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "cursor-pointer rounded-pill px-3 py-1 text-xs font-semibold transition-colors",
                mode === m ? "bg-bg/90 text-fg" : "text-bg/60 hover:text-bg",
              )}
            >
              {m === "focus" ? tnav("focus") : t("break")}
            </button>
          ))}
        </div>
      </section>

      <FocusSidebar tasks={tasks} activeId={taskId} onPick={setTaskId} />
    </div>
  );
}

/** "45m de 2h", or "Sin estimar": a task's tracked time against its estimate.
 *  `long` adds the trailing "estimated" for the chip, where there's room. */
function useTaskTime() {
  const t = useTranslations("focus");
  return (task: Task, long = false) => {
    const actual = task.actual_time_min ?? 0;
    const estimate = task.time_estimate_min;
    if (!estimate) {
      return actual > 0
        ? t("workedUnestimated", { time: formatMinutes(actual) })
        : t("unestimated");
    }
    const values = { actual: formatMinutes(actual), estimate: formatMinutes(estimate) };
    return long ? t("workedOfEstimate", values) : t("workedOf", values);
  };
}

/**
 * The column beside the timer: what's next, the background sound, and how
 * today's estimates are holding up. All answer "should I keep going?" without
 * leaving the page. On a phone they stack under the timer in this same order.
 */
function FocusSidebar({
  tasks,
  activeId,
  onPick,
}: {
  tasks: Task[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("focus");
  const taskTime = useTaskTime();
  const estimatedMin = tasks.reduce((sum, task) => sum + (task.time_estimate_min ?? 0), 0);
  const actualMin = tasks.reduce((sum, task) => sum + (task.actual_time_min ?? 0), 0);
  const max = Math.max(estimatedMin, actualMin, 1);

  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <Well className="flex flex-col gap-1.5">
        <h2 className="px-2.5 pt-2.5 pb-1 text-base font-semibold text-fg">{t("queue")}</h2>
        {tasks.length === 0 ? (
          <p className="px-2.5 pb-2 text-xs text-subtle">{t("queueEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.slice(0, 6).map((task) => {
              const active = task.id === activeId;
              const estimate = task.time_estimate_min ?? 0;
              const ratio = estimate ? Math.min(1, (task.actual_time_min ?? 0) / estimate) : 0;
              return (
                <li key={task.id}>
                  <button
                    onClick={() => onPick(task.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1.5 rounded-xl bg-surface px-3.5 py-2.5 text-left transition-shadow",
                      active ? "ring-2 ring-fit-from ring-inset" : "shadow-soft hover:shadow-card",
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                        {task.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                        {taskTime(task)}
                      </span>
                    </span>
                    <span className="block h-1 w-full overflow-hidden rounded-pill bg-surface-2">
                      <span
                        className="block h-full rounded-pill bg-fit transition-[width] duration-700"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Well>

      <FocusAudioPanel />

      {(estimatedMin > 0 || actualMin > 0) && (
        <Well className="flex flex-col gap-2.5 p-4">
          <h2 className="text-base font-semibold text-fg">{t("estimateVsActual")}</h2>
          {(
            [
              [t("estimatedBar"), estimatedMin, "bg-border-strong"],
              [t("actualBar"), actualMin, "bg-fit"],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted">{label}</span>
                <span className="font-mono text-fg tabular-nums">{formatMinutes(value)}</span>
              </div>
              <div className="h-2.5 rounded-pill bg-border">
                <div
                  className={cn("h-full rounded-pill transition-[width] duration-500", tone)}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
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
  const taskTime = useTaskTime();
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
    <div ref={ref} className="relative max-w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("pickTask")}
        className={cn(
          "flex max-w-full cursor-pointer items-center gap-2.5 rounded-pill py-1.5 pr-4 pl-1.5 text-left text-sm text-bg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
          open ? "bg-bg/20" : "bg-bg/10 hover:bg-bg/15",
        )}
      >
        {selected ? (
          <>
            {/* The category's initial on its colour: the rail of the task
                card, folded into the chip. */}
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: colorFor(selected.channel_id) }}
              aria-hidden
            >
              {channels
                .find((c) => c.id === selected.channel_id)
                ?.name.charAt(0)
                .toUpperCase()}
            </span>
            <span className="min-w-0 truncate font-semibold">{selected.title}</span>
            <span className="shrink-0 font-mono text-xs text-bg/60 tabular-nums">
              {taskTime(selected, true)}
            </span>
          </>
        ) : (
          <>
            <span className="h-[30px] w-[30px] shrink-0 rounded-full bg-bg/15" aria-hidden />
            <span className="min-w-0 truncate text-bg/75">{t("pickTaskPrompt")}</span>
          </>
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
            className="absolute left-1/2 z-20 mt-2 max-h-64 w-72 max-w-[calc(100vw-3rem)] -translate-x-1/2 origin-top overflow-y-auto rounded-xl bg-surface p-1 text-fg shadow-pop"
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
