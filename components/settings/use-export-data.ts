"use client";

import { useState, useTransition } from "react";
import { exportMyData } from "@/lib/actions/account";

/**
 * Downloading your data, from wherever it is offered: the danger zone in
 * Settings and the locked billing screen, which promises it still works
 * without a plan.
 */
export function useExportMyData() {
  const [exporting, startExport] = useTransition();
  const [failed, setFailed] = useState(false);

  function run() {
    setFailed(false);
    startExport(async () => {
      try {
        const payload = await exportMyData();
        // Built in the browser rather than served from a route: the data is
        // already here, and a download endpoint would be one more authenticated
        // surface to get wrong.
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `morchitask-${payload.exported_at.slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setFailed(true);
      }
    });
  }

  return { exporting, failed, run };
}
