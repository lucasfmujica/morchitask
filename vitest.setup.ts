import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node 22 defines its own `globalThis.localStorage` that stays undefined without
// --localstorage-file, shadowing the one jsdom puts on `window`. Zustand's
// persist middleware reads the global, so give it a real in-memory store —
// otherwise any test touching a persisted store throws on setItem.
if (!globalThis.localStorage) {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, String(v)),
      removeItem: (k: string) => void memory.delete(k),
      clear: () => memory.clear(),
      key: (i: number) => [...memory.keys()][i] ?? null,
      get length() {
        return memory.size;
      },
    } satisfies Storage,
  });
}

afterEach(() => {
  cleanup();
});
