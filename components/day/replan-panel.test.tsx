import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { withIntl } from "@/test/intl";

const moveTask = vi.fn();
vi.mock("@/lib/queries/tasks", () => ({ useMoveTaskToDate: () => ({ mutate: moveTask }) }));
// The agenda's scheduling hook module also exports the pure minute helpers the
// panel uses; its query imports reach the server actions, so stub those.
vi.mock("@/lib/queries/profiles", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/lib/queries/task-blocks", () => ({}));
vi.mock("@/lib/queries/calendar", () => ({}));

const { ReplanPanel } = await import("./replan-panel");

const DATE = "2026-11-11";
const ME = "u-me";
const task = (id: string, title: string, extra: Partial<Task> = {}) =>
  ({
    id,
    title,
    owner_id: ME,
    status: "todo",
    priority: null,
    sort_order: 1000,
    channel_id: null,
    time_estimate_min: null,
    ...extra,
  }) as Task;
// Buenos Aires is UTC-3 all year.
const block = (id: string, taskId: string, from: string, to: string) =>
  ({
    id,
    task_id: taskId,
    start_at: `${DATE}T${from}:00-03:00`,
    end_at: `${DATE}T${to}:00-03:00`,
  }) as TaskBlock;

function renderPanel(tasks: Task[], blocks: Map<string, TaskBlock[]>, endMin = 19 * 60) {
  const moveBlock = vi.fn();
  const onClose = vi.fn();
  render(
    withIntl(
      <ReplanPanel
        date={DATE}
        tasks={tasks}
        blocksByTask={blocks}
        calendarEvents={[]}
        nowMin={14 * 60 + 10}
        endMin={endMin}
        meId={ME}
        moveBlock={moveBlock}
        scheduleNewBlock={vi.fn()}
        toneFor={() => "bg-agenda-1"}
        onClose={onClose}
      />,
    ),
  );
  return { moveBlock, onClose };
}

describe("ReplanPanel", () => {
  beforeEach(() => moveTask.mockReset());

  it("moves what fell behind to from now on, only after confirming", async () => {
    const brief = task("t1", "Revisar brief");
    const b1 = block("b1", "t1", "12:00", "12:45");
    const { moveBlock, onClose } = renderPanel([brief], new Map([["t1", [b1]]]));

    expect(screen.getByRole("dialog", { name: "Reacomodar el resto del día" })).toBeInTheDocument();
    expect(screen.getByText("14:15")).toBeInTheDocument();
    expect(moveBlock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Listo, así queda" }));
    expect(moveBlock).toHaveBeenCalledWith(b1, 14 * 60 + 15);
    expect(onClose).toHaveBeenCalled();
  });

  it("Deshacer shows the day as it stands and offers to replan again", async () => {
    const brief = task("t1", "Revisar brief");
    const { moveBlock } = renderPanel(
      [brief],
      new Map([["t1", [block("b1", "t1", "12:00", "12:45")]]]),
    );
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.getByText("Se pasó")).toBeInTheDocument();
    expect(screen.getByText("Cómo lo reacomoda")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reacomodar desde ahora" }));
    expect(screen.getByRole("button", { name: "Listo, así queda" })).toBeInTheDocument();
    expect(moveBlock).not.toHaveBeenCalled();
  });

  // The header button used to open a panel that rendered null when nothing
  // was movable: you pressed it and nothing happened.
  it("still answers when there's nothing to move", async () => {
    const done = task("t1", "Llamar", { status: "done" });
    const { onClose } = renderPanel(
      [done],
      new Map([["t1", [block("b1", "t1", "09:00", "09:30")]]]),
    );
    expect(screen.getByText("Ya está todo en su lugar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo, así queda" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("parks what doesn't fit where you said", async () => {
    // Two hours of work, 45 minutes of day left: the whole task is stranded.
    const big = task("t2", "Facturar");
    renderPanel([big], new Map([["t2", [block("b2", "t2", "10:00", "12:00")]]]), 15 * 60);

    const group = screen.getByRole("group", { name: "Qué hacer con Facturar" });
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Backlog" }));
    expect(screen.getByRole("button", { name: "Backlog" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Listo, así queda" }));
    expect(moveTask).toHaveBeenCalledWith(expect.objectContaining({ task: big, toDate: null }));
  });
});
