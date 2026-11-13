/**
 * The Calendar link when Google has revoked it, and which events the app is
 * allowed to delete.
 *
 * A dead refresh token used to be a 502 forever: the profile kept saying
 * "connected", so Settings never offered to reconnect and every calendar view
 * kept failing. And the delete path used to take any event id the browser
 * sent. Both are pinned here with Google's HTTP API mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getGoogleRefreshToken = vi.fn();
const disconnectGoogleCalendar = vi.fn();
vi.mock("@/lib/db/queries/google", () => ({ getGoogleRefreshToken, disconnectGoogleCalendar }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" }, householdId: "h1" }) }));
vi.mock("@/lib/db/queries/profiles", () => ({ partnerEmail: vi.fn() }));
vi.mock("@/lib/db/queries/task-blocks", () => ({
  blockForCalendarSync: vi.fn(),
  setBlockCalendarEvent: vi.fn(),
}));

const { calendarAccessFailure, calendarAccessToken, deleteCalendarEvents } =
  await import("./google-calendar");
const { POST: calendarPOST } = await import("@/app/api/calendar/route");
const { POST: blocksPOST } = await import("@/app/api/calendar/blocks/route");

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  getGoogleRefreshToken.mockResolvedValue("refresh-1");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const request = (body: unknown) =>
  new Request("https://app.test/api", { method: "POST", body: JSON.stringify(body) });

describe("a revoked Google grant", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(json({ error: "invalid_grant" }, 400));
  });

  it("disconnects the calendar for that person, and only that person", async () => {
    await expect(calendarAccessToken("u1")).resolves.toEqual({ ok: false, reason: "reconnect" });
    expect(disconnectGoogleCalendar).toHaveBeenCalledWith("u1");
  });

  it("answers the events route with 409 reconnect, not a 502", async () => {
    const res = await calendarPOST(request({}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "reconnect", reconnect: true });
  });

  it("answers the block sync route with the same 409", async () => {
    const res = await blocksPOST(request({ action: "upsert", blockId: "b1" }));
    expect(res.status).toBe(409);
  });
});

describe("a refresh that fails for another reason", () => {
  it("keeps the connection: Google having a bad moment is not a revoke", async () => {
    fetchMock.mockResolvedValue(json({ error: "internal_failure" }, 500));
    await expect(calendarAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "refresh_failed",
    });
    expect(disconnectGoogleCalendar).not.toHaveBeenCalled();
    expect(calendarAccessFailure("refresh_failed").status).toBe(502);
  });
});

describe("deleting calendar events", () => {
  it("is not something the browser can ask for by event id any more", async () => {
    const res = await blocksPOST(request({ action: "delete", eventId: "someone-elses-event" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes exactly the ids it is given, from the person's primary calendar", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("oauth2") ? json({ access_token: "at" }) : new Response(null, { status: 204 }),
    );
    await deleteCalendarEvents("u1", ["evt_1"]);
    const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toContain("/calendars/primary/events/evt_1?");
  });

  it("does nothing for someone who is not connected", async () => {
    getGoogleRefreshToken.mockResolvedValue(null);
    await deleteCalendarEvents("u1", ["evt_1"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
