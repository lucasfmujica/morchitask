/**
 * A failed mutation reaches the toast from the query client itself, unless the
 * mutation opts out because its screen shows its own error.
 */
import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { OWN_ERROR_UI } from "@/lib/mutation-errors";
import { useToastStore } from "@/lib/stores/toast";
import { Providers } from "./providers";

function Failing({ ownError = false }: { ownError?: boolean }) {
  const m = useMutation({
    ...(ownError ? OWN_ERROR_UI : {}),
    mutationFn: async () => {
      throw new Error("db down");
    },
  });
  const { mutate } = m;
  useEffect(() => mutate(), [mutate]);
  return <span>{m.status}</span>;
}

beforeEach(() => {
  useToastStore.setState({ toast: null, saveFailedMessage: "No se guardó. Probá de nuevo." });
});

describe("mutation errors", () => {
  it("toast 'didn't save' when a mutation fails", async () => {
    const { findByText } = render(
      <Providers>
        <Failing />
      </Providers>,
    );
    await findByText("error");
    expect(useToastStore.getState().toast?.message).toBe("No se guardó. Probá de nuevo.");
  });

  it("stay quiet for a mutation that shows its own error", async () => {
    const { findByText } = render(
      <Providers>
        <Failing ownError />
      </Providers>,
    );
    await findByText("error");
    await waitFor(() => expect(useToastStore.getState().toast).toBeNull());
  });
});
