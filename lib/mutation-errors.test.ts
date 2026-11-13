import { describe, expect, it } from "vitest";
import { OWN_ERROR_UI, shouldToastMutationError } from "./mutation-errors";

describe("shouldToastMutationError", () => {
  it("toasts by default: a failed save used to vanish without a word", () => {
    expect(shouldToastMutationError(undefined)).toBe(true);
    expect(shouldToastMutationError({})).toBe(true);
  });

  it("stays quiet for a mutation whose screen shows its own error", () => {
    expect(shouldToastMutationError(OWN_ERROR_UI.meta)).toBe(false);
  });
});
