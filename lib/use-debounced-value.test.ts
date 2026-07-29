import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hola", 200));
    expect(result.current).toBe("hola");
  });

  it("holds the old value until the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: "a" },
    });

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => void vi.advanceTimersByTime(199));
    expect(result.current).toBe("a");

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe("ab");
  });

  it("only emits the last value of a burst (trailing edge)", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: "r" },
    });

    // Typing "reunion" one character at a time, faster than the delay.
    for (const value of ["re", "reu", "reun", "reuni", "reunio", "reunion"]) {
      rerender({ value });
      act(() => void vi.advanceTimersByTime(50));
    }
    // Still the original — no intermediate value ever escaped.
    expect(result.current).toBe("r");

    act(() => void vi.advanceTimersByTime(200));
    expect(result.current).toBe("reunion");
  });

  it("cancels the pending timer on unmount", () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    unmount();
    // No "update on unmounted component" fallout when the timer would have fired.
    expect(() => act(() => void vi.advanceTimersByTime(500))).not.toThrow();
  });
});
