export const teamRoles = ["owner", "admin", "member", "viewer"] as const;
export type TeamRole = (typeof teamRoles)[number];

export const termsVersion = "2026-08-13";

export const appRoutes = {
  overview: "/app",
  resources: "/app/monitoring/resources",
  resource: (id: string) => `/app/monitoring/resources/${encodeURIComponent(id)}`,
  newResource: "/app/monitoring/resources?new=1",
  checks: "/app/monitoring/checks",
  checksForResource: (resourceId: string) =>
    `/app/monitoring/checks?resourceId=${encodeURIComponent(resourceId)}`,
  heartbeats: "/app/monitoring/heartbeats",
  heartbeatsForResource: (resourceId: string) =>
    `/app/monitoring/heartbeats?resourceId=${encodeURIComponent(resourceId)}`,
  agents: "/app/monitoring/agents",
  incidents: "/app/operations/incidents",
  maintenance: "/app/operations/maintenance",
  alertChannels: "/app/operations/alerting/channels",
  alertRules: "/app/operations/alerting/rules",
  alertHistory: "/app/operations/alerting/history",
  reports: "/app/insights/reports",
  serviceGoals: "/app/insights/service-goals",
  dashboards: "/app/publishing/dashboards",
  dashboardNew: "/app/publishing/dashboards/new",
  dashboardEdit: (id: string) => `/app/publishing/dashboards/${encodeURIComponent(id)}/edit`,
  statusPages: "/app/publishing/status-pages",
  team: "/app/team",
  auditLog: "/app/team/audit-log",
  account: "/app/account",
  platform: "/app/platform",
  platformUsers: "/app/platform/users",
  platformSponsorships: "/app/platform/sponsorships",
  platformSettings: "/app/platform/settings",
  platformAudit: "/app/platform/audit-log",
} as const;

export const resourceKinds = ["host", "device", "service"] as const;
export type ResourceKind = (typeof resourceKinds)[number];

export const checkTypes = [
  "http",
  "tcp",
  "dns",
  "icmp",
  "wan",
  "host",
  "docker",
  "database",
] as const;
export type CheckType = (typeof checkTypes)[number];

export const httpMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export const checkStatuses = ["pending", "up", "degraded", "down", "paused"] as const;
export type CheckStatus = (typeof checkStatuses)[number];

export const dashboardAccessModes = ["public", "private", "protected"] as const;
export type DashboardAccessMode = (typeof dashboardAccessModes)[number];

export const dashboardItemTypes = ["metric", "uptime", "status", "incidents"] as const;
export type DashboardItemType = (typeof dashboardItemTypes)[number];

export const dashboardMetrics = [
  "uptime",
  "averageLatency",
  "monitorCount",
  "openIncidents",
  "cpuPercent",
  "memoryPercent",
  "storagePercent",
  "loadAverage",
  "batteryPercent",
  "containerCount",
  "unhealthyContainerCount",
] as const;
export type DashboardMetric = (typeof dashboardMetrics)[number];

export const dashboardWidths = [1, 2, 3] as const;
export type DashboardWidth = (typeof dashboardWidths)[number];

export const dashboardWindowDays = [1, 7, 30, 90] as const;
export type DashboardWindowDays = (typeof dashboardWindowDays)[number];

export const dashboardIncidentLimits = [3, 5, 10] as const;
export type DashboardIncidentLimit = (typeof dashboardIncidentLimits)[number];

export const agentStatuses = ["online", "stale", "offline", "never"] as const;
export type AgentStatus = (typeof agentStatuses)[number];

export const agentKinds = ["desktop", "mobile"] as const;
export type AgentKind = (typeof agentKinds)[number];

export const desktopAgentPlatforms = ["linux", "windows"] as const;
export type DesktopAgentPlatform = (typeof desktopAgentPlatforms)[number];

export const agentCapabilities = [...checkTypes, "device-status"] as const;
export type AgentCapability = (typeof agentCapabilities)[number];

export const agentCapabilitiesByKind = {
  desktop: checkTypes,
  mobile: ["device-status"],
} as const satisfies Record<AgentKind, readonly AgentCapability[]>;

export const agentCollectionInterval = {
  defaultSeconds: 30,
  minimumSeconds: 15,
  maximumSeconds: 3_600,
} as const;

export const mobileAgentCollectionInterval = {
  defaultSeconds: 900,
  minimumSeconds: 900,
  maximumSeconds: 3_600,
} as const;

export const incidentStatuses = ["investigating", "identified", "monitoring", "resolved"] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentImpacts = ["minor", "major", "critical"] as const;
export type IncidentImpact = (typeof incidentImpacts)[number];

export const maintenanceRecurrences = ["none", "daily", "weekly", "monthly"] as const;
export type MaintenanceRecurrence = (typeof maintenanceRecurrences)[number];

export const notificationChannelTypes = ["email", "webhook", "push"] as const;
export type NotificationChannelType = (typeof notificationChannelTypes)[number];

export const notificationEvents = [
  "incident.opened",
  "incident.updated",
  "incident.resolved",
  "check.degraded",
  "check.recovered",
  "maintenance.started",
  "maintenance.completed",
  "slo.breached",
  "resource.alert.triggered",
  "resource.alert.recovered",
] as const;
export type NotificationEvent = (typeof notificationEvents)[number];

export const notificationConditionOperators = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "contains",
  "exists",
] as const;
export type NotificationConditionOperator = (typeof notificationConditionOperators)[number];
export type NotificationConditionValue = string | number | boolean | null | Array<string | number>;

export interface NotificationCondition {
  kind: "condition";
  field: string;
  operator: NotificationConditionOperator;
  value?: NotificationConditionValue;
}

export interface NotificationConditionGroup {
  kind: "group";
  operator: "and" | "or";
  conditions: NotificationConditionNode[];
}

export type NotificationConditionNode = NotificationCondition | NotificationConditionGroup;

export const notificationEndpointPlatforms = ["web", "android"] as const;
export type NotificationEndpointPlatform = (typeof notificationEndpointPlatforms)[number];

export const sponsorshipTiers = ["platinum", "gold", "silver"] as const;
export type SponsorshipTier = (typeof sponsorshipTiers)[number];

export const imageAssetMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const imageAssetMaxBytes = 5 * 1024 * 1024;
export const imageAssetMaxDimension = 4096;

export const sponsorshipApplicationStatuses = ["pending", "approved", "declined"] as const;
export type SponsorshipApplicationStatus = (typeof sponsorshipApplicationStatuses)[number];

export interface SponsorSummary {
  id: string;
  name: string;
  websiteUrl: string | null;
  faviconUpdatedAt: string | null;
}

export interface SponsorshipTierCollection {
  tier: SponsorshipTier;
  sponsors: SponsorSummary[];
}

export interface SponsorshipApplicationReceipt {
  id: string;
  submittedAt: string;
}

export interface ManagedSponsor {
  id: string;
  name: string;
  tier: SponsorshipTier;
  websiteUrl: string | null;
  faviconUpdatedAt: string | null;
  displayOrder: number;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SponsorshipApplicationSummary {
  id: string;
  organizationName: string;
  contactName: string;
  email: string;
  websiteUrl: string | null;
  tier: SponsorshipTier;
  message: string | null;
  status: SponsorshipApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface SponsorshipApplicationsPage {
  applications: SponsorshipApplicationSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  isGlobalAdmin: boolean;
  acknowledgedTourIds: string[];
  createdAt: string;
}

export interface GlobalAdminUserSummary {
  id: string;
  email: string;
  name: string;
  isGlobalAdmin: boolean;
  disabledAt: string | null;
  lastSignedInAt: string | null;
  teamCount: number;
  apiTokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalAdminUsersPage {
  users: GlobalAdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface GlobalAdminStatistics {
  totalUsers: number;
  enabledUsers: number;
  disabledUsers: number;
  globalAdministrators: number;
  signedInUsers30d: number;
  teams: number;
  resources: number;
  checks: number;
  openIncidents: number;
  pendingSponsorshipApplications: number;
  publishedSponsors: number;
  registrations: Array<{ date: string; count: number }>;
}

export interface PlatformSettings {
  registrationEnabled: boolean;
  sponsorshipApplicationsEnabled: boolean;
  sponsorshipApplicationRetentionDays: number;
  revision: number;
  updatedAt: string;
}

export type GlobalAuditEventSummary = AuditEventSummary;

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  role: TeamRole;
  createdAt: string;
}

export interface TeamInvitationSummary {
  id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  status: "pending" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: UserSummary;
  teams: TeamSummary[];
}

export interface ResourceSummary {
  id: string;
  teamId: string;
  name: string;
  kind: ResourceKind;
  description: string | null;
  tags: string[];
  agent: ResourceAgentSummary | null;
  status: CheckStatus;
  checksUp: number;
  checksTotal: number;
  lastCheckedAt: string | null;
  inMaintenance: boolean;
  imageUpdatedAt: string | null;
  createdAt: string;
}

export interface ResourceAgentSummary {
  id: string;
  kind: AgentKind;
  status: AgentStatus;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
}

export interface HttpCheckTarget {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  secretHeaderName?: string;
  body?: string;
}

export const httpJsonAssertionOperators = [
  "equals",
  "notEquals",
  "contains",
  "exists",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;
export type HttpJsonAssertionOperator = (typeof httpJsonAssertionOperators)[number];

export interface HttpJsonAssertion {
  kind: "assertion";
  name: string;
  pointer: string;
  operator: HttpJsonAssertionOperator;
  expectedValue?: string | number | boolean | null;
}

export interface HttpJsonAssertionGroup {
  kind: "group";
  operator: "and" | "or";
  conditions: HttpJsonAssertionNode[];
}

export type HttpJsonAssertionNode = HttpJsonAssertion | HttpJsonAssertionGroup;

export interface HttpCheckConfig {
  target: HttpCheckTarget;
  expectedStatuses: number[];
  responseContains?: string;
  expectedHeaders?: Record<string, string>;
  jsonAssertions?: HttpJsonAssertionGroup;
  latencyWarningMs?: number;
  certificateWarningDays?: number;
  followRedirects: boolean;
  validateTls: boolean;
}

export interface TcpCheckConfig {
  target: {
    host: string;
    port: number;
  };
}

export interface DnsCheckConfig {
  target: {
    hostname: string;
  };
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "NS" | "SRV" | "TXT";
  expectedValue?: string;
}

export interface IcmpCheckConfig {
  target: {
    host: string;
  };
  packetCount: number;
  minimumSuccessPercent: number;
  latencyWarningMs?: number;
}

export interface WanCheckConfig {
  targets: Array<{
    name: string;
    host: string;
  }>;
  requiredSuccessfulTargets: number;
  packetCount: number;
  latencyWarningMs?: number;
}

export interface HostCheckConfig {
  cpuWarningPercent: number;
  cpuCriticalPercent: number;
  memoryWarningPercent: number;
  memoryCriticalPercent: number;
  loadWarning?: number;
  loadCritical?: number;
  swapWarningPercent: number;
  swapCriticalPercent: number;
  storage: Array<{
    mount: string;
    warningPercent: number;
    criticalPercent: number;
  }>;
}

export interface DockerCheckConfig {
  containerNamePattern?: string;
  requireHealthy: boolean;
  requireRunning: boolean;
  maximumRestarts: number;
  cpuWarningPercent: number;
  memoryWarningPercent: number;
}

export const databaseEngines = ["postgresql", "mysql", "redis"] as const;
export type DatabaseEngine = (typeof databaseEngines)[number];

export interface DatabaseCheckConfig {
  target: {
    engine: DatabaseEngine;
    host: string;
    port: number;
    database?: string;
    username?: string;
    tls: boolean;
  };
  connectionWarningPercent: number;
  replicationLagWarningSeconds?: number;
  slowQueryWarningCount?: number;
  query?: {
    statement: string;
    expectedValue?: string | number | boolean | null;
  };
}

export type CheckConfig =
  | HttpCheckConfig
  | TcpCheckConfig
  | DnsCheckConfig
  | IcmpCheckConfig
  | WanCheckConfig
  | HostCheckConfig
  | DockerCheckConfig
  | DatabaseCheckConfig;

export type CheckExecution = { kind: "direct" } | { kind: "agent"; agentId: string };

export interface CheckSummary {
  id: string;
  resourceId: string;
  teamId: string;
  name: string;
  type: CheckType;
  status: CheckStatus;
  enabled: boolean;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  config: CheckConfig;
  execution: CheckExecution;
  secretConfigured: boolean;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastLatencyMs: number | null;
  latestMetrics: Record<string, number | string | boolean | null>;
  uptime24h: number | null;
  uptime30d: number | null;
  createdAt: string;
}

export interface CheckResult {
  id: string;
  checkId: string;
  status: Exclude<CheckStatus, "pending" | "paused">;
  latencyMs: number | null;
  statusCode: number | null;
  message: string | null;
  metrics: Record<string, number | string | boolean | null>;
  checkedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: IncidentStatus;
  message: string;
  createdByName: string | null;
  createdAt: string;
}

export interface IncidentResource {
  id: string;
  name: string;
}

export interface IncidentSummary {
  id: string;
  teamId: string;
  source: "automatic" | "manual";
  checkId: string | null;
  heartbeatId: string | null;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  durationSeconds: number;
  resources: IncidentResource[];
  updates: IncidentUpdate[];
}

export interface MaintenanceWindowSummary {
  id: string;
  teamId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  recurrence: MaintenanceRecurrence;
  recurrenceUntil: string | null;
  status: "scheduled" | "active" | "completed" | "cancelled";
  nextStartsAt: string | null;
  nextEndsAt: string | null;
  suppressNotifications: boolean;
  resources: IncidentResource[];
  createdAt: string;
}

export interface NotificationChannelSummary {
  id: string;
  teamId: string;
  name: string;
  type: NotificationChannelType;
  target: string;
  recipientUserIds: string[];
  enabled: boolean;
  lastDeliveryStatus: "pending" | "delivered" | "failed" | null;
  lastDeliveredAt: string | null;
  createdAt: string;
}

export interface NotificationPolicySummary {
  id: string;
  teamId: string;
  name: string;
  events: NotificationEvent[];
  condition: NotificationConditionGroup;
  channelIds: string[];
  channelNames: string[];
  enabled: boolean;
  createdAt: string;
}

export interface NotificationDeliverySummary {
  id: string;
  channelId: string;
  channelName: string;
  event: NotificationEvent;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface NotificationEndpointSummary {
  id: string;
  platform: NotificationEndpointPlatform;
  status: "active" | "invalid";
  lastSeenAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface NotificationPushCapabilities {
  endpoints: NotificationEndpointSummary[];
  web: {
    available: boolean;
    vapidPublicKey: string | null;
  };
  android: {
    available: boolean;
  };
}

export interface StatusPageSummary {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  published: boolean;
  showUptime: boolean;
  resourceIds: string[];
  subscriberCount: number;
  createdAt: string;
}

export interface StatusPageSubscriberSummary {
  id: string;
  email: string;
  status: "pending" | "verified";
  verifiedAt: string | null;
  createdAt: string;
}

export interface StatusPageComponent {
  id: string;
  name: string;
  status: CheckStatus | "maintenance";
  uptime30d: number | null;
  dailyUptime: Array<{ date: string; uptime: number | null }>;
}

export interface PublicIncidentSummary {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  resources: string[];
  updates: Array<{
    id: string;
    status: IncidentStatus;
    message: string;
    createdAt: string;
  }>;
}

export interface PublicMaintenanceWindow {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  recurrence: MaintenanceRecurrence;
  status: MaintenanceWindowSummary["status"];
  nextStartsAt: string | null;
  nextEndsAt: string | null;
  resources: string[];
}

export interface PublicStatusPage {
  name: string;
  slug: string;
  state: "operational" | "degraded" | "outage" | "maintenance";
  showUptime: boolean;
  subscriptionsEnabled: boolean;
  components: StatusPageComponent[];
  incidents: PublicIncidentSummary[];
  maintenance: PublicMaintenanceWindow[];
  updatedAt: string;
}

interface DashboardItemBase {
  id: string;
  title: string;
  width: DashboardWidth;
}

export interface DashboardMetricItem extends DashboardItemBase {
  type: "metric";
  metric: DashboardMetric;
  resourceId: string | null;
  windowDays: DashboardWindowDays;
}

export interface DashboardUptimeItem extends DashboardItemBase {
  type: "uptime";
  resourceId: string;
  windowDays: Exclude<DashboardWindowDays, 1>;
}

export interface DashboardStatusItem extends DashboardItemBase {
  type: "status";
  resourceId: string;
}

export interface DashboardIncidentsItem extends DashboardItemBase {
  type: "incidents";
  resourceId: string | null;
  limit: DashboardIncidentLimit;
}

export type DashboardItem =
  | DashboardMetricItem
  | DashboardUptimeItem
  | DashboardStatusItem
  | DashboardIncidentsItem;

export interface DashboardSummary {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  accessMode: DashboardAccessMode;
  hasAccessKey: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardConfiguration extends DashboardSummary {
  items: DashboardItem[];
}

export interface DashboardMutationResult {
  dashboard: DashboardConfiguration;
  accessKey: string | null;
}

interface DashboardViewItemBase {
  id: string;
  title: string;
  width: DashboardWidth;
}

export interface DashboardMetricViewItem extends DashboardViewItemBase {
  type: "metric";
  metric: DashboardMetric;
  windowDays: DashboardWindowDays;
  resourceName: string | null;
  value: number | null;
  format: "percent" | "milliseconds" | "count" | "number";
  series: Array<{ observedAt: string; value: number }>;
}

export interface DashboardUptimeViewItem extends DashboardViewItemBase {
  type: "uptime";
  windowDays: Exclude<DashboardWindowDays, 1>;
  resourceName: string;
  uptime: number | null;
  dailyUptime: Array<{ date: string; uptime: number | null }>;
}

export interface DashboardStatusViewItem extends DashboardViewItemBase {
  type: "status";
  resourceName: string;
  status: CheckStatus;
}

export interface DashboardIncidentsViewItem extends DashboardViewItemBase {
  type: "incidents";
  resourceName: string | null;
  incidents: Array<{
    id: string;
    title: string;
    impact: IncidentImpact;
    status: IncidentStatus;
    startedAt: string;
    resolvedAt: string | null;
    resources: string[];
  }>;
}

export type DashboardViewItem =
  | DashboardMetricViewItem
  | DashboardUptimeViewItem
  | DashboardStatusViewItem
  | DashboardIncidentsViewItem;

export interface DashboardView {
  name: string;
  slug: string;
  items: DashboardViewItem[];
  updatedAt: string;
}

export interface ServiceLevelObjectiveSummary {
  id: string;
  teamId: string;
  resourceId: string | null;
  resourceName: string | null;
  checkId: string | null;
  checkName: string | null;
  name: string;
  targetPercent: number;
  windowDays: 7 | 30 | 90;
  latencyTargetMs: number | null;
  availabilityPercent: number | null;
  latencyP95Ms: number | null;
  errorBudgetMinutes: number;
  consumedBudgetMinutes: number;
  remainingBudgetMinutes: number;
  burnRate: number;
  status: "met" | "at-risk" | "breached" | "no-data";
  createdAt: string;
}

export interface TechnologyObservation {
  id: string;
  resourceId: string;
  name: string;
  category: "runtime" | "framework" | "database" | "proxy" | "container" | "protocol" | "other";
  version: string | null;
  source: "http" | "agent";
  lastSeenAt: string;
}

export interface AnalyticsReport {
  from: string;
  to: string;
  totalResults: number;
  availabilityPercent: number | null;
  degradedPercent: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  meanTimeToRecoverySeconds: number | null;
  meanTimeBetweenFailuresSeconds: number | null;
  incidentCount: number;
  daily: Array<{
    date: string;
    up: number;
    degraded: number;
    down: number;
    availabilityPercent: number | null;
    averageLatencyMs: number | null;
  }>;
}

export interface AuditEventSummary {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  metadata: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
}

export interface AgentSummary {
  id: string;
  resourceId: string;
  resourceName: string;
  teamId: string;
  kind: AgentKind;
  collectionIntervalSeconds: number;
  status: AgentStatus;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  capabilities: AgentCapability[];
  deviceStatus: MobileDeviceStatus | null;
  createdAt: string;
}

export interface AgentEnrollment {
  agentId: string;
  resourceId: string;
  resourceName: string;
  kind: AgentKind;
  collectionIntervalSeconds: number;
}

export const mobileBatteryPowerSources = [
  "none",
  "ac",
  "usb",
  "wireless",
  "dock",
  "unknown",
] as const;
export type MobileBatteryPowerSource = (typeof mobileBatteryPowerSources)[number];

export const mobileBatteryHealthValues = [
  "good",
  "overheat",
  "dead",
  "over-voltage",
  "failure",
  "cold",
  "unknown",
] as const;
export type MobileBatteryHealth = (typeof mobileBatteryHealthValues)[number];

export const mobileNetworkTransports = [
  "none",
  "wifi",
  "cellular",
  "ethernet",
  "bluetooth",
  "vpn",
  "other",
] as const;
export type MobileNetworkTransport = (typeof mobileNetworkTransports)[number];

export const mobileThermalStatuses = [
  "none",
  "light",
  "moderate",
  "severe",
  "critical",
  "emergency",
  "shutdown",
] as const;
export type MobileThermalStatus = (typeof mobileThermalStatuses)[number];

export interface MobileDeviceStatus {
  schemaVersion: 1;
  observedAt: string;
  device: {
    manufacturer: string;
    model: string;
    androidRelease: string;
    apiLevel: number;
    securityPatch: string | null;
  };
  agent: {
    appVersion: string;
    buildNumber: number;
  };
  uptimeSeconds: number;
  battery: {
    percent: number | null;
    charging: boolean | null;
    powerSource: MobileBatteryPowerSource;
    health: MobileBatteryHealth | null;
    temperatureCelsius: number | null;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    lowMemory: boolean;
  };
  storage: {
    totalBytes: number;
    availableBytes: number;
  };
  connectivity: {
    connected: boolean;
    internetValidated: boolean;
    metered: boolean;
    roaming: boolean | null;
    vpn: boolean;
    transport: MobileNetworkTransport;
  };
  power: {
    batterySaver: boolean;
    deviceIdle: boolean;
    backgroundRestricted: boolean | null;
  };
  thermalStatus: MobileThermalStatus | null;
}

export interface MobileDeviceStatusResponse {
  acceptedAt: string;
  collectionIntervalSeconds: number;
}

export interface HostSnapshot {
  snapshotId: string;
  hostname: string;
  platform: string;
  version: string;
  uptimeSeconds: number;
  cpuPercent: number;
  loadAverage: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  processCount: number;
  networkReceivedBytes: number;
  networkTransmittedBytes: number;
  disks: Array<{
    mount: string;
    usedBytes: number;
    totalBytes: number;
  }>;
  technologies: Array<{
    name: string;
    category: TechnologyObservation["category"];
    version: string | null;
  }>;
  containerRuntime: ContainerRuntimeSnapshot | null;
  observedAt: string;
}

export interface ContainerRuntimeSnapshot {
  engineVersion: string;
  containers: ContainerSnapshot[];
}

export interface ContainerSnapshot {
  id: string;
  name: string;
  image: string;
  state: "created" | "running" | "paused" | "restarting" | "exited" | "dead" | "unknown";
  health: "healthy" | "unhealthy" | "starting" | "none";
  restartCount: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  networkReceivedBytes: number;
  networkTransmittedBytes: number;
  blockReadBytes: number;
  blockWrittenBytes: number;
  composeProject: string | null;
  composeService: string | null;
  ports: string[];
  startedAt: string | null;
}

export const resourceMetricNames = [
  "cpuPercent",
  "memoryPercent",
  "storagePercent",
  "loadAverage",
  "batteryPercent",
  "batteryTemperatureCelsius",
  "containerCount",
  "unhealthyContainerCount",
] as const;
export type ResourceMetricName = (typeof resourceMetricNames)[number];

export interface ResourceMetricPoint {
  observedAt: string;
  value: number;
}

export interface ResourceMetricSeries {
  metric: ResourceMetricName;
  points: ResourceMetricPoint[];
}

export const resourceAlertMetrics = [
  ...resourceMetricNames,
  "internetAvailable",
  "lowMemory",
  "backgroundRestricted",
] as const;
export type ResourceAlertMetric = (typeof resourceAlertMetrics)[number];

export const resourceAlertOperators = [
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "equals",
] as const;
export type ResourceAlertOperator = (typeof resourceAlertOperators)[number];

export interface ResourceAlertRuleSummary {
  id: string;
  resourceId: string;
  name: string;
  metric: ResourceAlertMetric;
  operator: ResourceAlertOperator;
  threshold: number | boolean;
  recoveryThreshold: number | boolean | null;
  requiredSamples: number;
  enabled: boolean;
  active: boolean;
  lastEvaluatedAt: string | null;
  triggeredAt: string | null;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  checkId: string;
  type: CheckType;
  timeoutMs: number;
  config: CheckConfig;
  secret: string | null;
  faviconRequestId: string | null;
  issuedAt: string;
}

export interface AgentPollResponse {
  collectionIntervalSeconds: number;
  collectHostTelemetry: boolean;
  tasks: AgentTask[];
}

export interface AgentTaskResult {
  taskId: string;
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
  statusCode: number | null;
  message: string | null;
  metrics: Record<string, number | string | boolean | null>;
  checkedAt: string;
  favicon?:
    | { requestId: string; status: "retrieved"; dataBase64: string }
    | { requestId: string; status: "failed"; message: string };
}

export type ResourceFaviconRefresh =
  | { status: "updated"; imageUpdatedAt: string }
  | { status: "queued"; imageUpdatedAt: null };

export interface AgentHeartbeatResponse {
  acceptedAt: string;
  acceptedSnapshots: number;
  acceptedResults: number;
}

export const heartbeatEventTypes = ["started", "succeeded", "failed", "missed"] as const;
export type HeartbeatEventType = (typeof heartbeatEventTypes)[number];

export interface HeartbeatMonitorSummary {
  id: string;
  teamId: string;
  resourceId: string;
  resourceName: string;
  name: string;
  status: CheckStatus;
  enabled: boolean;
  intervalSeconds: number;
  graceSeconds: number;
  maxRuntimeSeconds: number | null;
  lastPingAt: string | null;
  lastStartedAt: string | null;
  runningSince: string | null;
  nextExpectedAt: string | null;
  nextDeadlineAt: string | null;
  lastDurationMs: number | null;
  lastMessage: string | null;
  runs30d: number;
  successfulRuns30d: number;
  successRate30d: number | null;
  averageDurationMs30d: number | null;
  createdAt: string;
}

export interface CreatedHeartbeatMonitor {
  heartbeat: HeartbeatMonitorSummary;
  pingToken: string;
  pingUrl: string;
}

export interface HeartbeatEventSummary {
  id: string;
  heartbeatId: string;
  type: HeartbeatEventType;
  durationMs: number | null;
  message: string | null;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: string;
  receivedAt: string;
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiToken {
  apiToken: ApiTokenSummary;
  token: string;
}

export interface OverviewAnalytics {
  resources: number;
  checks: number;
  heartbeats: number;
  heartbeatsUp: number;
  heartbeatsDown: number;
  up: number;
  degraded: number;
  down: number;
  paused: number;
  uptime24h: number | null;
  uptime30d: number | null;
  averageLatencyMs: number | null;
  openIncidents: number;
  activeMaintenance: number;
  breachedObjectives: number;
  statusTimeline: Array<{ bucket: string; up: number; degraded: number; down: number }>;
  latencyTimeline: Array<{ bucket: string; latencyMs: number }>;
  incidents: IncidentSummary[];
}
