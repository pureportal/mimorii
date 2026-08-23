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
  status: "up",
  checksUp: 1,
  checksTotal: 1,
  lastCheckedAt: null,
  inMaintenance: false,
  imageUpdatedAt: null,
  createdAt: "2026-08-22T08:00:00.000Z",
};

describe("CheckDialog", () => {
  afterEach(cleanup);

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
