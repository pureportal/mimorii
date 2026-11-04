import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HostMaintenanceResults } from "./host-maintenance-results";

describe("host maintenance results", () => {
  afterEach(cleanup);

  it("distinguishes unavailable data from a passed assessment and shows update names", () => {
    render(
      <HostMaintenanceResults
        metrics={{
          "maintenance.securityUpdates.status": "critical",
          "maintenance.securityUpdates.detail": "2 pending: KB123, KB456",
          "maintenance.softwareUpdates.status": "unavailable",
          "maintenance.softwareUpdates.detail": "Unavailable: Windows Update access denied",
          "maintenance.rebootRequired.status": "okay",
          "maintenance.rebootRequired.detail": "",
        }}
      />
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("2 pending: KB123, KB456")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Windows Update access denied")).toBeInTheDocument();
    expect(screen.getByText("Okay")).toBeInTheDocument();
    expect(screen.queryByText("No issues detected")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed services")).not.toBeInTheDocument();
  });

  it("lists the most severe findings first", () => {
    render(
      <HostMaintenanceResults
        metrics={{
          "maintenance.rebootRequired.status": "okay",
          "maintenance.rebootRequired.detail": "",
          "maintenance.softwareUpdates.status": "unavailable",
          "maintenance.softwareUpdates.detail": "Unavailable: update data is stale",
          "maintenance.security.status": "critical",
          "maintenance.security.detail": "1 issue",
        }}
      />
    );
    expect(screen.getAllByRole("term").map((term) => term.firstChild?.textContent)).toEqual([
      "Security",
      "Software updates",
      "Restart",
    ]);
  });

  it("shows pending updates below a configured alert threshold", () => {
    render(
      <HostMaintenanceResults
        metrics={{
          "maintenance.softwareUpdates.status": "okay",
          "maintenance.softwareUpdates.detail": "2 pending: openssl, curl",
        }}
      />
    );
    expect(screen.getByText("2 pending: openssl, curl")).toBeInTheDocument();
  });
});
