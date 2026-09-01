import type { NotificationChannelSummary, NotificationPolicySummary } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { NotificationPolicyDialog } from "./notification-policy-dialog";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

const apiMock = vi.mocked(api);

const channel: NotificationChannelSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  teamId: "team-1",
  name: "Browser and Android",
  type: "push",
  target: "Aiko Tanaka",
  recipientUserIds: ["user-1"],
  enabled: true,
  lastDeliveryStatus: null,
  lastDeliveredAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

describe("NotificationPolicyDialog", () => {
  beforeEach(() => apiMock.mockReset().mockResolvedValue(undefined));
  afterEach(cleanup);

  it("starts a new rule with every event and All selected", () => {
    renderDialog(null);

    expect(screen.getByRole("checkbox", { name: "Incident updated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Maintenance started" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "SLO breached" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "All" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: channel.name })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
  });

  it("preserves an explicit selection while editing", () => {
    renderDialog({
      id: "policy-1",
      teamId: "team-1",
      name: "Existing rule",
      events: ["incident.opened"],
      condition: { kind: "group", operator: "and", conditions: [] },
      allChannels: false,
      channelIds: [channel.id],
      channelNames: [channel.name],
      enabled: true,
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    expect(screen.getByRole("checkbox", { name: "All" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: channel.name })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Incident opened" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Incident updated" })).not.toBeChecked();
  });

  it("submits All without explicit channel IDs", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Every event" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledOnce());
    const request = apiMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      name: "Every event",
      allChannels: true,
      enabled: true,
    });
    expect(JSON.parse(request.body as string)).not.toHaveProperty("channelIds");
  });
});

function renderDialog(policy: NotificationPolicySummary | null) {
  return render(
    <NotificationPolicyDialog
      open
      onOpenChange={vi.fn()}
      policy={policy}
      channels={[channel]}
      teamId="team-1"
      onSaved={vi.fn(async () => undefined)}
    />
  );
}
