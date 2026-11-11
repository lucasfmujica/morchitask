import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "@/lib/queries/types";
import { withIntl } from "@/test/intl";

const parseDictation = vi.fn();
const createTask = vi.fn();

vi.mock("@/lib/actions/ai", () => ({
  parseDictation: (...a: unknown[]) => parseDictation(...a),
}));
vi.mock("@/lib/queries/tasks", () => ({
  taskKeys: { date: (d: string) => ["tasks", "date", d], backlog: ["tasks", "backlog"] },
  useCreateTask: () => ({ mutate: createTask }),
}));
vi.mock("@/lib/queries/task-blocks", () => ({ useCreateBlockOnDay: () => ({ mutate: vi.fn() }) }));
vi.mock("@/lib/queries/profiles", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/lib/queries/calendar", () => ({ syncBlockCalendar: vi.fn() }));

const { CaptureSheet } = await import("./capture-sheet");

const channels = [{ id: "c-casa", name: "Casa", color: "#0d9488" }] as Channel[];

function renderSheet() {
  const qc = new QueryClient();
  const onOpenChange = vi.fn();
  render(
    withIntl(
      <QueryClientProvider client={qc}>
        <CaptureSheet
          viewDate="2026-11-11"
          channels={channels}
          viewTasks={[]}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  );
  return { onOpenChange };
}

describe("CaptureSheet", () => {
  beforeEach(() => {
    parseDictation.mockReset();
    createTask.mockReset();
  });

  it("is a labelled modal dialog", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Decilo de corrido" })).toBeInTheDocument();
  });

  // The action can throw outright (offline phone, a 500). It used to leave the
  // sheet on "Leyendo…" forever; now it falls back to splitting by phrases.
  it("falls back to the phrase splitter when the action throws", async () => {
    parseDictation.mockRejectedValue(new Error("Failed to fetch"));
    renderSheet();
    await userEvent.type(
      screen.getByLabelText(/decí o escribí todo junto/i),
      "pagar la luz. llamar al plomero",
    );
    await userEvent.click(screen.getByRole("button", { name: "Separar en tareas" }));

    expect(await screen.findByText(/las separé por frases/i)).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Título de la tarea" })).toHaveLength(2);
  });

  it("creates what you edited and skips what you unticked", async () => {
    parseDictation.mockResolvedValue({
      ok: true,
      data: [
        { title: "Llamar al contdor", plannedDate: null, time: null, estimateMin: 30 },
        { title: "Comprar regalo", plannedDate: null, time: null, estimateMin: null },
      ],
    });
    const { onOpenChange } = renderSheet();
    await userEvent.type(screen.getByLabelText(/decí o escribí todo junto/i), "algo");
    await userEvent.click(screen.getByRole("button", { name: "Separar en tareas" }));

    const [first] = await screen.findAllByRole("textbox", { name: "Título de la tarea" });
    await userEvent.clear(first);
    await userEvent.type(first, "Llamar al contador");
    const untick = screen.getByRole("button", { name: "Incluir «Comprar regalo»" });
    expect(untick).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(untick);
    expect(untick).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Crear 1 tarea" }));
    expect(createTask).toHaveBeenCalledOnce();
    expect(createTask.mock.calls[0][0]).toMatchObject({
      title: "Llamar al contador",
      plannedDate: "2026-11-11",
      timeEstimateMin: 30,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
