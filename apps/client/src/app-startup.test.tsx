import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app";

vi.mock("./pages/auth-page", () => ({
  AuthPage: ({ mode, compact }: { mode: string; compact: boolean }) => (
    <h1>{`${mode}:${compact ? "compact" : "public"}`}</h1>
  ),
}));

describe("startup routing", () => {
  it("routes the Android Client root directly to compact authentication", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App runtime="android-client" />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "login:compact" })).toBeVisible();
    expect(screen.queryByText("Monitoring")).not.toBeInTheDocument();
  });
});
