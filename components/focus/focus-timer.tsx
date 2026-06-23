"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pause, Play, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { taskKeys, useTasksForDate } from "@/lib/queries/tasks";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

type Mode = "focus" | "break";
const DURATION: Record<Mode, number> = { focus: 25 * 60, break: 5 * 60 };

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** A short chime + a system notification when a focus block ends (best-effort). */
function notifyFocusDone() {
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
    new Notification("¡Bloque de foco completado! 🍅", {
      body: "Tomate un respiro de 5 minutos.",
    });
  }
}

export function FocusTimer() {
  const qc = useQueryClient();
  const today = todayISO();
  const tasksQ = useTasksForDate(today);
  const tasks = (tasksQ.data ?? []).filter((t) => t.status === "todo");

  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(DURATION.focus);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string>("");
  const [completed, setCompleted] = useState(0);

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
      notifyFocusDone();
    }
    if (mode === "focus" && taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        const supabase = createClient();
        supabase
          .from("tasks")
          .update({ actual_time_min: (task.actual_time_min ?? 0) + DURATION.focus / 60 })
          .eq("id", task.id)
          .then(() => qc.invalidateQueries({ queryKey: taskKeys.date(today) }));
      }
    }
  }, [secondsLeft, running, mode, taskId, tasks, qc, today]);

  function toggleRun() {
    // Ask once, when the user first starts a block, so the end chime can notify.
    if (!running && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setRunning((r) => !r);
  }
  function switchMode(m: Mode) {
    setMode(m);
    setSecondsLeft(DURATION[m]);
    setRunning(false);
  }
  function reset() {
    setSecondsLeft(DURATION[mode]);
    setRunning(false);
  }

  const total = DURATION[mode];
  const progress = 1 - secondsLeft / total;
  const R = 120;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-7 py-8">
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
            {m === "focus" ? "Foco" : "Descanso"}
          </button>
        ))}
      </div>

      <div className="relative grid place-items-center">
        <svg viewBox="0 0 280 280" className="h-64 w-64 -rotate-90">
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
        <div className="absolute flex flex-col items-center">
          <span className="text-5xl font-extrabold tabular-nums tracking-tight text-fg">
            {mmss(secondsLeft)}
          </span>
          <span className="mt-1 text-sm text-muted">
            {mode === "focus" ? "Concentrate" : "Respirá"}
          </span>
        </div>
      </div>

      {mode === "focus" && (
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          aria-label="Tarea en la que te concentrás"
          className="w-full max-w-xs cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <option value="">¿En qué te concentrás? (opcional)</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={toggleRun}
          className="inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-card transition-colors hover:bg-primary-hover"
          aria-label={running ? "Pausar" : "Empezar"}
        >
          {running ? (
            <Pause className="h-6 w-6" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-6 w-6" aria-hidden />
          )}
        </button>
        <button
          onClick={reset}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Reiniciar"
        >
          <RotateCcw className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {completed > 0 && (
        <p className="text-sm text-muted">
          Completaste <span className="font-semibold text-fg">{completed}</span>{" "}
          {completed === 1 ? "bloque" : "bloques"} de foco
        </p>
      )}
    </div>
  );
}
