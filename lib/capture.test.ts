import { describe, expect, it } from "vitest";
import { cleanCapture, splitDictation, CAPTURE_MAX_ITEMS, type CaptureOutput } from "./capture";

const today = "2026-11-11";
const channels = ["Trabajo", "Hogar", "Personal"];

function task(over: Partial<CaptureOutput["tasks"][number]>): CaptureOutput["tasks"][number] {
  return {
    title: "Algo",
    date: null,
    time: null,
    estimateMin: null,
    priority: null,
    category: null,
    ...over,
  };
}

describe("cleanCapture", () => {
  it("keeps valid fields and matches the category accent/case-blind", () => {
    const [t] = cleanCapture(
      {
        tasks: [
          task({
            title: "llamar al contador",
            date: "2026-11-12",
            time: "10:00",
            estimateMin: 30,
            priority: "high",
            category: "TRABAJO",
          }),
        ],
      },
      { today, channels },
    );
    expect(t).toEqual({
      title: "Llamar al contador",
      plannedDate: "2026-11-12",
      time: "10:00",
      estimateMin: 30,
      priority: "high",
      channelName: "Trabajo",
    });
  });

  it("nulls what it can't stand behind instead of dropping the task", () => {
    const [t] = cleanCapture(
      {
        tasks: [
          task({
            title: "x",
            date: "2026-11-01", // past
            time: "25:00",
            estimateMin: 2,
            category: "Facultad", // not one of theirs
          }),
        ],
      },
      { today, channels },
    );
    expect(t).toMatchObject({
      plannedDate: null,
      time: null,
      estimateMin: null,
      channelName: null,
    });
  });

  it("rejects a date more than a year out", () => {
    const [t] = cleanCapture({ tasks: [task({ date: "2028-01-01" })] }, { today, channels });
    expect(t.plannedDate).toBeNull();
  });

  it("drops blank titles and duplicates, and caps the count", () => {
    const many = Array.from({ length: 20 }, (_, i) => task({ title: `Tarea ${i}` }));
    const res = cleanCapture(
      {
        tasks: [task({ title: "  " }), task({ title: "Pagar" }), task({ title: "pagar" }), ...many],
      },
      { today, channels },
    );
    expect(res[0].title).toBe("Pagar");
    expect(res.filter((t) => t.title.toLowerCase() === "pagar")).toHaveLength(1);
    expect(res).toHaveLength(CAPTURE_MAX_ITEMS);
  });
});

describe("splitDictation", () => {
  const chans = [
    { id: "c1", name: "Trabajo" },
    { id: "c2", name: "casa" },
  ];

  it("splits on sentence breaks and parses each phrase with quick-add", () => {
    const res = splitDictation("pagar la luz mañana 30m #casa. Llamar a mamá; comprar pan", {
      today,
      channels: chans,
    });
    expect(res.map((t) => t.title)).toEqual(["Pagar la luz", "Llamar a mamá", "Comprar pan"]);
    expect(res[0]).toMatchObject({
      plannedDate: "2026-11-12",
      estimateMin: 30,
      channelName: "casa",
    });
  });

  it("splits on 'y después' and drops stray connectors", () => {
    const res = splitDictation("ir al banco y después hacer las compras", {
      today,
      channels: chans,
    });
    expect(res.map((t) => t.title)).toEqual(["Ir al banco", "Hacer las compras"]);
  });

  it("returns nothing for empty text", () => {
    expect(splitDictation("  . ; ", { today, channels: chans })).toEqual([]);
  });
});
