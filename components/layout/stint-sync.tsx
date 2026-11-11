"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncStint } from "@/lib/actions/stint";
import { taskKeys } from "@/lib/queries/tasks";
import { channelKeys } from "@/lib/queries/channels";

const MIN_GAP_MS = 60_000;

/**
 * Pulls Stint tasks when the app opens and whenever it comes back into view
 * (at most once a minute). Renders nothing. For anyone without the link the
 * server answers "nothing changed" right away, so this costs one cheap call.
 */
export function StintSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let last = 0;
    let running = false;
    async function run() {
      if (running || Date.now() - last < MIN_GAP_MS) return;
      running = true;
      last = Date.now();
      try {
        const r = await syncStint();
        if (r.ok && r.changed) {
          await qc.invalidateQueries({ queryKey: taskKeys.all });
          await qc.invalidateQueries({ queryKey: channelKeys.all });
        }
      } catch {
        // Offline or a deploy in between: the next focus tries again.
      } finally {
        running = false;
      }
    }
    void run();
    const onVisible = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [qc]);
  return null;
}
