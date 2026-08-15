import { useEffect, useMemo, useRef, useState } from "react";
import type { Step } from "react-joyride";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import {
  canAccessGuideItem,
  currentGuideTopic,
  guideTopics,
  guideWorkflows,
  type GuideTopic,
  type GuideTourStop,
} from "./guide-content";
import { MimoGuideDialog } from "./guide-dialog";
import { GuideTour } from "./guide-tour";

const interfaceTour: readonly GuideTourStop[] = [
  {
    target: '[data-guide="workspace-switcher"]',
    title: "Workspace",
    content: "Choose which team's resources, monitoring, and settings you are viewing.",
    placement: "right",
  },
  {
    target: '[data-guide="primary-navigation"], [data-guide="mobile-navigation"]',
    title: "Product areas",
    content:
      "Monitoring, operations, insights, publishing, and workspace tools are grouped by purpose.",
    placement: "right",
  },
  {
    target: '[data-guide="page-heading"]',
    title: "Current page",
    content:
      "The small label names the menu group; the larger title names the page or nested view.",
    placement: "bottom",
  },
  {
    target: '[data-guide="page-content"]',
    title: "Your work area",
    content: "The controls and current data for the selected page appear here.",
    placement: "top",
  },
  {
    target: '[data-guide="guide-trigger"]',
    title: "Help stays nearby",
    content: "Open Mimo Guide from any page whenever you need a menu explanation or workflow.",
    placement: "bottom",
  },
];

export function ProductGuide({
  open,
  onOpenChange,
  teamRole,
  isGlobalAdmin,
  userId,
  profileReady,
  acknowledgedTourIds,
  onAcknowledgeTour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamRole: "owner" | "admin" | "member" | "viewer";
  isGlobalAdmin: boolean;
  userId: string;
  profileReady: boolean;
  acknowledgedTourIds: readonly string[];
  onAcknowledgeTour: (tourId: string) => Promise<void>;
}) {
  const location = useLocation();
  const [tourSteps, setTourSteps] = useState<Step[]>([]);
  const [tourRunning, setTourRunning] = useState(false);
  const startTimer = useRef<number | null>(null);
  const activeTourTopicId = useRef<string | null>(null);
  const automaticallyStartedTopicId = useRef<string | null>(null);
  const acknowledgedTourIdsRef = useRef(acknowledgedTourIds);
  acknowledgedTourIdsRef.current = acknowledgedTourIds;
  const topics = useMemo(
    () => guideTopics.filter((topic) => canAccessGuideItem(topic.access, teamRole, isGlobalAdmin)),
    [isGlobalAdmin, teamRole]
  );
  const workflows = useMemo(
    () =>
      guideWorkflows.filter((workflow) =>
        canAccessGuideItem(workflow.access, teamRole, isGlobalAdmin)
      ),
    [isGlobalAdmin, teamRole]
  );
  const matchedTopic = currentGuideTopic(location.pathname);
  const currentTopic =
    matchedTopic && topics.some((topic) => topic.id === matchedTopic.id) ? matchedTopic : undefined;

  useEffect(() => {
    if (startTimer.current !== null) {
      window.clearTimeout(startTimer.current);
      startTimer.current = null;
    }
    setTourRunning(false);
    activeTourTopicId.current = null;
    automaticallyStartedTopicId.current = null;
  }, [location.pathname, userId]);

  useEffect(
    () => () => {
      if (startTimer.current !== null) window.clearTimeout(startTimer.current);
    },
    []
  );

  useEffect(() => {
    if (
      !profileReady ||
      open ||
      tourRunning ||
      startTimer.current !== null ||
      !currentTopic?.tour.length ||
      acknowledgedTourIds.includes(currentTopic.id) ||
      automaticallyStartedTopicId.current === currentTopic.id
    ) {
      return undefined;
    }

    let cancelled = false;
    const topic = currentTopic;
    const tryStart = () => {
      if (
        cancelled ||
        automaticallyStartedTopicId.current === topic.id ||
        visibleElement('[role="dialog"]') ||
        !topic.tour.some((definition) => visibleElement(definition.target))
      ) {
        return;
      }
      const steps = tourStepsFor(contextualTour(topic));
      if (!steps.length) return;
      automaticallyStartedTopicId.current = topic.id;
      activeTourTopicId.current = topic.id;
      setTourSteps(steps);
      setTourRunning(true);
    };

    const observer = new MutationObserver(tryStart);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
      childList: true,
      subtree: true,
    });
    const readyTimer = window.setTimeout(tryStart, 50);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(readyTimer);
    };
  }, [
    acknowledgedTourIds,
    currentTopic,
    location.pathname,
    open,
    profileReady,
    tourRunning,
    userId,
  ]);

  function startTour(topic?: GuideTopic) {
    const definitions = topic ? contextualTour(topic) : interfaceTour;
    const steps = tourStepsFor(definitions);

    if (!steps.length) {
      toast.error("This tour is not available on the current screen");
      return;
    }

    setTourRunning(false);
    setTourSteps(steps);
    activeTourTopicId.current = topic?.id ?? null;
    if (topic) automaticallyStartedTopicId.current = topic.id;
    onOpenChange(false);
    if (startTimer.current !== null) window.clearTimeout(startTimer.current);
    startTimer.current = window.setTimeout(() => {
      setTourRunning(true);
      startTimer.current = null;
    }, 220);
  }

  function endTour() {
    setTourRunning(false);
    const topicId = activeTourTopicId.current;
    activeTourTopicId.current = null;
    if (!topicId || acknowledgedTourIdsRef.current.includes(topicId)) return;
    void onAcknowledgeTour(topicId).catch(() => {
      toast.error("Tour progress could not be saved");
    });
  }

  return (
    <>
      <MimoGuideDialog
        open={open}
        onOpenChange={onOpenChange}
        topics={topics}
        workflows={workflows}
        currentTopic={currentTopic}
        onStartTour={startTour}
      />
      <GuideTour run={tourRunning} steps={tourSteps} onEnd={endTour} />
    </>
  );
}

function tourStepsFor(definitions: readonly GuideTourStop[]): Step[] {
  return definitions.flatMap((definition): Step[] => {
    const target = visibleElement(definition.target);
    if (!target) return [];
    return [
      {
        target,
        title: definition.title,
        content: definition.content,
        placement: definition.placement ?? "bottom",
      },
    ];
  });
}

function contextualTour(topic: GuideTopic): GuideTourStop[] {
  return [
    ...(topic.navigationId
      ? [
          {
            target: `[data-guide-nav="${topic.navigationId}"]`,
            title: `Find ${topic.title}`,
            content: `This destination lives in the ${topic.group.replace("-", " ")} area.`,
            placement: "right" as const,
          },
        ]
      : []),
    ...topic.tour,
    {
      target: '[data-guide="guide-trigger"]',
      title: "Open the guide again",
      content: "Return here for every menu, comparison, and step-by-step workflow.",
      placement: "bottom",
    },
  ];
}

function visibleElement(selector: string): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    elements.find((element) => {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      );
    }) ?? null
  );
}
