/**
 * Deleting a block removes its calendar event, using the id stored on our own
 * row. The browser no longer names the event: it used to, and the route
 * deleted whatever id it was sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteBlockRow = vi.fn();
const deleteCalendarEvents = vi.fn();

vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/actions/session", () => ({
  requireSession: async () => ({ householdId: "h1", userId: "u1" }),
  requireWriteAccess: async () => ({ householdId: "h1", userId: "u1" }),
}));
vi.mock("@/lib/db/queries/task-blocks", () => ({ deleteBlock: deleteBlockRow }));
vi.mock("@/lib/google-calendar", () => ({ deleteCalendarEvents }));

const { deleteBlock } = await import("./task-blocks");

beforeEach(() => vi.clearAllMocks());

describe("deleteBlock", () => {
  it("deletes the event the household's own block row pointed at", async () => {
    deleteBlockRow.mockResolvedValue("evt_from_our_row");
    await deleteBlock("b1");
    expect(deleteBlockRow).toHaveBeenCalledWith("h1", "u1", "b1");
    expect(deleteCalendarEvents).toHaveBeenCalledWith("u1", ["evt_from_our_row"]);
  });

  it("touches no calendar when the block had no event, or was not ours", async () => {
    deleteBlockRow.mockResolvedValue(null);
    await deleteBlock("b1");
    expect(deleteCalendarEvents).not.toHaveBeenCalled();
  });
});
