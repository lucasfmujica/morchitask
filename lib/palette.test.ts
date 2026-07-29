import { describe, it, expect } from "vitest";
import {
  buildPaletteItems,
  fuzzyMatch,
  normalize,
  MAX_RECENTS,
  MAX_TASK_RESULTS,
  type ActionMeta,
} from "./palette";
import type { Task } from "./queries/types";

function task(id: string, title: string, status: "todo" | "done" = "todo"): Task {
  return { id, title, status } as unknown as Task;
}

const NOOP = () => {};
function action(id: string, label: string): ActionMeta {
  return { id, label, run: NOOP };
}

describe("normalize", () => {
  it("lowercases", () => {
    expect(normalize("Reunión SEMANAL")).toBe("reunion semanal");
  });

  it("strips diacritics in both directions", () => {
    // The whole point: the app is in Spanish, so accents must not gate matching.
    expect(normalize("mamá")).toBe(normalize("mama"));
    expect(normalize("revisión")).toBe(normalize("revision"));
    expect(normalize("Peña")).toBe(normalize("pena"));
  });

  it("leaves unaccented text alone", () => {
    expect(normalize("backlog")).toBe("backlog");
  });
});

describe("fuzzyMatch", () => {
  it("returns null when there is no match", () => {
    expect(fuzzyMatch("Comprar pan", "zzz")).toBeNull();
  });

  it("matches across accents in both directions", () => {
    expect(fuzzyMatch("Llamar a mamá", "mama")).not.toBeNull();
    expect(fuzzyMatch("Llamar a mama", "mamá")).not.toBeNull();
    expect(fuzzyMatch("Revisión de código", "revision")).not.toBeNull();
  });

  it("scores a prefix above a word start above a mid-word substring", () => {
    const prefix = fuzzyMatch("luz de la cocina", "luz")!.score;
    const wordStart = fuzzyMatch("Pagar luz", "luz")!.score;
    const midWord = fuzzyMatch("Andaluzia", "luz")!.score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("scores a contiguous substring above a scattered subsequence", () => {
    const contiguous = fuzzyMatch("xx pan yy", "pan")!.score;
    const scattered = fuzzyMatch("xpxaxnx", "pan")!.score;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("prefers the shorter text when the tier is the same", () => {
    const short = fuzzyMatch("Pagar luz", "luz")!.score;
    const long = fuzzyMatch("Pagar luz del departamento de arriba ya mismo", "luz")!.score;
    expect(short).toBeGreaterThan(long);
  });

  it("never lets the length bonus outrank a stronger tier", () => {
    // A long prefix match must still beat a short mid-word match.
    const longPrefix = fuzzyMatch("luz " + "x".repeat(200), "luz")!.score;
    const shortMidWord = fuzzyMatch("aluz", "luz")!.score;
    expect(longPrefix).toBeGreaterThan(shortMidWord);
  });

  it("returns ranges that index into the ORIGINAL accented string", () => {
    const match = fuzzyMatch("Llamar a mamá hoy", "mama")!;
    const [start, end] = match.ranges[0];
    expect("Llamar a mamá hoy".slice(start, end)).toBe("mamá");
  });

  it("returns ordered, non-overlapping ranges", () => {
    const match = fuzzyMatch("xpxaxnx", "pan")!;
    for (let i = 1; i < match.ranges.length; i++) {
      expect(match.ranges[i][0]).toBeGreaterThanOrEqual(match.ranges[i - 1][1]);
    }
    for (const [start, end] of match.ranges) expect(end).toBeGreaterThan(start);
  });

  it("treats an empty query as a match with no highlight", () => {
    expect(fuzzyMatch("cualquier cosa", "   ")).toEqual({ score: 0, ranges: [] });
  });
});

describe("buildPaletteItems", () => {
  const actions = [action("today", "Ir a Hoy"), action("week", "Ir a Semana")];

  it("keeps the flat index in the same order as the rendered sections", () => {
    // This is the invariant that makes arrow-key navigation correct: `flat` is
    // what the selection indexes into, sections are what the user sees.
    const { sections, flat } = buildPaletteItems({
      query: "a",
      actions,
      tasks: [task("t1", "Pagar agua"), task("t2", "Llamar")],
      recents: [],
    });
    expect(flat).toEqual(sections.flatMap((s) => s.items));
    expect(flat.map((i) => i.id)).toEqual(sections.flatMap((s) => s.items.map((i) => i.id)));
  });

  it("shows recents then actions when the query is empty", () => {
    const { sections } = buildPaletteItems({
      query: "",
      actions,
      tasks: [task("t1", "irrelevante")],
      recents: [task("r1", "Lo último")],
    });
    expect(sections.map((s) => s.id)).toEqual(["recents", "actions"]);
  });

  it("omits the recents section when there are none", () => {
    const { sections } = buildPaletteItems({ query: "", actions, tasks: [], recents: [] });
    expect(sections.map((s) => s.id)).toEqual(["actions"]);
  });

  it("caps recents", () => {
    const recents = Array.from({ length: 20 }, (_, i) => task(`r${i}`, `Reciente ${i}`));
    const { sections } = buildPaletteItems({ query: "", actions, tasks: [], recents });
    expect(sections[0].items).toHaveLength(MAX_RECENTS);
  });

  it("puts tasks before actions when searching", () => {
    const { sections } = buildPaletteItems({
      query: "seman",
      actions,
      tasks: [task("t1", "Planificar la semana")],
      recents: [],
    });
    expect(sections.map((s) => s.id)).toEqual(["tasks", "actions", "create"]);
  });

  it("caps task results", () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task(`t${i}`, `Tarea ${i}`));
    const { sections } = buildPaletteItems({ query: "tarea", actions, tasks, recents: [] });
    expect(sections[0].items).toHaveLength(MAX_TASK_RESULTS);
  });

  it("ranks task results by score", () => {
    const { flat } = buildPaletteItems({
      query: "luz",
      actions: [],
      tasks: [task("mid", "Andaluzia"), task("prefix", "luz del patio")],
      recents: [],
    });
    expect(flat[0].id).toBe("prefix");
  });

  it("puts a pending task above an equally-matching finished one", () => {
    // A planner searches for what's left to do; four done tasks burying the one
    // pending hit is backwards.
    const { flat } = buildPaletteItems({
      query: "ropa",
      actions: [],
      tasks: [
        task("hecha", "Guardar ropa limpia", "done"),
        task("pendiente", "Guardar ropa sucia"),
      ],
      recents: [],
    });
    expect(flat[0].id).toBe("pendiente");
  });

  it("still lets a clearly better match win despite being done", () => {
    const { flat } = buildPaletteItems({
      query: "ropa",
      actions: [],
      tasks: [
        task("pendiente", "Poner lavarropas"), // mid-word
        task("hecha", "Ropa blanca", "done"), // prefix — two tiers stronger
      ],
      recents: [],
    });
    expect(flat[0].id).toBe("hecha");
  });

  it("drops tasks that do not match", () => {
    const { sections } = buildPaletteItems({
      query: "zzz",
      actions,
      tasks: [task("t1", "Comprar pan")],
      recents: [],
    });
    expect(sections.map((s) => s.id)).toEqual(["create"]);
  });

  it("always puts the create row last so Enter on a partial view name navigates", () => {
    const { flat } = buildPaletteItems({
      query: "sema",
      actions,
      tasks: [task("t1", "Semana de descanso")],
      recents: [],
    });
    expect(flat[flat.length - 1]).toMatchObject({ kind: "create", title: "sema" });
    expect(flat.findIndex((i) => i.kind === "action")).toBeLessThan(flat.length - 1);
  });

  it("never shows the create row on an empty query", () => {
    const { flat } = buildPaletteItems({ query: "   ", actions, tasks: [], recents: [] });
    expect(flat.some((i) => i.kind === "create")).toBe(false);
  });

  it("carries highlight ranges through to task items", () => {
    const { flat } = buildPaletteItems({
      query: "mama",
      actions: [],
      tasks: [task("t1", "Llamar a mamá")],
      recents: [],
    });
    const item = flat[0];
    expect(item.kind).toBe("task");
    if (item.kind === "task") {
      const [start, end] = item.ranges[0];
      expect("Llamar a mamá".slice(start, end)).toBe("mamá");
    }
  });

  it("finds accented tasks from an unaccented query end to end", () => {
    const { sections } = buildPaletteItems({
      query: "revision",
      actions: [],
      tasks: [task("t1", "Revisión del contrato")],
      recents: [],
    });
    expect(sections[0].items.map((i) => i.id)).toEqual(["t1"]);
  });
});
