import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Channel } from "@/lib/queries/types";
import { withIntl } from "@/test/intl";
import { TaskComposer } from "./task-composer";

const channels = [
  { id: "c-casa", name: "Casa", color: "#0d9488" },
  { id: "c-trabajo", name: "Trabajo", color: "#6366f1" },
] as Channel[];

function setup() {
  const onSubmit = vi.fn();
  render(withIntl(<TaskComposer channels={channels} onSubmit={onSubmit} />));
  return { onSubmit, input: screen.getByRole("textbox", { name: "Nueva tarea" }) };
}

describe("TaskComposer — quick add", () => {
  beforeEach(() => {
    // Tuesday 27 Oct 2026, midday in Buenos Aires. Only Date is faked so
    // user-event's timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("previews what the text will set and submits it", async () => {
    const { onSubmit, input } = setup();
    await userEvent.type(input, "pagar la luz mañana 18hs 30m !alta #casa");

    for (const label of ["Mañana", "18:00", "30m", "Alta", "Casa"]) {
      expect(screen.getByRole("button", { name: `Ignorar ${label}` })).toBeInTheDocument();
    }

    await userEvent.type(input, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({
      title: "pagar la luz",
      plannedDate: "2026-10-28",
      time: "18:00",
      timeEstimateMin: 30,
      priority: "high",
      channelId: "c-casa",
    });
    expect(input).toHaveValue("");
  });

  it("× keeps the words in the title instead", async () => {
    const { onSubmit, input } = setup();
    await userEvent.type(input, "ver Mañana tropical 21hs");
    await userEvent.click(screen.getByRole("button", { name: "Ignorar Mañana" }));
    expect(screen.queryByRole("button", { name: "Ignorar Mañana" })).not.toBeInTheDocument();

    await userEvent.type(input, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "ver Mañana tropical", time: "21:00" }),
    );
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("plannedDate");
  });

  it("a manual priority chip beats !alta once touched", async () => {
    const { onSubmit, input } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Categoría y prioridad" }));
    await userEvent.click(screen.getByRole("button", { name: "Baja" }));
    await userEvent.type(input, "llamar !alta");
    expect(screen.queryByRole("button", { name: "Ignorar Alta" })).not.toBeInTheDocument();

    await userEvent.type(input, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "llamar", priority: "low" }),
    );
  });

  it("uses the raw words when nothing but a date was typed", async () => {
    const { onSubmit, input } = setup();
    await userEvent.type(input, "mañana{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({
      title: "mañana",
      channelId: null,
      timeEstimateMin: null,
      priority: null,
    });
  });
});
