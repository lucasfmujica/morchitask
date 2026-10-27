import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is mocked wholesale: these tests check what we send and how we
// handle what comes back, never the network.
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    messages = { parse };
  }
  return { default: Anthropic };
});
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: () => ({ type: "json" }) }));

const { AiError, BREAKDOWN_MODEL, PLAN_MODEL, breakdownTask, planDay } = await import("./ai");
const { default: Anthropic } = await import("@anthropic-ai/sdk");

beforeEach(() => {
  parse.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("breakdownTask", () => {
  it("fails with not_configured when the key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(breakdownTask({ title: "Mudanza", existing: [] })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it("asks Haiku and returns the cleaned items", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { items: ["1. Pedir presupuestos", "Embalar libros", "embalar libros"] },
    });
    const items = await breakdownTask({
      title: "Mudanza",
      notes: "Antes del 15",
      existing: ["Embalar libros"],
    });
    expect(items).toEqual(["Pedir presupuestos"]);
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe(BREAKDOWN_MODEL);
    expect(req.messages[0].content).toContain("Antes del 15");
    expect(req.messages[0].content).toContain("- Embalar libros");
  });

  it("maps a refusal or an unparsed answer to no_answer", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(breakdownTask({ title: "x", existing: [] })).rejects.toBeInstanceOf(AiError);
  });

  it("maps a bad key to not_configured and other API errors to api", async () => {
    parse.mockRejectedValueOnce(Object.create(Anthropic.AuthenticationError.prototype));
    await expect(breakdownTask({ title: "x", existing: [] })).rejects.toMatchObject({
      code: "not_configured",
    });
    parse.mockRejectedValueOnce(Object.create(Anthropic.APIError.prototype));
    await expect(breakdownTask({ title: "x", existing: [] })).rejects.toMatchObject({
      code: "api",
    });
  });
});

describe("planDay", () => {
  const input = {
    date: "2026-10-27",
    tasks: [
      { id: "a", title: "Informe", remainingMin: 60 },
      { id: "b", title: "Mails", remainingMin: 30 },
    ],
    busy: [{ startMin: 600, endMin: 660 }],
    fromMin: 540,
    toMin: 1080,
    capacityLeftMin: 300,
  };

  it("asks Sonnet and returns only non-overlapping blocks", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: {
        blocks: [
          { task: 0, start: "09:30", durationMin: 60 }, // runs into the 10:00 meeting
          { task: 1, start: "11:00", durationMin: 30 },
        ],
        note: "Informe primero.",
      },
    });
    const res = await planDay(input);
    expect(parse.mock.calls[0][0].model).toBe(PLAN_MODEL);
    expect(parse.mock.calls[0][0].messages[0].content).toContain("10:00–11:00");
    expect(res.blocks).toEqual([
      { taskId: "a", startMin: 660, endMin: 720 },
      { taskId: "b", startMin: 720, endMin: 750 },
    ]);
  });

  it("doesn't call Claude when nothing is left to schedule", async () => {
    const res = await planDay({ ...input, tasks: [{ id: "a", title: "x", remainingMin: 0 }] });
    expect(res.blocks).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });
});
