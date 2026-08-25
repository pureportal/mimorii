import type { ResourceSummary } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckDialog, type CheckPayload } from "./check-dialog";

const resource: ResourceSummary = {
  id: "16b51252-64bd-4e6b-9c86-7e9a3b77a6b4",
  teamId: "9c62089f-f515-4efe-bb21-dd146b960436",
  name: "Nextcloud",
  kind: "host",
  description: null,
  tags: [],
  agent: null,
  status: "okay",
  checksPassing: 1,
  checksTotal: 1,
  lastCheckedAt: null,
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-22T08:00:00.000Z",
};

const windowsResource: ResourceSummary = {
  ...resource,
  id: "5a6e77e0-acde-46e9-8dde-199f470f7e8f",
  name: "Windows server",
  agent: {
    id: "1887e099-1fc2-40c9-8cc3-b7f58b9a4d24",
    kind: "desktop",
    status: "never",
    platform: "windows",
    version: null,
    lastSeenAt: null,
  },
};

describe("CheckDialog", () => {
  afterEach(cleanup);

  it("opens a new check with an empty name", () => {
    render(
      <CheckDialog
        open
        onOpenChange={vi.fn()}
        resources={[resource]}
        onSubmit={vi.fn(async (_payload: CheckPayload) => undefined)}
      />
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
  });

  it("uses the selected type as the name when no name is entered", async () => {
    const onSubmit = vi.fn(async (_payload: CheckPayload) => undefined);

    render(<CheckDialog open onOpenChange={vi.fn()} resources={[resource]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "dns" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save check" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "DNS record" }));
  });

  it("preserves a name entered by the user", async () => {
    const onSubmit = vi.fn(async (_payload: CheckPayload) => undefined);

    render(<CheckDialog open onOpenChange={vi.fn()} resources={[resource]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Public endpoint" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save check" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Public endpoint" }));
  });

  it("uses Windows defaults for local checks", async () => {
    const onSubmit = vi.fn(async (_payload: CheckPayload) => undefined);
    render(
      <CheckDialog open onOpenChange={vi.fn()} resources={[windowsResource]} onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "host" },
    });
    expect(screen.getByRole("checkbox", { name: "Load average" })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Mount" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "disk" },
    });
    expect(screen.getByRole("textbox", { name: "Mount" })).toHaveValue("C:");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Warning · %" }), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save check" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Disk usage",
        type: "disk",
        config: { mount: "C:", warningPercent: 75, criticalPercent: 95 },
      })
    );
  });

  it.each(["", "missing-resource"])(
    "submits the first available resource when the default is %j",
    async (defaultResourceId) => {
      const onSubmit = vi.fn(async (_payload: CheckPayload) => undefined);

      render(
        <CheckDialog
          open
          onOpenChange={vi.fn()}
          resources={[resource]}
          defaultResourceId={defaultResourceId}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByRole("combobox", { name: "Resource" })).toHaveValue(resource.id);
      fireEvent.click(screen.getByRole("button", { name: "Save check" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ resourceId: resource.id }));
    }
  );
});
