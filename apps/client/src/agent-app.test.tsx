import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApp } from "./agent-app";
import { createAgentEnrollmentCode } from "./lib/agent-enrollment";
import type { MobileAgentState } from "./lib/mobile-agent";

const { collectNowMock, enrollMock, openSettingsMock, scanMock, stateMock, unenrollMock } =
  vi.hoisted(() => ({
    collectNowMock: vi.fn(),
    enrollMock: vi.fn(),
    openSettingsMock: vi.fn(),
    scanMock: vi.fn(),
    stateMock: vi.fn(),
    unenrollMock: vi.fn(),
  }));

vi.mock("./lib/mobile-agent", () => ({
  collectMobileStatusNow: collectNowMock,
  enrollMobileAgent: enrollMock,
  mobileAgentState: stateMock,
  openMobileAgentBackgroundSettings: openSettingsMock,
  unenrollMobileAgent: unenrollMock,
}));

vi.mock("./lib/enrollment-scanner", () => ({ scanEnrollmentCode: scanMock }));

const inactive: MobileAgentState = {
  available: true,
  enrolled: false,
  agentId: null,
  agentName: null,
  serverUrl: null,
  collectionIntervalSeconds: null,
  lastSubmittedAt: null,
  lastError: null,
  backgroundMode: "inactive",
  backgroundRestricted: false,
  batteryOptimizationExempt: false,
  bootRecoveryEnabled: true,
  foregroundService: false,
  notificationPermissionRequired: false,
};

const active: MobileAgentState = {
  ...inactive,
  enrolled: true,
  agentId: "22222222-2222-4222-8222-222222222222",
  agentName: "Field phone",
  serverUrl: "https://monitor.example/api",
  collectionIntervalSeconds: 900,
  backgroundMode: "scheduled",
};

describe("Android Agent experience", () => {
  beforeEach(() => {
    stateMock.mockReset();
    enrollMock.mockReset();
    collectNowMock.mockReset();
    openSettingsMock.mockReset();
    scanMock.mockReset();
    unenrollMock.mockReset();
    stateMock.mockResolvedValue(inactive);
    enrollMock.mockResolvedValue(active);
  });

  afterEach(cleanup);

  it("activates from the code created by the Client", async () => {
    render(<AgentApp />);
    const code = createAgentEnrollmentCode({
      serverUrl: "https://monitor.example/api",
      enrollmentKey: `mim_agent_${"a".repeat(32)}`,
    });

    fireEvent.change(await screen.findByLabelText("Enrollment code"), {
      target: { value: code },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(enrollMock).toHaveBeenCalledWith({
        serverUrl: "https://monitor.example/api",
        enrollmentKey: `mim_agent_${"a".repeat(32)}`,
      })
    );
    expect(await screen.findByText("Field phone")).toBeVisible();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
  });

  it("scans the Client QR code and activates immediately", async () => {
    const code = createAgentEnrollmentCode({
      serverUrl: "https://monitor.example/api",
      enrollmentKey: `mim_agent_${"b".repeat(32)}`,
    });
    scanMock.mockResolvedValue(code);

    render(<AgentApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Scan QR" }));

    await waitFor(() =>
      expect(enrollMock).toHaveBeenCalledWith({
        serverUrl: "https://monitor.example/api",
        enrollmentKey: `mim_agent_${"b".repeat(32)}`,
      })
    );
    expect(await screen.findByText("Field phone")).toBeVisible();
  });

  it("shows Android recovery only while background access is restricted", async () => {
    stateMock.mockResolvedValue({
      ...active,
      backgroundMode: "restricted",
      backgroundRestricted: true,
    });
    openSettingsMock.mockResolvedValue(undefined);

    render(<AgentApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Allow background access" }));
    await waitFor(() => expect(openSettingsMock).toHaveBeenCalledOnce());
  });
});
