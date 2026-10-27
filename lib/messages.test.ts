/**
 * The catalogs must have exactly the same keys.
 *
 * A key present in Spanish but missing in English does not throw — next-intl
 * renders the key itself, so the screen quietly reads "settings.title" instead
 * of a word. That is invisible in review and obvious to a user, which is the
 * worst way round.
 */
import { describe, expect, it } from "vitest";
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  parse,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { PRIORITY_GROUPS, priorityLabelKey } from "@/lib/priority";
import { REMINDER_OFFSETS, reminderOffsetLabelKey } from "@/lib/reminders";
import { MAX_ATTACHMENT_BYTES, rejectionKey } from "@/lib/attachments";

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

  /**
   * The two catalogs must agree on placeholder NAMES, not just on keys.
   *
   * `t("wouldWeigh", { day, planned, capacity })` fills whatever the message
   * asks for. If Spanish says `{planned}` and English says `{amount}`, the
   * English screen renders the literal text "{amount}" — no error, no warning,
   * just a curly brace where a number should be. Same for the tags `t.rich`
   * fills: a `<b>` in one language and `<strong>` in the other throws at
   * render time, and only on that language.
   *
   * Parsed with the real ICU parser rather than a regex. A regex cannot tell
   * an argument from prose that happens to sit inside a plural branch — the
   * Spanish carry-over message opens with "Che," and a pattern looking for
   * `{name,` reads that as an argument called `Che`.
   */
  it("uses the same placeholders and tags in both languages", () => {
    const collect = (nodes: MessageFormatElement[], args: Set<string>, tags: Set<string>) => {
      for (const node of nodes) {
        if (isArgumentElement(node) || isNumberElement(node) || isDateElement(node)) {
          args.add(node.value);
        } else if (isPluralElement(node) || isSelectElement(node)) {
          args.add(node.value);
          for (const option of Object.values(node.options)) {
            collect(option.value, args, tags);
          }
        } else if (isTagElement(node)) {
          tags.add(node.value);
          collect(node.children, args, tags);
        }
      }
    };
    const shapeOf = (message: string, path: string) => {
      const args = new Set<string>();
      const tags = new Set<string>();
      // A message that does not parse is a bug on its own — say which one.
      try {
        collect(parse(message), args, tags);
      } catch (e) {
        throw new Error(`${path} is not valid ICU: ${(e as Error).message}`);
      }
      return { args: [...args].sort(), tags: [...tags].sort() };
    };

    const flat = (obj: Record<string, unknown>, prefix = ""): [string, string][] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v as Record<string, unknown>, `${prefix}${k}.`)
          : [[`${prefix}${k}`, String(v)] as [string, string]],
      );
    const enByKey = new Map(flat(en));

    for (const [key, esMessage] of flat(es)) {
      const enMessage = enByKey.get(key);
      if (enMessage === undefined) continue; // the key test above owns this
      const esShape = shapeOf(esMessage, `es.${key}`);
      const enShape = shapeOf(enMessage, `en.${key}`);
      expect(enShape.args, `${key} placeholders`).toEqual(esShape.args);
      expect(enShape.tags, `${key} tags`).toEqual(esShape.tags);
    }
  });

  /**
   * Several `lib` modules hand out catalog keys instead of words, so nothing in
   * the type system connects the two. A rename on either side would surface
   * only as the literal string "priorityHigh" appearing in the UI.
   */
  it("has an entry for every key lib/priority hands out", () => {
    for (const priority of [...PRIORITY_GROUPS]) {
      const key = `tasks.${priorityLabelKey(priority)}`;
      expect(esKeys, `es is missing ${key}`).toContain(key);
      expect(enKeys, `en is missing ${key}`).toContain(key);
    }
  });

  it("has an entry for every key lib/reminders hands out", () => {
    for (const offset of [...REMINDER_OFFSETS]) {
      const key = `tasks.${reminderOffsetLabelKey(offset)}`;
      expect(esKeys, `es is missing ${key}`).toContain(key);
      expect(enKeys, `en is missing ${key}`).toContain(key);
    }
  });

  it("has an entry for every rejection lib/attachments hands out", () => {
    const files = [
      { type: "application/x-msdownload", size: 10 },
      { type: "image/png", size: MAX_ATTACHMENT_BYTES + 1 },
      { type: "image/png", size: 0 },
    ];
    for (const file of files) {
      const key = `tasks.${rejectionKey(file)}`;
      expect(esKeys, `es is missing ${key}`).toContain(key);
      expect(enKeys, `en is missing ${key}`).toContain(key);
    }
  });
});
