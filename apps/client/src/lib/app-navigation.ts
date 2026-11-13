import { appRoutes, type OverviewAnalytics } from "@mimorii/contracts";
import { createIntentPath } from "./create-intent";

export { appRoutes } from "@mimorii/contracts";

const relativeAppPath = (path: string) => path.replace(/^\/app\/?/, "");

export const appPaths = {
  resources: relativeAppPath(appRoutes.resources),
  resource: `${relativeAppPath(appRoutes.resources)}/:id`,
  checks: relativeAppPath(appRoutes.checks),
  heartbeats: relativeAppPath(appRoutes.heartbeats),
  agents: relativeAppPath(appRoutes.agents),
  logs: relativeAppPath(appRoutes.logs),
  logAlerts: relativeAppPath(appRoutes.logAlerts),
  logSources: relativeAppPath(appRoutes.logSources),
  incidents: relativeAppPath(appRoutes.incidents),
  maintenance: relativeAppPath(appRoutes.maintenance),
  alertChannels: relativeAppPath(appRoutes.alertChannels),
  alertRules: relativeAppPath(appRoutes.alertRules),
  alertHistory: relativeAppPath(appRoutes.alertHistory),
  reports: relativeAppPath(appRoutes.reports),
  serviceGoals: relativeAppPath(appRoutes.serviceGoals),
  dashboards: relativeAppPath(appRoutes.dashboards),
  dashboardNew: relativeAppPath(appRoutes.dashboardNew),
  dashboardEdit: `${relativeAppPath(appRoutes.dashboards)}/:id/edit`,
  statusPages: relativeAppPath(appRoutes.statusPages),
  team: relativeAppPath(appRoutes.team),
  auditLog: relativeAppPath(appRoutes.auditLog),
  account: relativeAppPath(appRoutes.account),
  platform: relativeAppPath(appRoutes.platform),
  platformUsers: relativeAppPath(appRoutes.platformUsers),
  platformTeams: relativeAppPath(appRoutes.platformTeams),
  platformSponsorships: relativeAppPath(appRoutes.platformSponsorships),
  platformSettings: relativeAppPath(appRoutes.platformSettings),
  platformAudit: relativeAppPath(appRoutes.platformAudit),
} as const;

export type NavigationItemId =
  | "overview"
  | "resources"
  | "checks"
  | "heartbeats"
  | "agents"
  | "logs"
  | "incidents"
  | "maintenance"
  | "alerting"
  | "reports"
  | "service-goals"
  | "dashboards"
  | "status-pages"
  | "team"
  | "audit-log"
  | "platform";

export interface NavigationSubitem {
  label: string;
  to: string;
  teamAdmin?: boolean;
}

export type NavigationFeature = "logs";

export type NavigationFeatures = Record<NavigationFeature, boolean>;

export interface NavigationItem {
  id: NavigationItemId;
  label: string;
  to: string;
  matchRoot?: string;
  exact?: boolean;
  teamAdmin?: boolean;
  globalAdmin?: boolean;
  feature?: NavigationFeature;
  disabled?: boolean;
  children?: readonly NavigationSubitem[];
}

export interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
}

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Monitoring",
    items: [
      { id: "overview", label: "Overview", to: appRoutes.overview, exact: true },
      { id: "resources", label: "Resources", to: appRoutes.resources },
      { id: "checks", label: "Checks", to: appRoutes.checks, exact: true },
      { id: "heartbeats", label: "Heartbeats", to: appRoutes.heartbeats, exact: true },
      { id: "agents", label: "Agents", to: appRoutes.agents, exact: true },
      {
        id: "logs",
        label: "Logs",
        to: appRoutes.logs,
        matchRoot: appRoutes.logs,
        feature: "logs",
        children: [
          { label: "Explore", to: appRoutes.logs },
          { label: "Alert rules", to: appRoutes.logAlerts },
          { label: "Sources", to: appRoutes.logSources, teamAdmin: true },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "incidents", label: "Incidents", to: appRoutes.incidents, exact: true },
      { id: "maintenance", label: "Maintenance", to: appRoutes.maintenance, exact: true },
      {
        id: "alerting",
        label: "Alerting",
        to: appRoutes.alertChannels,
        matchRoot: "/app/operations/alerting",
        teamAdmin: true,
        children: [
          { label: "Channels", to: appRoutes.alertChannels },
          { label: "Routing rules", to: appRoutes.alertRules },
          { label: "Delivery history", to: appRoutes.alertHistory },
        ],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "reports", label: "Reports", to: appRoutes.reports, exact: true },
      {
        id: "service-goals",
        label: "Service goals",
        to: appRoutes.serviceGoals,
        exact: true,
      },
    ],
  },
  {
    label: "Publishing",
    items: [
      {
        id: "dashboards",
        label: "Shared dashboards",
        to: appRoutes.dashboards,
      },
      { id: "status-pages", label: "Status pages", to: appRoutes.statusPages, exact: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "team", label: "Team", to: appRoutes.team, exact: true },
      {
        id: "audit-log",
        label: "Audit log",
        to: appRoutes.auditLog,
        exact: true,
        teamAdmin: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        id: "platform",
        label: "Platform",
        to: appRoutes.platform,
        matchRoot: appRoutes.platform,
        globalAdmin: true,
        children: [
          { label: "Overview", to: appRoutes.platform },
          { label: "Users", to: appRoutes.platformUsers },
          { label: "Teams", to: appRoutes.platformTeams },
          { label: "Sponsorships", to: appRoutes.platformSponsorships },
          { label: "Settings", to: appRoutes.platformSettings },
          { label: "Audit log", to: appRoutes.platformAudit },
        ],
      },
    ],
  },
];

export interface NavigationBadge {
  count: number;
  label: string;
  tone: "danger" | "info";
}

export type NavigationBadges = Partial<Record<NavigationItemId, NavigationBadge>>;

export function navigationBadges(
  overview: Pick<OverviewAnalytics, "openIncidents" | "activeMaintenance" | "breachedObjectives">
): NavigationBadges {
  const badges: NavigationBadges = {};
  if (overview.openIncidents) {
    badges.incidents = { count: overview.openIncidents, label: "open", tone: "danger" };
  }
  if (overview.activeMaintenance) {
    badges.maintenance = { count: overview.activeMaintenance, label: "active", tone: "info" };
  }
  if (overview.breachedObjectives) {
    badges["service-goals"] = {
      count: overview.breachedObjectives,
      label: "breached",
      tone: "danger",
    };
  }
  return badges;
}

export interface CreateDestination {
  id: "resource" | "check" | "heartbeat" | "agent" | "incident" | "status-page" | "dashboard";
  label: string;
  to: string;
  teamAdmin?: boolean;
}

export const createDestinations: readonly CreateDestination[] = [
  { id: "resource", label: "Resource", to: appRoutes.newResource },
  { id: "check", label: "Check", to: createIntentPath(appRoutes.checks) },
  { id: "heartbeat", label: "Heartbeat", to: createIntentPath(appRoutes.heartbeats) },
  { id: "agent", label: "Agent", to: createIntentPath(appRoutes.agents) },
  { id: "incident", label: "Incident", to: createIntentPath(appRoutes.incidents) },
  {
    id: "status-page",
    label: "Status page",
    to: createIntentPath(appRoutes.statusPages),
    teamAdmin: true,
  },
  { id: "dashboard", label: "Dashboard", to: appRoutes.dashboardNew, teamAdmin: true },
];

export function visibleCreateDestinations(
  teamRole: "owner" | "admin" | "member" | "viewer"
): CreateDestination[] {
  if (teamRole === "viewer") return [];
  const teamAdmin = teamRole === "owner" || teamRole === "admin";
  return createDestinations.filter((destination) => !destination.teamAdmin || teamAdmin);
}

export const mobilePrimaryItemIds = new Set<NavigationItemId>([
  "overview",
  "resources",
  "incidents",
  "reports",
]);

export interface NavigationContext {
  groupLabel: string;
  itemLabel: string;
  title: string;
  nestedLabel?: string;
}

export function visibleNavigationGroups(
  teamRole: "owner" | "admin" | "member" | "viewer",
  isGlobalAdmin: boolean,
  features: NavigationFeatures
): NavigationGroup[] {
  const teamAdmin = teamRole === "owner" || teamRole === "admin";
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => (!item.teamAdmin || teamAdmin) && (!item.globalAdmin || isGlobalAdmin))
        .map((item) => ({
          ...item,
          disabled: Boolean(item.feature && !features[item.feature]),
          children: item.children?.filter((child) => !child.teamAdmin || teamAdmin),
        })),
    }))
    .filter((group) => group.items.length > 0);
}

export function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  const path = normalizePath(pathname);
  const root = item.matchRoot ?? item.to;
  return item.exact ? path === root : path === root || path.startsWith(`${root}/`);
}

export function isNavigationSubitemActive(pathname: string, item: NavigationSubitem): boolean {
  return normalizePath(pathname) === item.to;
}

export function navigationContext(pathname: string): NavigationContext {
  const path = normalizePath(pathname);
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (!isNavigationItemActive(path, item)) continue;
      const child = item.children?.find((candidate) => isNavigationSubitemActive(path, candidate));
      const nestedLabel = child?.label ?? nestedRouteLabel(path, item.id);
      return {
        groupLabel: group.label,
        itemLabel: item.label,
        title: nestedLabel ?? item.label,
        ...(nestedLabel ? { nestedLabel } : {}),
      };
    }
  }
  if (path === appRoutes.account) {
    return { groupLabel: "Account", itemLabel: "Account", title: "Account" };
  }
  return { groupLabel: "Mimorii", itemLabel: "Mimorii", title: "Mimorii" };
}

function nestedRouteLabel(pathname: string, itemId: NavigationItemId): string | undefined {
  if (itemId === "resources" && pathname !== appRoutes.resources) return "Resource details";
  if (itemId === "dashboards") {
    if (pathname === appRoutes.dashboardNew) return "New dashboard";
    if (pathname !== appRoutes.dashboards) return "Edit dashboard";
  }
  return undefined;
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
