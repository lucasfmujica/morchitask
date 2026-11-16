"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { changeMyTimeZone } from "@/lib/actions/timezone";
import { syncBlockCalendar } from "@/lib/queries/calendar";

/**
 * Changes the signed-in person's timezone and brings the screen along.
 *
 * The zone reaches every component through the layout's provider, which is
 * rendered on the server, so the change only shows once that tree is asked for
 * again (`router.refresh`). Everything cached was computed for the old zone's
 * days, so it is all thrown out. Blocks that have a Google Calendar event are
 * pushed with their new times; a calendar hiccup must not undo the change, so
 * those are fire-and-forget like every other calendar sync.
 */
export function useChangeTimeZone() {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  function change(zone: string, onDone?: () => void) {
    setFailed(false);
    start(async () => {
      try {
        const res = await changeMyTimeZone(zone);
        for (const blockId of res.resync) {
          syncBlockCalendar({ action: "upsert", blockId }).catch(() => {});
        }
        await qc.invalidateQueries();
        router.refresh();
        onDone?.();
      } catch {
        setFailed(true);
      }
    });
  }

  return { change, pending, failed };
}
