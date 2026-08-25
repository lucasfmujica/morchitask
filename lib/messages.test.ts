/**
 * The catalogs must have exactly the same keys.
 *
 * A key present in Spanish but missing in English does not throw — next-intl
 * renders the key itself, so the screen quietly reads "settings.title" instead
 * of a word. That is invisible in review and obvious to a user, which is the
 * worst way round.
 */
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

/** Flattens {a: {b: "x"}} to ["a.b"], so a whole missing namespace shows up. */
function keysOf(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const esKeys = keysOf(es).sort();
const enKeys = keysOf(en).sort();

describe("message catalogs", () => {
  it("have identical keys", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("have no empty values, which would render as blank UI", () => {
    for (const [name, cat] of [
      ["es", es],
      ["en", en],
    ] as const) {
      const entries = Object.entries(cat).flatMap(([ns, group]) =>
        Object.entries(group as Record<string, string>).map(([k, v]) => [`${name}.${ns}.${k}`, v]),
      );
      for (const [path, value] of entries) expect(value, path).not.toBe("");
    }
  });

  it("is not empty — this test is worthless if the catalogs are", () => {
    expect(esKeys.length).toBeGreaterThan(20);
  });
});
