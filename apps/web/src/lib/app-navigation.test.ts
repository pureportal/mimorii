import { describe, expect, it } from "vitest";
import {
  appRoutes,
  isNavigationItemActive,
  navigationContext,
  navigationGroups,
  visibleNavigationGroups,
} from "./app-navigation";

describe("application navigation", () => {
  it.each([
    [appRoutes.overview, "Monitoring", "Overview"],
    [appRoutes.resource("resource-1"), "Monitoring", "Resource details"],
    [appRoutes.alertRules, "Operations", "Routing rules"],
    [appRoutes.reports, "Insights", "Reports"],
    [appRoutes.dashboardNew, "Publishing", "New dashboard"],
    [appRoutes.dashboardEdit("dashboard-1"), "Publishing", "Edit dashboard"],
    [appRoutes.platformAudit, "Administration", "Audit log"],
    [appRoutes.account, "Account", "Account"],
  ])("resolves %s to its unique location", (path, group, title) => {
    expect(navigationContext(path)).toMatchObject({ groupLabel: group, title });
  });

  it("selects exactly one primary item for every canonical destination", () => {
    const items = navigationGroups.flatMap((group) => group.items);
    const destinations = [
      appRoutes.overview,
      appRoutes.resource("resource-1"),
      appRoutes.checks,
      appRoutes.heartbeats,
      appRoutes.collectors,
      appRoutes.incidents,
      appRoutes.maintenance,
      appRoutes.alertHistory,
      appRoutes.reports,
      appRoutes.serviceGoals,
      appRoutes.dashboardEdit("dashboard-1"),
      appRoutes.statusPages,
      appRoutes.team,
      appRoutes.auditLog,
      appRoutes.platformUsers,
    ];

    for (const destination of destinations) {
      expect(items.filter((item) => isNavigationItemActive(destination, item))).toHaveLength(1);
    }
  });

  it("keeps privileged destinations out of navigation for members", () => {
    const memberIds = visibleNavigationGroups("member", false).flatMap((group) =>
      group.items.map((item) => item.id)
    );
    expect(memberIds).not.toContain("alerting");
    expect(memberIds).not.toContain("audit-log");
    expect(memberIds).not.toContain("platform");

    const ownerIds = visibleNavigationGroups("owner", true).flatMap((group) =>
      group.items.map((item) => item.id)
    );
    expect(ownerIds).toEqual(expect.arrayContaining(["alerting", "audit-log", "platform"]));
  });
});
