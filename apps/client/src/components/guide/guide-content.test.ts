import { describe, expect, it } from "vitest";
import { appRoutes, navigationGroups } from "../../lib/app-navigation";
import {
  canAccessGuideItem,
  currentGuideTopic,
  guideTopics,
  guideWorkflows,
  searchableGuideText,
  searchableWorkflowText,
} from "./guide-content";

describe("guide content", () => {
  it("covers every navigation destination with complete, unique content", () => {
    expect(new Set(guideTopics.map((topic) => topic.id)).size).toBe(guideTopics.length);
    expect(new Set(guideWorkflows.map((workflow) => workflow.id)).size).toBe(guideWorkflows.length);

    for (const item of navigationGroups.flatMap((group) => group.items)) {
      expect(
        guideTopics.some((topic) => topic.navigationId === item.id),
        item.label
      ).toBe(true);
    }

    for (const topic of guideTopics) {
      expect(topic.summary.length, topic.title).toBeGreaterThan(20);
      expect(topic.sections.length, topic.title).toBeGreaterThan(0);
      expect(
        topic.sections.every((section) => section.items.length > 0),
        topic.title
      ).toBe(true);
    }

    for (const workflow of guideWorkflows) {
      expect(workflow.steps.length, workflow.title).toBeGreaterThanOrEqual(3);
      expect(
        workflow.steps.every((step) => Boolean(step.title && step.text)),
        workflow.title
      ).toBe(true);
    }
  });

  it("matches nested product routes to the right explanation", () => {
    expect(currentGuideTopic(appRoutes.resource("resource-1"))?.id).toBe("resource-details");
    expect(currentGuideTopic(appRoutes.dashboardEdit("dashboard-1"))?.id).toBe("dashboards");
    expect(currentGuideTopic(`${appRoutes.alertRules}/?from=guide`)?.id).toBe("alert-rules");
    expect(currentGuideTopic(appRoutes.platformUsers)?.id).toBe("platform");
    expect(currentGuideTopic("/outside-mimorii")).toBeUndefined();
  });

  it("keeps protected guidance aligned with product roles", () => {
    expect(canAccessGuideItem("team-admin", "viewer", false)).toBe(false);
    expect(canAccessGuideItem("team-admin", "member", true)).toBe(false);
    expect(canAccessGuideItem("team-admin", "admin", false)).toBe(true);
    expect(canAccessGuideItem("global-admin", "owner", false)).toBe(false);
    expect(canAccessGuideItem("global-admin", "viewer", true)).toBe(true);
    expect(canAccessGuideItem(undefined, "viewer", false)).toBe(true);
  });

  it("makes menu details and workflow steps searchable", () => {
    const heartbeats = guideTopics.find((topic) => topic.id === "heartbeats")!;
    const scheduledJob = guideWorkflows.find((workflow) => workflow.id === "monitor-job")!;

    expect(searchableGuideText(heartbeats)).toContain("scheduled job");
    expect(searchableWorkflowText(scheduledJob)).toContain("maximum runtime");
  });
});
