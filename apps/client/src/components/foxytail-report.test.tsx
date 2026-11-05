import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoxytailReport } from "./foxytail-report";
import { HeartbeatHistoryDialog } from "./heartbeat-history-dialog";
import type { HeartbeatEventSummary, HeartbeatMonitorSummary } from "@mimorii/contracts";

const { history } = vi.hoisted(() => ({ history: { data: [] as HeartbeatEventSummary[] } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ ...history, isSuccess: true }) }));
afterEach(cleanup);

describe("Foxytail monitoring", () => {
  it("shows download, processing, dependency and failure metrics with named labels", () => {
    render(
      <FoxytailReport
        metadata={{
          application: "foxytail",
          database: true,
          redis: false,
          operationalMetrics: true,
          downloadsActive: 3,
          downloadsFailed: 2,
          importsAttention: 1,
          downloadFailures24h: 4,
          jobsStalled: 2,
          transcodesFailed: 1,
          libraryFoldersUnavailable: 1,
          downloadsQueued: 0,
          jobsFailed: -1,
          movies: 15,
          series: 4,
        }}
      />
    );
    for (const [label, value] of [
      ["Downloading", "3"],
      ["Failed downloads", "2"],
      ["Queued", "0"],
      ["Download failures", "4"],
      ["Database", "Available"],
      ["Redis", "Unavailable"],
      ["Movies", "15"],
      ["Series", "4"],
    ]) {
      expect(screen.getByText(label!).parentElement).toHaveTextContent(value!);
    }
    expect(screen.queryByText("Failed jobs")).toBeNull();
    expect(screen.queryByText("internal-id")).toBeNull();
  });

  it("shows unavailable telemetry without inventing zero counts", () => {
    render(<FoxytailReport metadata={{ movies: null }} />);
    expect(screen.getByText("Movies").parentElement).toHaveTextContent("Unavailable");
    expect(screen.queryByText("Downloads")).toBeNull();
  });

  it("opens the latest report and lets users expand previous reports", async () => {
    history.data = [3, 1].map((count, index) => ({
      id: String(index),
      heartbeatId: "hb",
      type: "succeeded",
      message: "Foxytail is ready",
      durationMs: null,
      metadata: { application: "foxytail", downloadsActive: count },
      occurredAt: "2026-11-05T12:00:00Z",
      receivedAt: "2026-11-05T12:00:00Z",
    }));
    render(
      <HeartbeatHistoryDialog
        foxytail
        heartbeat={{ id: "hb", name: "Foxytail" } as HeartbeatMonitorSummary}
        teamId="team"
        onClose={vi.fn()}
      />
    );
    const summaries = screen.getAllByText("Foxytail details");
    const latest = summaries[0]!.closest("details")!;
    const previous = summaries[1]!.closest("details")!;
    expect(latest).toHaveAttribute("open");
    expect(previous).not.toHaveAttribute("open");
    expect(within(previous).queryByText("Downloading")).toBeNull();
    fireEvent.click(summaries[1]!);
    expect(previous).toHaveAttribute("open");
    await waitFor(() =>
      expect(within(previous).getByText("Downloading").parentElement).toHaveTextContent("1")
    );
  });
});
