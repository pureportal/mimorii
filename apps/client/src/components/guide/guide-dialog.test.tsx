import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canAccessGuideItem, guideTopics, guideWorkflows } from "./guide-content";
import { MimoGuideDialog } from "./guide-dialog";

const viewerTopics = guideTopics.filter((topic) =>
  canAccessGuideItem(topic.access, "viewer", false)
);
const viewerWorkflows = guideWorkflows.filter((workflow) =>
  canAccessGuideItem(workflow.access, "viewer", false)
);

describe("MimoGuideDialog", () => {
  afterEach(cleanup);

  it("explains the current page and can start its tour", () => {
    const startTour = vi.fn();
    renderGuide({ currentTopicId: "resources", onStartTour: startTour });

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Explain this page" }));

    expect(within(dialog).getByRole("heading", { name: "Resources" })).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "How these areas differ" })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Show me around" }));
    expect(startTour).toHaveBeenCalledWith(expect.objectContaining({ id: "resources" }));
  });

  it("shows every available menu while hiding restricted areas", () => {
    renderGuide();

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Menus" })[0]!);

    expect(within(dialog).getByRole("heading", { name: "Menus" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Resources/ })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Account/ })).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: /Alerting: Delivery history/ })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Platform/ })).not.toBeInTheDocument();
  });

  it("searches across menus and workflows and advances through every step", () => {
    renderGuide();

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search the guide" }), {
      target: { value: "scheduled job" },
    });

    expect(within(dialog).getByRole("button", { name: /Heartbeats/ })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: /Monitor a scheduled job/ }));

    expect(within(dialog).getByRole("heading", { name: "Monitor a scheduled job" })).toBeVisible();
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(within(dialog).getAllByText("Choose its resource")).toHaveLength(2);
    expect(within(dialog).getByText("Check the history")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(within(dialog).getByRole("heading", { name: "Add a heartbeat" })).toBeVisible();
  });

  it("starts a new search from a detail and clears it without losing focus", () => {
    renderGuide({ currentTopicId: "resources" });

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Explain this page" }));
    const search = within(dialog).getByRole("textbox", { name: "Search the guide" });
    fireEvent.change(search, { target: { value: "scheduled job" } });

    expect(within(dialog).queryByRole("heading", { name: "Resources" })).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Results for “scheduled job”" })
    ).toBeVisible();
    expect(within(dialog).queryAllByRole("button", { current: "page" })).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
  });

  it("focuses search when the guide opens", async () => {
    renderGuide();

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Search the guide" })).toHaveFocus()
    );
  });

  it("keeps mobile navigation icons from collapsing", () => {
    renderGuide();

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    const horizontalNavigation = within(dialog)
      .getAllByRole("navigation", { name: "Guide sections" })
      .find((navigation) => navigation.classList.contains("grid"));
    const workflowButton = within(horizontalNavigation!).getByRole("button", {
      name: "Workflows",
    });

    expect(workflowButton).toHaveClass("gap-2");
    expect(workflowButton.querySelector("svg")).toHaveClass("shrink-0");
  });

  it("shows a recoverable empty search state", () => {
    renderGuide();

    const dialog = screen.getByRole("dialog", { name: "Mimo Guide" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search the guide" }), {
      target: { value: "nothing-matches-this" },
    });

    expect(within(dialog).getByRole("heading", { name: "No guide results" })).toBeVisible();
    expect(within(dialog).getByText("Try a menu name, feature, or task.")).toBeVisible();
  });
});

function renderGuide({
  currentTopicId,
  onStartTour = vi.fn(),
}: {
  currentTopicId?: string;
  onStartTour?: (topic?: (typeof guideTopics)[number]) => void;
} = {}) {
  return render(
    <MemoryRouter>
      <MimoGuideDialog
        open
        onOpenChange={vi.fn()}
        topics={viewerTopics}
        workflows={viewerWorkflows}
        currentTopic={guideTopics.find((topic) => topic.id === currentTopicId)}
        onStartTour={onStartTour}
      />
    </MemoryRouter>
  );
}
