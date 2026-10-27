/**
 * The point of this component is that it is hard to fire by accident.
 *
 * That is a claim about state, not about looks, and it is the kind of thing
 * that breaks quietly: a refactor that stops resetting the typed word, or a
 * `disabled` that turns into a no-op, leaves a delete button that looks
 * guarded and isn't. So the gate is asserted from the outside — type the wrong
 * thing, the action never runs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withIntl } from "@/test/intl";

const exportMyData = vi.fn();
const deleteMyAccount = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/actions/account", () => ({
  exportMyData: (...a: unknown[]) => exportMyData(...a),
  deleteMyAccount: (...a: unknown[]) => deleteMyAccount(...a),
}));
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

const { DangerZone } = await import("./danger-zone");

const renderZone = () => render(withIntl(<DangerZone />));

beforeEach(() => {
  vi.clearAllMocks();
  deleteMyAccount.mockResolvedValue(undefined);
  exportMyData.mockResolvedValue({ exported_at: "2026-08-26T10:00:00.000Z", tasks: [] });
});

describe("export", () => {
  it("hands the browser a file named for the day it was taken", async () => {
    // jsdom has no object URLs and no real navigation — stubbing both is what
    // lets the click be followed all the way to the download attribute.
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {});

    renderZone();
    await userEvent.click(screen.getByRole("button", { name: /descargar/i }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("morchitask-2026-08-26.json");

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("says so when the file can't be built, instead of failing silently", async () => {
    exportMyData.mockRejectedValue(new Error("boom"));
    renderZone();
    await userEvent.click(screen.getByRole("button", { name: /descargar/i }));
    expect(await screen.findByText(/no se pudo generar/i)).toBeInTheDocument();
  });
});

describe("delete", () => {
  const openConfirm = async () => {
    renderZone();
    await userEvent.click(screen.getByRole("button", { name: /^borrar cuenta$/i }));
    return screen.getByRole("textbox", { name: /confirmación/i });
  };

  it("does not delete until the word is typed", async () => {
    const input = await openConfirm();
    const confirm = screen.getByRole("button", { name: /para siempre/i });

    expect(confirm).toBeDisabled();
    await userEvent.type(input, "borra");
    expect(confirm).toBeDisabled();

    await userEvent.type(input, "r");
    expect(confirm).toBeEnabled();
  });

  it("deletes and then ends the session, in that order", async () => {
    const input = await openConfirm();
    await userEvent.type(input, "BORRAR");
    await userEvent.click(screen.getByRole("button", { name: /para siempre/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(deleteMyAccount).toHaveBeenCalledOnce();
    expect(deleteMyAccount.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("keeps the session when the delete fails", async () => {
    deleteMyAccount.mockRejectedValue(new Error("boom"));
    const input = await openConfirm();
    await userEvent.type(input, "BORRAR");
    await userEvent.click(screen.getByRole("button", { name: /para siempre/i }));

    expect(await screen.findByText(/no se pudo borrar/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("forgets what was typed after cancelling", async () => {
    const input = await openConfirm();
    await userEvent.type(input, "BORRAR");
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await userEvent.click(screen.getByRole("button", { name: /^borrar cuenta$/i }));

    expect(screen.getByRole("textbox", { name: /confirmación/i })).toHaveValue("");
    expect(screen.getByRole("button", { name: /para siempre/i })).toBeDisabled();
  });
});
