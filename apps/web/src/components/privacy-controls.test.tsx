import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrivacy } from "../lib/privacy";
import { PrivacyControls } from "./privacy-controls";

vi.mock("../lib/privacy", () => ({ usePrivacy: vi.fn() }));

const usePrivacyMock = vi.mocked(usePrivacy);

describe("privacy controls", () => {
  beforeEach(() => usePrivacyMock.mockReset());
  afterEach(cleanup);

  it("offers equally direct accept-all and reject actions", () => {
    const savePreferences = vi.fn();
    renderControls({ savePreferences });

    expect(screen.getByRole("heading", { name: "Help make Mimorii better" })).toBeInTheDocument();
    expect(screen.getByText(/find friction, fix issues faster/i)).toBeVisible();
    expect(screen.getByText(/masked interaction replays/i)).toBeVisible();

    const reject = screen.getByRole("button", { name: "Reject" });
    const accept = screen.getByRole("button", { name: "Accept all" });
    expect(reject).toBeEnabled();
    expect(accept).toBeEnabled();
    expect(reject.className).toBe(accept.className);

    fireEvent.click(reject);
    expect(savePreferences).toHaveBeenLastCalledWith({
      analytics: false,
      sessionReplay: false,
    });

    fireEvent.click(accept);
    expect(savePreferences).toHaveBeenLastCalledWith({
      analytics: true,
      sessionReplay: true,
    });
  });

  it("accepts only configured optional categories", () => {
    const savePreferences = vi.fn();
    renderControls({ savePreferences, sessionReplayConfigured: false });

    expect(screen.queryByText(/masked interaction replays/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));

    expect(savePreferences).toHaveBeenCalledWith({
      analytics: true,
      sessionReplay: false,
    });
  });

  it("opens granular settings from the undecided state", () => {
    const setSettingsOpen = vi.fn();
    renderControls({ setSettingsOpen });

    fireEvent.click(screen.getByRole("button", { name: "Choose settings" }));

    expect(setSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("keeps session replay separate and dependent on analytics", () => {
    const savePreferences = vi.fn();
    const setSettingsOpen = vi.fn();
    renderControls({ savePreferences, setSettingsOpen, settingsOpen: true });

    const requiredStorage = screen.getByRole("switch", { name: "Required storage" });
    const analytics = screen.getByRole("switch", { name: "Usage analytics" });
    const sessionReplay = screen.getByRole("switch", { name: "Session replay" });

    expect(requiredStorage).toBeChecked();
    expect(requiredStorage).toBeDisabled();
    expect(analytics).not.toBeChecked();
    expect(sessionReplay).not.toBeChecked();
    expect(sessionReplay).toBeDisabled();
    expect(screen.getByText(/requires usage analytics/i)).toBeVisible();

    fireEvent.click(analytics);
    expect(sessionReplay).toBeEnabled();
    fireEvent.click(sessionReplay);
    expect(sessionReplay).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(savePreferences).toHaveBeenCalledWith({ analytics: true, sessionReplay: true });
    expect(setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("clears replay when analytics is withdrawn", () => {
    const savePreferences = vi.fn();
    renderControls({
      preferences: storedPreferences(true, true),
      savePreferences,
      settingsOpen: true,
    });

    const analytics = screen.getByRole("switch", { name: "Usage analytics" });
    const sessionReplay = screen.getByRole("switch", { name: "Session replay" });
    expect(sessionReplay).toBeChecked();

    fireEvent.click(analytics);
    expect(sessionReplay).not.toBeChecked();
    expect(sessionReplay).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(savePreferences).toHaveBeenCalledWith({
      analytics: false,
      sessionReplay: false,
    });
  });

  it("withdraws every optional choice in one action", () => {
    const savePreferences = vi.fn();
    const setSettingsOpen = vi.fn();
    renderControls({
      preferences: storedPreferences(true, true),
      savePreferences,
      setSettingsOpen,
      settingsOpen: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Reject optional" }));

    expect(savePreferences).toHaveBeenCalledWith({
      analytics: false,
      sessionReplay: false,
    });
    expect(setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("renders no controls when analytics is not configured", () => {
    const { container } = renderControls({ analyticsConfigured: false });

    expect(container).toBeEmptyDOMElement();
  });
});

function renderControls(overrides: Partial<ReturnType<typeof usePrivacy>> = {}) {
  usePrivacyMock.mockReturnValue({
    preferences: null,
    analyticsConfigured: true,
    sessionReplayConfigured: true,
    settingsOpen: false,
    setSettingsOpen: vi.fn(),
    savePreferences: vi.fn(),
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <PrivacyControls />
    </MemoryRouter>
  );
}

function storedPreferences(analytics: boolean, sessionReplay: boolean) {
  return {
    version: 1 as const,
    analytics,
    sessionReplay,
    decidedAt: "2026-08-13T00:00:00.000Z",
  };
}
