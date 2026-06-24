import { describe, it, expect } from "vitest";
import { offsetFromRemindAt, remindAtFromBlock, reminderOffsetLabel } from "./reminders";

const BLOCK = "2026-06-24T12:00:00.000Z";

describe("remindAtFromBlock", () => {
  it("at start = the block start itself", () => {
    expect(remindAtFromBlock(BLOCK, 0)).toBe("2026-06-24T12:00:00.000Z");
  });
  it("subtracts the offset minutes", () => {
    expect(remindAtFromBlock(BLOCK, 15)).toBe("2026-06-24T11:45:00.000Z");
    expect(remindAtFromBlock(BLOCK, 30)).toBe("2026-06-24T11:30:00.000Z");
  });
});

describe("offsetFromRemindAt", () => {
  it("recovers the offset that produced a remind_at", () => {
    const remind = remindAtFromBlock(BLOCK, 15);
    expect(offsetFromRemindAt(BLOCK, remind)).toBe(15);
    expect(offsetFromRemindAt(BLOCK, BLOCK)).toBe(0);
  });
  it("is null when block or remind is missing", () => {
    expect(offsetFromRemindAt(null, BLOCK)).toBeNull();
    expect(offsetFromRemindAt(BLOCK, null)).toBeNull();
  });
});

describe("reminderOffsetLabel", () => {
  it("labels the presets in Spanish", () => {
    expect(reminderOffsetLabel(0)).toBe("Al empezar");
    expect(reminderOffsetLabel(5)).toBe("5 min antes");
  });
});
