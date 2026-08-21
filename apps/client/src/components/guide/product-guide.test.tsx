import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../lib/app-navigation";
import type { GuideTopic } from "./guide-content";
import { ProductGuide } from "./product-guide";

interface CapturedTourStep {
  content?: unknown;
  placement?: string;
  target?: Element | string;
  title?: unknown;
}

const guideTourState = vi.hoisted(() => ({
  steps: [] as CapturedTourStep[],
}));

vi.mock("./guide-dialog", () => ({
  MimoGuideDialog: ({
    open,
    currentTopic,
    onStartTour,
  }: {
    open: boolean;
    currentTopic?: GuideTopic;
    onStartTour: (topic?: GuideTopic) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onStartTour(currentTopic)}>
        Start current tour
      </button>
    ) : null,
}));

vi.mock("./guide-tour", () => ({
  GuideTour: ({
    run,
    steps,
    onEnd,
  }: {
    run: boolean;
    steps: CapturedTourStep[];
    onEnd: (outcome: "finished" | "skipped") => void;
  }) => {
    guideTourState.steps = steps;
    return run ? (
      <div data-testid="running-tour">
        <button type="button" onClick={() => onEnd("finished")}>
          Complete tour
        </button>
        <button type="button" onClick={() => onEnd("skipped")}>
          Skip tour
        </button>
      </div>
    ) : null;
  },
}));

const baseProps = {
  open: false,
  onOpenChange: vi.fn(),
  teamRole: "owner" as const,
  isGlobalAdmin: false,
  userId: "user-1",
  profileReady: true,
  acknowledgedTourIds: [] as string[],
  onAcknowledgeTour: vi.fn().mockResolvedValue(undefined),
};

describe("ProductGuide automatic tours", () => {
  afterEach(() => {
    cleanup();
    guideTourState.steps = [];
    document
      .querySelectorAll("[data-guide-page], [data-guide-nav], [data-guide]")
      .forEach((element) => element.remove());
    vi.clearAllMocks();
  });

  it("waits for the server profile before starting and acknowledges completion", async () => {
    addVisibleTarget("resources-toolbar");
    const acknowledgeTour = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderGuide(appRoutes.resources, {
      profileReady: false,
      onAcknowledgeTour: acknowledgeTour,
    });

    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={[appRoutes.resources]}>
        <ProductGuide {...baseProps} profileReady onAcknowledgeTour={acknowledgeTour} />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Complete tour" }));
    expect(acknowledgeTour).toHaveBeenCalledTimes(1);
    expect(acknowledgeTour).toHaveBeenCalledWith("resources");
    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();
    expect(acknowledgeTour).toHaveBeenCalledTimes(1);
  });

  it("waits for a configured view target and acknowledges skipping", async () => {
    const acknowledgeTour = vi.fn().mockResolvedValue(undefined);
    renderGuide(appRoutes.checks, { onAcknowledgeTour: acknowledgeTour });

    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();

    addVisibleTarget("checks-filters");
    fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
    expect(acknowledgeTour).toHaveBeenCalledWith("checks");
  });

  it("waits for an active dialog to close before starting", async () => {
    addVisibleTarget("resources-toolbar");
    const dialog = addVisibleDialog();
    renderGuide(appRoutes.resources);

    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();

    dialog.remove();
    expect(await screen.findByTestId("running-tour")).toBeInTheDocument();
  });

  it("keeps acknowledged views independent", async () => {
    addVisibleTarget("resources-toolbar");
    const first = renderGuide(appRoutes.resources, {
      acknowledgedTourIds: ["resources"],
    });

    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();
    first.unmount();
    document.querySelectorAll("[data-guide-page]").forEach((element) => element.remove());

    addVisibleTarget("checks-filters");
    renderGuide(appRoutes.checks, { acknowledgedTourIds: ["resources"] });
    expect(await screen.findByTestId("running-tour")).toBeInTheDocument();
  });

  it("allows an acknowledged tour to be launched manually", async () => {
    addVisibleTarget("resources-toolbar");
    const acknowledgeTour = vi.fn().mockResolvedValue(undefined);
    renderGuide(appRoutes.resources, {
      open: true,
      acknowledgedTourIds: ["resources"],
      onAcknowledgeTour: acknowledgeTour,
    });

    fireEvent.click(screen.getByRole("button", { name: "Start current tour" }));
    expect(await screen.findByTestId("running-tour")).toBeInTheDocument();
    expect(guideTourState.steps).toEqual([expect.objectContaining({ placement: "bottom" })]);
    fireEvent.click(screen.getByRole("button", { name: "Complete tour" }));
    expect(acknowledgeTour).not.toHaveBeenCalled();
  });

  it("explains what Resources are without adding a repeated guide reminder", async () => {
    const navigation = addVisibleAttributeTarget("data-guide-nav", "resources");
    const toolbar = addVisibleTarget("resources-toolbar");
    const list = addVisibleTarget("resources-list");
    const guideTrigger = addVisibleAttributeTarget("data-guide", "guide-trigger");

    renderGuide(appRoutes.resources);

    expect(await screen.findByTestId("running-tour")).toBeInTheDocument();
    expect(guideTourState.steps).toEqual([
      expect.objectContaining({
        target: navigation,
        title: "Resources",
        content:
          "Resources are the websites, services, ports, and servers you monitor. Open one to review its checks, current health, and history.",
        placement: "right",
      }),
      expect.objectContaining({
        target: toolbar,
        title: "Search or start monitoring",
        content:
          "Search by name, address, or tag, or add a website, port, or server with its first check.",
      }),
      expect.objectContaining({
        target: list,
        title: "Compare resource health",
        content:
          "Compare current health, passing checks, and last activity. Open a resource to investigate its monitoring history.",
      }),
    ]);
    expect(guideTourState.steps).not.toContainEqual(
      expect.objectContaining({ target: guideTrigger })
    );
  });

  it("keeps only actionable stops in the general interface tour", async () => {
    const workspace = addVisibleAttributeTarget("data-guide", "workspace-switcher");
    const navigation = addVisibleAttributeTarget("data-guide", "primary-navigation");
    addVisibleAttributeTarget("data-guide", "page-heading");
    addVisibleAttributeTarget("data-guide", "page-content");
    const guideTrigger = addVisibleAttributeTarget("data-guide", "guide-trigger");

    renderGuide("/app/not-configured", { open: true });
    fireEvent.click(screen.getByRole("button", { name: "Start current tour" }));

    expect(await screen.findByTestId("running-tour")).toBeInTheDocument();
    expect(guideTourState.steps).toEqual([
      expect.objectContaining({ target: workspace, title: "Workspace" }),
      expect.objectContaining({ target: navigation, title: "Product areas" }),
      expect.objectContaining({ target: guideTrigger, title: "Mimo Guide" }),
    ]);
  });

  it("does not automatically launch on a view without a configured tour", async () => {
    addVisibleTarget("resources-toolbar");
    renderGuide("/app/not-configured");

    await elapse(80);
    expect(screen.queryByTestId("running-tour")).not.toBeInTheDocument();
  });
});

function renderGuide(path: string, props: Partial<React.ComponentProps<typeof ProductGuide>> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductGuide {...baseProps} {...props} />
    </MemoryRouter>
  );
}

function addVisibleTarget(name: string) {
  return addVisibleAttributeTarget("data-guide-page", name);
}

function addVisibleAttributeTarget(attribute: string, value: string) {
  const target = document.createElement("div");
  target.setAttribute(attribute, value);
  Object.defineProperty(target, "getClientRects", {
    value: () => [{ bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1, x: 0, y: 0 }],
  });
  document.body.append(target);
  return target;
}

function addVisibleDialog() {
  const dialog = document.createElement("div");
  dialog.role = "dialog";
  Object.defineProperty(dialog, "getClientRects", {
    value: () => [{ bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1, x: 0, y: 0 }],
  });
  document.body.append(dialog);
  return dialog;
}

async function elapse(milliseconds: number) {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  });
}
