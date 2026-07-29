"use client";

import { useEffect, useState } from "react";

/**
 * Trailing-edge debounce for a changing value.
 *
 * Used by the ⌘K palette so typing "reunion" fires one search request instead
 * of seven. Trailing-only on purpose: the first keystroke of a word is never
 * a query worth sending.
 */
export function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
