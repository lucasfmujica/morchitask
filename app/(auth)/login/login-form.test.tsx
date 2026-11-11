import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { withIntl } from "@/test/intl";
import { LoginForm } from "./login-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("LoginForm", () => {
  // The redesign once rendered the label twice inside the button, so the only
  // way in read "Continuar con Google Continuar con Google" in production.
  it("names the sign-in button exactly once", () => {
    render(withIntl(<LoginForm />));
    const button = screen.getByRole("button");
    expect(button.textContent?.trim()).toBe("Continuar con Google");
  });
});
