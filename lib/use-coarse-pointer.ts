import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * True on touch-first devices (phones/tablets). Hydration-safe via
 * useSyncExternalStore — returns false on the server and first paint. Used to
 * enable touch-only affordances like swipe-to-complete.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
