import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listInvites = vi.fn();
const inviteToHousehold = vi.fn();
const revokeInvite = vi.fn();

vi.mock("@/lib/actions/invites", () => ({
  listInvites: (...a: unknown[]) => listInvites(...a),
  inviteToHousehold: (...a: unknown[]) => inviteToHousehold(...a),
  revokeInvite: (...a: unknown[]) => revokeInvite(...a),
}));

const { InviteCard } = await import("./invite-card");

const renderCard = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InviteCard />
    </QueryClientProvider>,
  );
};

const IN_A_WEEK = new Date(Date.now() + 7 * 86_400_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  listInvites.mockResolvedValue({ invites: [], members: 1, max: 2 });
});

describe("InviteCard", () => {
  it("sends the typed address and clears the field", async () => {
    const user = userEvent.setup();
    inviteToHousehold.mockResolvedValue({ id: "1", email: "sofi@example.com" });
    renderCard();

    const field = await screen.findByLabelText(/querés invitar/i);
    await user.type(field, "sofi@example.com");
    await user.click(screen.getByRole("button", { name: /invitar/i }));

    await waitFor(() => expect(inviteToHousehold).toHaveBeenCalledWith("sofi@example.com"));
    await waitFor(() => expect(field).toHaveValue(""));
  });

  it("shows the reason when the server refuses, instead of failing silently", async () => {
    const user = userEvent.setup();
    inviteToHousehold.mockRejectedValue(new Error("Tu espacio ya está completo."));
    renderCard();

    await user.type(await screen.findByLabelText(/querés invitar/i), "tercero@example.com");
    await user.click(screen.getByRole("button", { name: /invitar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu espacio ya está completo.");
  });

  it("lists a pending invite with the address and when it expires", async () => {
    listInvites.mockResolvedValue({
      invites: [{ id: "i1", email: "sofi@example.com", token: "tok", expires_at: IN_A_WEEK }],
      members: 1,
      max: 2,
    });
    renderCard();

    expect(await screen.findByText("sofi@example.com")).toBeInTheDocument();
    expect(screen.getByText(/vence el/i)).toBeInTheDocument();
  });

  it("hides the form once the space is full, so there is nothing to click", async () => {
    listInvites.mockResolvedValue({ invites: [], members: 2, max: 2 });
    renderCard();

    await screen.findByText(/ya está completo/i);
    expect(screen.queryByRole("button", { name: /^invitar$/i })).not.toBeInTheDocument();
  });

  it("hides the form while an invite is outstanding — one seat, one invite", async () => {
    listInvites.mockResolvedValue({
      invites: [{ id: "i1", email: "sofi@example.com", token: "tok", expires_at: IN_A_WEEK }],
      members: 1,
      max: 2,
    });
    renderCard();

    await screen.findByText("sofi@example.com");
    expect(screen.queryByRole("button", { name: /^invitar$/i })).not.toBeInTheDocument();
  });

  it("revokes the invite it was asked to revoke", async () => {
    const user = userEvent.setup();
    listInvites.mockResolvedValue({
      invites: [{ id: "i1", email: "sofi@example.com", token: "tok", expires_at: IN_A_WEEK }],
      members: 1,
      max: 2,
    });
    revokeInvite.mockResolvedValue(undefined);
    renderCard();

    await user.click(await screen.findByLabelText(/cancelar la invitación/i));
    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith("i1"));
  });
});
