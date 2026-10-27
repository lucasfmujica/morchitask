import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "./quick-add";

// 2026-10-27 is a Tuesday.
const TODAY = "2026-10-27";
const channels = [
  { id: "c-casa", name: "Casa" },
  { id: "c-trabajo", name: "Trabajo freelance" },
  { id: "c-salud", name: "Salud" },
  { id: "c-salidas", name: "Salidas" },
];
const parse = (text: string, ignore?: Parameters<typeof parseQuickAdd>[1]["ignore"]) =>
  parseQuickAdd(text, { today: TODAY, channels, ignore });

describe("parseQuickAdd — the full sentence", () => {
  it("pulls every field out and leaves a clean title", () => {
    const r = parse("pagar la luz mañana 18hs 30m !alta #casa");
    expect(r).toMatchObject({
      title: "pagar la luz",
      plannedDate: "2026-10-28",
      time: "18:00",
      estimateMin: 30,
      priority: "high",
      channelId: "c-casa",
    });
    expect(r.matches.map((m) => [m.kind, m.text])).toEqual([
      ["date", "mañana"],
      ["time", "18hs"],
      ["estimate", "30m"],
      ["priority", "!alta"],
      ["channel", "#casa"],
    ]);
  });

  it("returns the text untouched when there's nothing to parse", () => {
    expect(parse("llamar a mamá")).toEqual({ title: "llamar a mamá", matches: [] });
  });
});

describe("dates", () => {
  it("reads hoy / mañana / pasado mañana", () => {
    expect(parse("x hoy").plannedDate).toBe("2026-10-27");
    expect(parse("x mañana").plannedDate).toBe("2026-10-28");
    expect(parse("x manana").plannedDate).toBe("2026-10-28");
    expect(parse("x Mañana").plannedDate).toBe("2026-10-28");
    const r = parse("x pasado mañana");
    expect(r.plannedDate).toBe("2026-10-29");
    expect(r.title).toBe("x");
  });

  it("sends a weekday to its next occurrence, never today", () => {
    expect(parse("x viernes").plannedDate).toBe("2026-10-30");
    expect(parse("x el lunes").plannedDate).toBe("2026-11-02");
    expect(parse("x el lunes").title).toBe("x");
    expect(parse("x martes").plannedDate).toBe("2026-11-03"); // today is Tuesday
    expect(parse("x miércoles").plannedDate).toBe("2026-10-28");
    expect(parse("x sabado").plannedDate).toBe("2026-10-31");
    expect(parse("x este domingo").plannedDate).toBe("2026-11-01");
  });

  it("reads 15/11, rolling a past date into next year", () => {
    expect(parse("x 15/11").plannedDate).toBe("2026-11-15");
    expect(parse("x 3/2").plannedDate).toBe("2027-02-03");
    expect(parse("x 27/10").plannedDate).toBe("2026-10-27");
    expect(parse("x 5/1/2028").plannedDate).toBe("2028-01-05");
    expect(parse("x 31/2").plannedDate).toBeUndefined();
    expect(parse("x 12/13").plannedDate).toBeUndefined();
  });

  it("reads 'el 15' as the next 15th, today included", () => {
    expect(parse("pagar alquiler el 15").plannedDate).toBe("2026-11-15");
    expect(parse("pagar alquiler el 15").title).toBe("pagar alquiler");
    expect(parse("x el 27").plannedDate).toBe("2026-10-27");
    expect(parse("x el 31").plannedDate).toBe("2026-10-31");
    expect(parse("x el 40").plannedDate).toBeUndefined();
  });

  it("takes only the first date", () => {
    const r = parse("mover lo de hoy a mañana");
    expect(r.plannedDate).toBe("2026-10-27");
    expect(r.title).toBe("mover lo de a mañana");
  });
});

describe("times", () => {
  it("reads 18hs, 18 hs, 18:30, a las 9, 9am / 9pm", () => {
    expect(parse("x 18hs").time).toBe("18:00");
    expect(parse("x 18 hs").time).toBe("18:00");
    expect(parse("x 18:30").time).toBe("18:30");
    expect(parse("x 18:30hs").time).toBe("18:30");
    expect(parse("x a las 9").time).toBe("09:00");
    expect(parse("x a las 9").title).toBe("x");
    expect(parse("x a las 21:15").time).toBe("21:15");
    expect(parse("x a la 1").time).toBe("01:00");
    expect(parse("x a las 9 pm").time).toBe("21:00");
    expect(parse("x 9am").time).toBe("09:00");
    expect(parse("x 9pm").time).toBe("21:00");
    expect(parse("x 9:30pm").time).toBe("21:30");
    expect(parse("x 12am").time).toBe("00:00");
    expect(parse("x 12pm").time).toBe("12:00");
  });

  it("rejects impossible clocks", () => {
    expect(parse("x 25hs").time).toBeUndefined();
    expect(parse("x 18:75").time).toBeUndefined();
    expect(parse("x 13pm").time).toBeUndefined();
    expect(parse("x a las 30").time).toBeUndefined();
  });
});

describe("estimates", () => {
  it("reads a duration only when it carries a unit", () => {
    expect(parse("x 30m").estimateMin).toBe(30);
    expect(parse("x 45min").estimateMin).toBe(45);
    expect(parse("x 1h").estimateMin).toBe(60);
    expect(parse("x 1.5h").estimateMin).toBe(90);
    expect(parse("x 1,5h").estimateMin).toBe(90);
    expect(parse("x 1h30").estimateMin).toBe(90);
    expect(parse("x 2h15m").estimateMin).toBe(135);
    expect(parse("x 1h 30m").estimateMin).toBe(90);
    expect(parse("x 1h 30m").title).toBe("x");
    expect(parse("x 20 min").estimateMin).toBe(20);
    expect(parse("x 2 horas").estimateMin).toBe(120);
  });

  it("treats a bare '18h' as a duration, not a time", () => {
    const r = parse("x 18h");
    expect(r.time).toBeUndefined();
    expect(r.estimateMin).toBe(1080);
  });
});

describe("priority and category", () => {
  it("reads !alta / !media / !baja", () => {
    expect(parse("x !alta").priority).toBe("high");
    expect(parse("x !Media").priority).toBe("medium");
    expect(parse("x !baja").priority).toBe("low");
    expect(parse("x !urgente").priority).toBeUndefined();
    expect(parse("x !urgente").title).toBe("x !urgente");
  });

  it("matches #name against categories, accent/case/space-insensitively", () => {
    expect(parse("x #Casa").channelId).toBe("c-casa");
    expect(parse("x #trabajofreelance").channelId).toBe("c-trabajo");
    expect(parse("x #trab").channelId).toBe("c-trabajo"); // unique prefix
    expect(parse("x #sal").channelId).toBeUndefined(); // Salud or Salidas?
    expect(parse("x #salud").channelId).toBe("c-salud");
  });

  it("leaves an unknown #tag in the title", () => {
    const r = parse("comprar #regalo");
    expect(r.channelId).toBeUndefined();
    expect(r.title).toBe("comprar #regalo");
  });
});

describe("no false positives", () => {
  it("ignores words that only contain a keyword", () => {
    expect(parse("tapar el hoyo").plannedDate).toBeUndefined();
    expect(parse("desayuno mañanero").plannedDate).toBeUndefined();
    expect(parse("lunesita").plannedDate).toBeUndefined();
  });

  it("reads 'a la mañana' as the morning, not tomorrow", () => {
    expect(parse("ir al gym a la mañana").plannedDate).toBeUndefined();
    expect(parse("ir al gym esta mañana").plannedDate).toBeUndefined();
    expect(parse("ir al gym a la mañana").title).toBe("ir al gym a la mañana");
  });

  it("never turns a bare number into an estimate or a time", () => {
    const r = parse("pagar 500 pesos");
    expect(r.estimateMin).toBeUndefined();
    expect(r.time).toBeUndefined();
    expect(r.title).toBe("pagar 500 pesos");
    expect(parse("comprar 2 kilos de pan").matches).toEqual([]);
    expect(parse("leer 3 capítulos").matches).toEqual([]);
  });

  it("keeps an 'el' that isn't followed by a date", () => {
    expect(parse("lavar el auto").title).toBe("lavar el auto");
  });
});

describe("ignore", () => {
  it("leaves an ignored kind's text in the title", () => {
    const r = parse("ver Mañana tropical 21hs", ["date"]);
    expect(r.plannedDate).toBeUndefined();
    expect(r.time).toBe("21:00");
    expect(r.title).toBe("ver Mañana tropical");
  });
});
