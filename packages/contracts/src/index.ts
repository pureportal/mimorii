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
  collectors: "/app/monitoring/collectors",
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

export const resourceKinds = ["server", "service", "endpoint"] as const;
export type ResourceKind = (typeof resourceKinds)[number];

export const checkTypes = ["http", "tcp", "dns", "host", "disk"] as const;
export type CheckType = (typeof checkTypes)[number];

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

export const collectorKinds = ["desktop", "mobile"] as const;
export type CollectorKind = (typeof collectorKinds)[number];

export const collectorCapabilities = [...checkTypes, "device-status"] as const;
export type CollectorCapability = (typeof collectorCapabilities)[number];

export const collectorCapabilitiesByKind = {
  desktop: checkTypes,
  mobile: ["device-status"],
} as const satisfies Record<CollectorKind, readonly CollectorCapability[]>;

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

export const sponsorImageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const sponsorImageMaxBytes = 5 * 1024 * 1024;
export const sponsorImageMaxDimension = 4096;

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
  target: string;
  description: string | null;
  tags: string[];
  agentId: string | null;
  status: CheckStatus;
  checksUp: number;
  checksTotal: number;
  lastCheckedAt: string | null;
  inMaintenance: boolean;
  createdAt: string;
}

export interface HttpCheckConfig {
  url: string;
  method: "GET" | "HEAD";
  expectedStatuses: number[];
  responseContains?: string;
  expectedHeaders?: Record<string, string>;
  jsonPointer?: string;
  expectedJsonValue?: string | number | boolean | null;
  latencyWarningMs?: number;
  certificateWarningDays?: number;
  followRedirects: boolean;
  validateTls: boolean;
}

export interface TcpCheckConfig {
  host: string;
  port: number;
}

export interface DnsCheckConfig {
  hostname: string;
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "NS" | "SRV" | "TXT";
  expectedValue?: string;
}

export interface HostCheckConfig {
  cpuWarningPercent: number;
  cpuCriticalPercent: number;
  memoryWarningPercent: number;
  memoryCriticalPercent: number;
  loadWarning: number;
  loadCritical: number;
  swapWarningPercent: number;
  swapCriticalPercent: number;
}

export interface DiskCheckConfig {
  mount: string;
  warningPercent: number;
  criticalPercent: number;
}

export type CheckConfig =
  | HttpCheckConfig
  | TcpCheckConfig
  | DnsCheckConfig
  | HostCheckConfig
  | DiskCheckConfig;

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
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastLatencyMs: number | null;
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
  format: "percent" | "milliseconds" | "count";
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
  teamId: string;
  name: string;
  kind: CollectorKind;
  collectionIntervalSeconds: number;
  status: AgentStatus;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  capabilities: CollectorCapability[];
  deviceStatus: MobileDeviceStatus | null;
  createdAt: string;
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
  collector: {
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
  observedAt: string;
}

export interface AgentTask {
  id: string;
  checkId: string;
  type: CheckType;
  timeoutMs: number;
  config: CheckConfig;
  issuedAt: string;
}

export interface AgentPollResponse {
  collectionIntervalSeconds: number;
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
}

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
