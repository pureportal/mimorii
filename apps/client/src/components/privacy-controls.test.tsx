import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocalizedDocument } from "../lib/locale";
import { usePrivacy } from "../lib/privacy";
import { PrivacyControls } from "./privacy-controls";

vi.mock("../lib/privacy", () => ({ usePrivacy: vi.fn() }));

const usePrivacyMock = vi.mocked(usePrivacy);

describe("privacy controls", () => {
  beforeEach(() => {
    usePrivacyMock.mockReset();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("offers equally direct accept and reject actions", () => {
    const savePreferences = vi.fn();
    renderControls({ savePreferences });

    expect(screen.getByRole("heading", { name: "Help make Mimorii better" })).toBeInTheDocument();
    expect(screen.getByText(/find friction and fix issues faster/i)).toBeVisible();

    const reject = screen.getByRole("button", { name: "Reject" });
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(reject).toBeEnabled();
    expect(accept).toBeEnabled();
    expect(reject.className).toBe(accept.className);

    fireEvent.click(reject);
    expect(savePreferences).toHaveBeenLastCalledWith(false);

    fireEvent.click(accept);
    expect(savePreferences).toHaveBeenLastCalledWith(true);
  });

  it("opens settings from the undecided state", () => {
    const setSettingsOpen = vi.fn();
    renderControls({ setSettingsOpen });

    fireEvent.click(screen.getByRole("button", { name: "Choose settings" }));

    expect(setSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("saves the analytics choice from settings", () => {
    const savePreferences = vi.fn();
    const setSettingsOpen = vi.fn();
    renderControls({ savePreferences, setSettingsOpen, settingsOpen: true });

    const requiredStorage = screen.getByRole("switch", { name: "Required storage" });
    const analytics = screen.getByRole("switch", { name: "Usage analytics" });
    expect(requiredStorage).toBeChecked();
    expect(requiredStorage).toBeDisabled();
    expect(analytics).not.toBeChecked();

    fireEvent.click(analytics);
    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(savePreferences).toHaveBeenCalledWith(true);
    expect(setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("withdraws analytics in one action", () => {
    const savePreferences = vi.fn();
    const setSettingsOpen = vi.fn();
    renderControls({
      preferences: storedPreferences(true),
      savePreferences,
      setSettingsOpen,
      settingsOpen: true,
    });

    expect(screen.getByRole("switch", { name: "Usage analytics" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Reject optional" }));

    expect(savePreferences).toHaveBeenCalledWith(false);
    expect(setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("follows the German language of a localized page", () => {
    window.localStorage.setItem("mimorii.locale", "de");
    const savePreferences = vi.fn();
    renderControls({ savePreferences }, { localizedPage: true });

    expect(
      screen.getByRole("heading", { name: "Helfen Sie, Mimorii zu verbessern" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Akzeptieren" }));
    expect(savePreferences).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Ablehnen" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });

  it("shows German settings on a localized page", () => {
    window.localStorage.setItem("mimorii.locale", "de");
    renderControls({ settingsOpen: true }, { localizedPage: true });

    expect(screen.getByRole("dialog", { name: "Datenschutzeinstellungen" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Nutzungsanalyse" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Auswahl speichern" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeInTheDocument();
  });

  it("stays English outside localized pages", () => {
    window.localStorage.setItem("mimorii.locale", "de");
    renderControls();

    expect(screen.getByRole("heading", { name: "Help make Mimorii better" })).toBeInTheDocument();
  });

  it("renders no controls when analytics is not configured", () => {
    const { container } = renderControls({ analyticsConfigured: false });

    expect(container).toBeEmptyDOMElement();
  });
});

function LocalizedPage() {
  useLocalizedDocument();
  return null;
}

function renderControls(
  overrides: Partial<ReturnType<typeof usePrivacy>> = {},
  { localizedPage = false } = {}
) {
  usePrivacyMock.mockReturnValue({
    preferences: null,
    analyticsConfigured: true,
    settingsOpen: false,
    setSettingsOpen: vi.fn(),
    savePreferences: vi.fn(),
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <LocaleProvider>
        {localizedPage ? <LocalizedPage /> : null}
        <PrivacyControls />
      </LocaleProvider>
    </MemoryRouter>
  );
}

function storedPreferences(analytics: boolean) {
  return {
    version: 2 as const,
    analytics,
    decidedAt: "2026-08-13T00:00:00.000Z",
  };
}
